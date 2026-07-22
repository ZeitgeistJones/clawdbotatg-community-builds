import { createPublicClient, http, parseAbiItem, formatUnits, type Hash } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@/lib/kv'
import { getApproved, type Project } from '@/lib/projects'
import {
  CLAWD_TOKEN,
  DEAD_ADDRESS,
  ZERO_ADDRESS,
  resolveBurnConfig,
  type BurnConfig,
} from '@/lib/burnConfig'

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

/** Public RPC limits eth_getLogs range — keep chunks small */
const BLOCK_CHUNK = 10n
/** Small batch — one click = ~6 log queries */
const BACKFILL_MAX_BLOCKS = 30n
const RESCORE_PAYMENT_WEI = 8000000000000n
const RPC_DELAY_MS = 400

export const BURNS_TOTAL_KEY = 'burns:total'
export const BURNS_LAST_UPDATED_KEY = 'burns:lastUpdated'
export const RESCORES_TOTAL_KEY = 'burns:rescores:total'

const lastBlockKey = (projectId: string) => `burns:lastBlock:${projectId}`
const scanCursorKey = (projectId: string) => `burns:scanCursor:${projectId}`
const rescorePageKey = (projectId: string) => `burns:rescorePage:${projectId}`
const byAppKey = (projectId: string) => `burns:by-app:${projectId}`
const rescoresByAppKey = (projectId: string) => `burns:rescores:by-app:${projectId}`
const burnTxKey = (projectId: string) => `burns:burnTxs:${projectId}`
const rescoreTxKey = (projectId: string) => `burns:rescoreTxs:${projectId}`

function getPublicRpcUrl() {
  return process.env.BASE_PUBLIC_RPC_URL || 'https://mainnet.base.org'
}

