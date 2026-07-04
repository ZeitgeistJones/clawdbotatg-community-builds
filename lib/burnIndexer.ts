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
/** Blocks to scan per backfill invocation (avoids serverless timeout) */
const BACKFILL_MAX_BLOCKS = 500n

export const BURNS_TOTAL_KEY = 'burns:total'
export const RESCORES_TOTAL_KEY = 'burns:rescores:total'

const lastBlockKey = (projectId: string) => `burns:lastBlock:${projectId}`
const scanCursorKey = (projectId: string) => `burns:scanCursor:${projectId}`
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
    const chunk = await client.getLogs({
      address: CLAWD_TOKEN,
      event: TRANSFER_EVENT,
      args: { from, to: DEAD_ADDRESS },
      fromBlock: start,
      toBlock: end,
    })
    logs.push(...chunk)
    start = end + 1n
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

async function fetchRescorePayments(
  receiver: `0x${string}`,
  paymentWei: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<AssetTransfer[]> {
  const rpc = getRpcUrl()
  const results: AssetTransfer[] = []
  let pageKey: string | undefined

  do {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [{
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          toAddress: receiver,
          category: ['external'],
          withMetadata: false,
          maxCount: '0x3e8',
          ...(pageKey ? { pageKey } : {}),
        }],
      }),
    })
    const json = await res.json()
    if (json.error) {
      // Fallback: scan blocks if Alchemy transfers API unavailable
      return scanBlocksForRescores(receiver, paymentWei, fromBlock, toBlock)
    }
    const transfers: AssetTransfer[] = json.result?.transfers || []
    results.push(...transfers)
    pageKey = json.result?.pageKey
  } while (pageKey)

  return results.filter(t =>
    t.category === 'external' &&
    t.value != null &&
    BigInt(Math.round(t.value * 1e18)) === paymentWei,
  )
}

async function scanBlocksForRescores(
  receiver: `0x${string}`,
  paymentWei: bigint,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<AssetTransfer[]> {
  const client = getClient()
  const matches: AssetTransfer[] = []

  for (let b = fromBlock; b <= toBlock; b++) {
    const block = await client.getBlock({ blockNumber: b, includeTransactions: true })
    for (const tx of block.transactions) {
      if (typeof tx === 'string') continue
      if (
        tx.to?.toLowerCase() === receiver.toLowerCase() &&
        tx.value === paymentWei &&
        (tx.input === '0x' || tx.input === '0x0')
      ) {
        matches.push({ hash: tx.hash, value: Number(tx.value) / 1e18, category: 'external' })
      }
    }
  }

  return matches
}

async function processRescores(projectId: string, payments: AssetTransfer[]) {
  let newRescores = 0

  for (const p of payments) {
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
  const paymentWei = config.rescorePaymentWei || 8000000000000n

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
      newRescores: 0,
      scannedFrom: Number(fromBlock),
      scannedTo: Number(latestBlock),
      scanComplete: true,
    }
  }

  // CLAWD burned: pool→dead and receiver sweep→dead, only in execute() txs
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

  // Rescore payments: ETH deposits to receiver (no burn in same tx)
  const rescorePayments = await fetchRescorePayments(
    config.receiverAddress,
    paymentWei,
    fromBlock,
    toBlock,
  )
  const newRescores = await processRescores(project.id, rescorePayments)

  const scanComplete = toBlock >= latestBlock

  if (options?.fullBackfill) {
    if (scanComplete) {
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
    scanComplete,
  }
}

export async function syncAllBurns(options?: { fullBackfill?: boolean }): Promise<SyncResult[]> {
  const projects = await getApproved()
  const results: SyncResult[] = []

  for (const project of projects) {
    const result = await syncProjectBurns(project, options)
    if (result) results.push(result)
  }

  return results
}
