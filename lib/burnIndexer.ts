import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem'
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
const lastBlockKey = (projectId: string) => `burns:lastBlock:${projectId}`
const scanCursorKey = (projectId: string) => `burns:scanCursor:${projectId}`
const byAppKey = (projectId: string) => `burns:by-app:${projectId}`
const txsKey = (projectId: string) => `burns:txs:${projectId}`

function getClient() {
  const url = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
  return createPublicClient({ chain: base, transport: http(url) })
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

export async function getBurnByApp(projectId: string): Promise<bigint> {
  const raw = await kv.get<string>(byAppKey(projectId))
  return BigInt(raw || '0')
}

export interface SyncResult {
  projectId: string
  name: string
  newBurns: bigint
  rescans: number
  scannedFrom: number
  scannedTo: number
  scanComplete: boolean
}

async function fetchTransferLogs(
  client: ReturnType<typeof getClient>,
  receiver: `0x${string}`,
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
      args: { from: receiver, to: DEAD_ADDRESS },
      fromBlock: start,
      toBlock: end,
    })
    logs.push(...chunk)
    start = end + 1n
  }

  return logs
}

async function processLogs(projectId: string, logs: Awaited<ReturnType<typeof fetchTransferLogs>>) {
  let newBurns = 0n
  let rescans = 0

  for (const log of logs) {
    const txHash = log.transactionHash
    const already = await kv.sismember(txsKey(projectId), txHash)
    if (already) continue

    const value = log.args.value ?? 0n
    newBurns += value
    rescans += 1
    await kv.sadd(txsKey(projectId), txHash)
  }

  if (newBurns > 0n) {
    const appTotal = BigInt((await kv.get<string>(byAppKey(projectId))) || '0') + newBurns
    const hubTotal = BigInt((await kv.get<string>(BURNS_TOTAL_KEY)) || '0') + newBurns
    await kv.set(byAppKey(projectId), appTotal.toString())
    await kv.set(BURNS_TOTAL_KEY, hubTotal.toString())
  }

  return { newBurns, rescans }
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
      rescans: 0,
      scannedFrom: Number(fromBlock),
      scannedTo: Number(latestBlock),
      scanComplete: true,
    }
  }

  const logs = await fetchTransferLogs(client, config.receiverAddress, fromBlock, toBlock)
  const { newBurns, rescans } = await processLogs(project.id, logs)

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
    rescans,
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