function getPublicClient() {
  return createPublicClient({ chain: base, transport: http(getPublicRpcUrl()) })
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export function formatClawdAmount(wei: bigint): string {
  const n = Number(formatUnits(wei, 18))
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

export async function getBurnTotal(): Promise<{ wei: bigint; formatted: string }> {
  const raw = await kv.get<string>(BURNS_TOTAL_KEY)
  const wei = BigInt(raw || '0')
  return { wei, formatted: formatClawdAmount(wei) }
}

export async function getBurnLastUpdated(): Promise<number | null> {
  return (await kv.get<number>(BURNS_LAST_UPDATED_KEY)) || null
}

export async function getRescoreTotal(): Promise<number> {
  return (await kv.get<number>(RESCORES_TOTAL_KEY)) || 0
}

export async function getBurnByApp(projectId: string): Promise<bigint> {
  const raw = await kv.get<string>(byAppKey(projectId))
  return BigInt(raw || '0')
}

export async function getRescoresByApp(projectId: string): Promise<number> {
  return (await kv.get<number>(rescoresByAppKey(projectId))) || 0
}

export interface SyncResult {
  projectId: string
  name: string
  newBurns: bigint
  newRescores: number
  scannedFrom: number
  scannedTo: number
  scanComplete: boolean
  rescoreWarning?: string
}

async function fetchLogsForFrom(
  client: ReturnType<typeof getPublicClient>,
  from: `0x${string}`,
  toAddresses: readonly `0x${string}`[],
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = []
  let start = fromBlock

  while (start <= toBlock) {
    const end = start + BLOCK_CHUNK - 1n > toBlock ? toBlock : start + BLOCK_CHUNK - 1n
    let attempts = 0
    while (attempts < 4) {
      try {
        const chunk = await client.getLogs({
          address: CLAWD_TOKEN,
          event: TRANSFER_EVENT,
          args: { from, to: toAddresses as `0x${string}`[] },
          fromBlock: start,
          toBlock: end,
        })
        logs.push(...chunk)
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('429') || msg.includes('Rate') || msg.includes('limit')) {
          attempts++
          await sleep(3000 * attempts)
          continue
        }
        throw err
      }
    }
    if (attempts >= 4) throw new Error('Rate limited on log scan — wait a few minutes')
    start = end + 1n
    await sleep(RPC_DELAY_MS)
  }

  return logs
}

async function isExecuteTx(
  client: ReturnType<typeof getPublicClient>,
  hash: Hash,
  receiver: `0x${string}`,
  executeSelector: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  if (cache.has(hash)) return cache.get(hash)!
  const tx = await client.getTransaction({ hash })
  const ok =
    tx.to?.toLowerCase() === receiver.toLowerCase() &&
    tx.input.toLowerCase().startsWith(executeSelector.toLowerCase())
  cache.set(hash, ok)
  return ok
}

async function processClawdBurnLogs(
  client: ReturnType<typeof getPublicClient>,
  projectId: string,
  logs: Awaited<ReturnType<typeof fetchLogsForFrom>>,
  receiver: `0x${string}`,
  executeSelector: string,
  mode: 'execute' | 'direct',
) {
  const executeCache = new Map<string, boolean>()
  let newBurns = 0n

  for (const log of logs) {
    const txHash = log.transactionHash
    const dedupKey = `${txHash}:${log.logIndex}`
    if (await kv.sismember(burnTxKey(projectId), dedupKey)) continue

    if (mode === 'execute') {
      const isExecute = await isExecuteTx(client, txHash, receiver, executeSelector, executeCache)
      if (!isExecute) continue
    }
    // 'direct' mode: any Transfer from this address straight to a burn destination counts —
    // no execute() selector to check, since third-party apps don't use that mechanic.

    newBurns += log.args.value ?? 0n
    await kv.sadd(burnTxKey(projectId), dedupKey)
  }

  if (newBurns > 0n) {
    const appTotal = BigInt((await kv.get<string>(byAppKey(projectId))) || '0') + newBurns
    const hubTotal = BigInt((await kv.get<string>(BURNS_TOTAL_KEY)) || '0') + newBurns
    await kv.set(byAppKey(projectId), appTotal.toString())
    await kv.set(BURNS_TOTAL_KEY, hubTotal.toString())
  }

  return newBurns
}

interface ExplorerTx {
  hash: string
  to: string
  value: string
  isError?: string
}

function getExplorerApiKey() {
  return process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY || ''
}

/** Etherscan API v2 (Base chainid 8453) — replaces deprecated basescan.org v1 */
async function fetchEtherscanTxPage(
  receiver: string,
  startBlock: bigint,
  page: number,
): Promise<ExplorerTx[]> {
  const params = new URLSearchParams({
    chainid: '8453',
    module: 'account',
    action: 'txlist',
    address: receiver,
    startblock: startBlock.toString(),
    endblock: '99999999',
    page: page.toString(),
    offset: '1000',
    sort: 'asc',
  })
  const apiKey = getExplorerApiKey()
  if (apiKey) params.set('apikey', apiKey)

  const res = await fetch(`https://api.etherscan.io/v2/api?${params}`)
  const json = await res.json() as {
    status: string
    message: string
    result: ExplorerTx[] | string
  }

  if (json.status !== '1') {
    if (json.message === 'No transactions found') return []
    const detail = typeof json.result === 'string' ? json.result : json.message
    throw new Error(detail || 'Etherscan API error')
  }
  return Array.isArray(json.result) ? json.result : []
}

interface BlockscoutTx {
  hash: string
  to: { hash: string } | null
  value: string
  status: string
  block_number: number
}

/** Blockscout — no API key, good fallback when Etherscan rate-limits */
async function fetchBlockscoutTxs(
  receiver: string,
  startBlock: bigint,
): Promise<ExplorerTx[]> {
  const out: ExplorerTx[] = []
  let url: string | null =
    `https://base.blockscout.com/api/v2/addresses/${receiver}/transactions?filter=to`

  while (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`)
    const json = await res.json() as {
      items?: BlockscoutTx[]
      next_page_params?: { block_number: number; index: number; items_count: number }
    }

    for (const tx of json.items || []) {
      if (tx.block_number < Number(startBlock)) continue
      out.push({
        hash: tx.hash,
        to: tx.to?.hash || '',
        value: tx.value,
        isError: tx.status === 'ok' ? '0' : '1',
      })
    }

    const next = json.next_page_params
    if (!next) break
    url = `https://base.blockscout.com/api/v2/addresses/${receiver}/transactions?filter=to&block_number=${next.block_number}&index=${next.index}&items_count=${next.items_count}`
    await sleep(200)
  }

  return out
}

async function fetchAllIncomingTxs(
  receiver: string,
  startBlock: bigint,
): Promise<ExplorerTx[]> {
  try {
    const all: ExplorerTx[] = []
    for (let page = 1; page <= 10; page++) {
      const batch = await fetchEtherscanTxPage(receiver, startBlock, page)
      if (batch.length === 0) break
      all.push(...batch)
      if (batch.length < 1000) return all
      await sleep(250)
    }
    return all
  } catch (err) {
    console.warn('Etherscan failed, trying Blockscout:', err)
    return fetchBlockscoutTxs(receiver, startBlock)
  }
}

async function syncRescoresFromExplorer(
  projectId: string,
  receiver: `0x${string}`,
  paymentWei: bigint,
  startBlock: bigint,
): Promise<number> {
  const state = await kv.get<string>(rescorePageKey(projectId))
  if (state === 'done') return 0

  const paymentStr = paymentWei.toString()
  const receiverLower = receiver.toLowerCase()
  let newRescores = 0

  const txs = await fetchAllIncomingTxs(receiver, startBlock)

  for (const tx of txs) {
    if (tx.isError != null && tx.isError !== '0') continue
    if (tx.to.toLowerCase() !== receiverLower) continue
    if (tx.value !== paymentStr) continue
    if (await kv.sismember(rescoreTxKey(projectId), tx.hash)) continue
    newRescores += 1
    await kv.sadd(rescoreTxKey(projectId), tx.hash)
  }

  if (newRescores > 0) {
    const appTotal = ((await kv.get<number>(rescoresByAppKey(projectId))) || 0) + newRescores
    const hubTotal = ((await kv.get<number>(RESCORES_TOTAL_KEY)) || 0) + newRescores
    await kv.set(rescoresByAppKey(projectId), appTotal)
    await kv.set(RESCORES_TOTAL_KEY, hubTotal)
  }

  await kv.set(rescorePageKey(projectId), 'done')
  return newRescores
}

export async function syncProjectBurns(
  project: Project,
  options?: { fullBackfill?: boolean },
): Promise<SyncResult | null> {
  const config = resolveBurnConfig(project.url, (project as Project & { burnConfig?: BurnConfig }).burnConfig)
  if (!config) return null

  const mode = config.mode || 'execute'
  const client = getPublicClient()
  const latestBlock = await client.getBlockNumber()
  const startBlock = BigInt(config.startBlock ?? 0)
  const executeSelector = config.executeSelector || '0x61461954'
  const paymentWei = config.rescorePaymentWei || RESCORE_PAYMENT_WEI

  let newRescores = 0
  let rescoreWarning: string | undefined

  // Rescore tracking is a clawdbotatg-specific mechanic (paying to re-run a score) —
  // only makes sense in 'execute' mode, never for a third-party app's own burn flow.
  if (mode === 'execute' && options?.fullBackfill) {
    const pageState = await kv.get<string>(rescorePageKey(project.id))
    if (pageState !== 'done') {
      try {
        newRescores = await syncRescoresFromExplorer(
          project.id,
          config.receiverAddress,
          paymentWei,
          startBlock,
        )
      } catch (err) {
        rescoreWarning = err instanceof Error ? err.message : 'Rescore sync failed'
        console.error('rescore sync failed:', err)
      }
    }
  }

  let fromBlock: bigint
  let toBlock: bigint

  if (options?.fullBackfill) {
    const cursor = await kv.get<number>(scanCursorKey(project.id))
    fromBlock = cursor != null ? BigInt(cursor) : startBlock
    toBlock = fromBlock + BACKFILL_MAX_BLOCKS - 1n > latestBlock
      ? latestBlock
      : fromBlock + BACKFILL_MAX_BLOCKS - 1n
  } else {
    const cursor = await kv.get<number>(lastBlockKey(project.id))
    fromBlock = cursor != null ? BigInt(cursor + 1) : startBlock
    toBlock = latestBlock
  }

  if (fromBlock > latestBlock) {
    return {
      projectId: project.id,
      name: project.name,
      newBurns: 0n,
      newRescores,
      scannedFrom: Number(fromBlock),
      scannedTo: Number(latestBlock),
      scanComplete: true,
      rescoreWarning,
    }
  }

  const fromAddresses = [
    config.poolAddress,
    config.receiverAddress,
  ].filter(Boolean) as `0x${string}`[]

  // 'direct' mode also watches burns sent to the zero address, not just 0xdead —
  // third-party contracts aren't guaranteed to use the same destination clawdbotatg does.
  const toAddresses = mode === 'direct' ? [DEAD_ADDRESS, ZERO_ADDRESS] : [DEAD_ADDRESS]

  const allBurnLogs = []
  for (const from of fromAddresses) {
    const logs = await fetchLogsForFrom(client, from, toAddresses, fromBlock, toBlock)
    allBurnLogs.push(...logs)
    await sleep(RPC_DELAY_MS)
  }

  const newBurns = await processClawdBurnLogs(
    client,
    project.id,
    allBurnLogs,
    config.receiverAddress,
    executeSelector,
    mode,
  )

  const burnScanComplete = toBlock >= latestBlock

  if (options?.fullBackfill) {
    if (burnScanComplete) {
      await kv.del(scanCursorKey(project.id))
      await kv.set(lastBlockKey(project.id), Number(latestBlock))
    } else {
      await kv.set(scanCursorKey(project.id), Number(toBlock + 1n))
    }
  } else {
    await kv.set(lastBlockKey(project.id), Number(latestBlock))
  }

  return {
    projectId: project.id,
    name: project.name,
    newBurns,
    newRescores,
    scannedFrom: Number(fromBlock),
    scannedTo: Number(toBlock),
    scanComplete: burnScanComplete,
    rescoreWarning,
  }
}

export async function syncAllBurns(options?: { fullBackfill?: boolean }): Promise<SyncResult[]> {
  const projects = await getApproved()
  const results: SyncResult[] = []

  for (const project of projects) {
    const result = await syncProjectBurns(project, options)
    if (result) results.push(result)
  }

  if (results.length > 0) {
    await kv.set(BURNS_LAST_UPDATED_KEY, Date.now())
  }

  return results
}
