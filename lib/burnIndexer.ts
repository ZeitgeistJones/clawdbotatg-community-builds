import { createPublicClient, http, parseAbiItem, formatUnits, type Hash } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@/lib/kv'
import { getApproved, type Project } from '@/lib/projects'
import {
  CLAWD_TOKEN,
  DEAD_ADDRESS,
  resolveBurnConfig,
  type BurnConfig,
} from '@/lib/burnConfig'

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

/** Alchemy free tier limits eth_getLogs to 10 blocks per request */
const BLOCK_CHUNK = 10n
/** Blocks to scan per backfill batch for CLAWD burn logs */
const BACKFILL_MAX_BLOCKS = 200n
const RESCORE_PAYMENT_WEI = 8000000000000n

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

function getRpcUrl() {
  return process.env.BASE_RPC_URL || 'https://mainnet.base.org'
}

function getClient() {
  return createPublicClient({ chain: base, transport: http(getRpcUrl()) })
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function rpcPost(body: object, retries = 3): Promise<unknown> {
  const rpc = getRpcUrl()
  for (let i = 0; i < retries; i++) {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json() as { error?: { message?: string; code?: number }; result?: unknown }
    if (json.error?.code === 429 || res.status === 429) {
      await sleep(1000 * (i + 1))
      continue
    }
    if (json.error) throw new Error(json.error.message || 'RPC error')
    return json.result
  }
  throw new Error('Rate limited — wait a minute and click backfill again')
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
}

async function fetchLogsForFrom(
  client: ReturnType<typeof getClient>,
  from: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = []
  let start = fromBlock

  while (start <= toBlock) {
    const end = start + BLOCK_CHUNK - 1n > toBlock ? toBlock : start + BLOCK_CHUNK - 1n
    try {
      const chunk = await client.getLogs({
        address: CLAWD_TOKEN,
        event: TRANSFER_EVENT,
        args: { from, to: DEAD_ADDRESS },
        fromBlock: start,
        toBlock: end,
      })
      logs.push(...chunk)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('429') || msg.includes('Rate')) {
        await sleep(1500)
        continue
      }
      throw err
    }
    start = end + 1n
    await sleep(50)
  }

  return logs
}

async function isExecuteTx(
  client: ReturnType<typeof getClient>,
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
  client: ReturnType<typeof getClient>,
  projectId: string,
  logs: Awaited<ReturnType<typeof fetchLogsForFrom>>,
  receiver: `0x${string}`,
  executeSelector: string,
) {
  const executeCache = new Map<string, boolean>()
  let newBurns = 0n

  for (const log of logs) {
    const txHash = log.transactionHash
    const dedupKey = `${txHash}:${log.logIndex}`
    if (await kv.sismember(burnTxKey(projectId), dedupKey)) continue

    const isExecute = await isExecuteTx(client, txHash, receiver, executeSelector, executeCache)
    if (!isExecute) continue

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

interface AssetTransfer {
  hash: string
  value: number | null
  category: string
}

function isRescorePayment(t: AssetTransfer, paymentWei: bigint): boolean {
  if (t.category !== 'external' || t.value == null) return false
  const wei = BigInt(Math.round(t.value * 1e18))
  return wei === paymentWei
}

/** Paginated Alchemy transfers API — one page per sync call to avoid 429 */
async function syncRescorePage(
  projectId: string,
  receiver: `0x${string}`,
  paymentWei: bigint,
  startBlock: bigint,
  latestBlock: bigint,
): Promise<number> {
  const savedPage = await kv.get<string>(rescorePageKey(projectId))
  const pageKey = savedPage || undefined

  const result = await rpcPost({
    jsonrpc: '2.0',
    id: 1,
    method: 'alchemy_getAssetTransfers',
    params: [{
      fromBlock: `0x${startBlock.toString(16)}`,
      toBlock: `0x${latestBlock.toString(16)}`,
      toAddress: receiver,
      category: ['external'],
      withMetadata: false,
      maxCount: '0x64',
      ...(pageKey ? { pageKey } : {}),
    }],
  }) as { transfers?: AssetTransfer[]; pageKey?: string }

  const transfers = result?.transfers || []
  const rescores = transfers.filter(t => isRescorePayment(t, paymentWei))

  let newRescores = 0
  for (const p of rescores) {
    if (await kv.sismember(rescoreTxKey(projectId), p.hash)) continue
    newRescores += 1
    await kv.sadd(rescoreTxKey(projectId), p.hash)
  }

  if (newRescores > 0) {
    const appTotal = ((await kv.get<number>(rescoresByAppKey(projectId))) || 0) + newRescores
    const hubTotal = ((await kv.get<number>(RESCORES_TOTAL_KEY)) || 0) + newRescores
    await kv.set(rescoresByAppKey(projectId), appTotal)
    await kv.set(RESCORES_TOTAL_KEY, hubTotal)
  }

  if (result?.pageKey) {
    await kv.set(rescorePageKey(projectId), result.pageKey)
  } else {
    await kv.del(rescorePageKey(projectId))
  }

  return newRescores
}

export async function syncProjectBurns(
  project: Project,
  options?: { fullBackfill?: boolean },
): Promise<SyncResult | null> {
  const config = resolveBurnConfig(project.url, (project as Project & { burnConfig?: BurnConfig }).burnConfig)
  if (!config) return null

  const client = getClient()
  const latestBlock = await client.getBlockNumber()
  const startBlock = BigInt(config.startBlock ?? 0)
  const executeSelector = config.executeSelector || '0x61461954'
  const paymentWei = config.rescorePaymentWei || RESCORE_PAYMENT_WEI

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

  // Rescores: paginated transfers API (separate from block cursor)
  const newRescores = await syncRescorePage(
    project.id,
    config.receiverAddress,
    paymentWei,
    startBlock,
    latestBlock,
  )

  if (fromBlock > latestBlock) {
    return {
      projectId: project.id,
      name: project.name,
      newBurns: 0n,
      newRescores,
      scannedFrom: Number(fromBlock),
      scannedTo: Number(latestBlock),
      scanComplete: true,
    }
  }

  const fromAddresses = [
    config.poolAddress,
    config.receiverAddress,
  ].filter(Boolean) as `0x${string}`[]

  const allBurnLogs = (
    await Promise.all(
      fromAddresses.map(from => fetchLogsForFrom(client, from, fromBlock, toBlock)),
    )
  ).flat()

  const newBurns = await processClawdBurnLogs(
    client,
    project.id,
    allBurnLogs,
    config.receiverAddress,
    executeSelector,
  )

  const burnScanComplete = toBlock >= latestBlock
  const rescoreScanComplete = !(await kv.get(rescorePageKey(project.id)))

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
    scanComplete: burnScanComplete && rescoreScanComplete,
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
