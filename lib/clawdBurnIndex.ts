import { CLAWD_TOKEN, DEAD_ADDRESS } from '@/lib/burnConfig'
import { BURN_APPS, type BurnAppEntry } from '@/lib/burnApps'
import { formatClawdAmount } from '@/lib/burnIndexer'

const CLAWD = CLAWD_TOKEN.toLowerCase()
const DEAD = DEAD_ADDRESS.toLowerCase()
const BLOCKSCOUT = 'https://base.blockscout.com/api/v2'

interface TokenTransferItem {
  transaction_hash: string
  timestamp: string
  total: { value: string }
  token: { address_hash: string }
  to: { hash: string }
}

export interface OnChainBurnTotals {
  totalWei: bigint
  totalFormatted: string
  lastBurnAt: number | null
  byApp: Record<string, { wei: bigint; formatted: string }>
}

export interface BurnFetchDebug {
  pagesFetched: number
  pagesFailed: number
  clawdToDeadSeen: number
  matchedTransfers: number
  txLookupFailed: number
  txLookupEmpty: number
  uniqueMatchedTxs: string[]
  stoppedReason: string
  durationMs: number
}

let lastDebug: BurnFetchDebug = {
  pagesFetched: 0,
  pagesFailed: 0,
  clawdToDeadSeen: 0,
  matchedTransfers: 0,
  txLookupFailed: 0,
  txLookupEmpty: 0,
  uniqueMatchedTxs: [],
  stoppedReason: 'none',
  durationMs: 0,
}

export function getBurnFetchDebug() {
  return lastDebug
}

function getAttributionSet() {
  const set = new Set<string>()
  for (const app of BURN_APPS) {
    set.add(app.attributionAddress.toLowerCase())
  }
  return set
}

async function getTxTo(
  hash: string,
  cache: Map<string, string>,
  stats: { failed: number; empty: number },
): Promise<string> {
  const key = hash.toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const res = await fetch(`${BLOCKSCOUT}/transactions/${hash}`, { cache: 'no-store' })
  if (!res.ok) {
    stats.failed++
    return ''
  }
  const json = await res.json() as { to?: { hash?: string } }
  const to = json.to?.hash?.toLowerCase() || ''
  if (!to) stats.empty++
  cache.set(key, to)
  return to
}

interface ReceiverTxDebug {
  pagesFetched: number
  pagesFailed: number
  txsScanned: number
  txsWithClawdToDead: number
  matchedTransfers: number
  uniqueTxs: string[]
  stoppedReason: string
  durationMs: number
}

let lastReceiverDebug: ReceiverTxDebug = {
  pagesFetched: 0,
  pagesFailed: 0,
  txsScanned: 0,
  txsWithClawdToDead: 0,
  matchedTransfers: 0,
  uniqueTxs: [],
  stoppedReason: 'none',
  durationMs: 0,
}

export function getReceiverTxDebug() {
  return lastReceiverDebug
}

/** Scan txs sent TO each app contract — reliable for execute()/executeBurn() burns */
async function fetchBurnsViaReceiverTxs(apps: BurnAppEntry[]): Promise<OnChainBurnTotals> {
  const started = Date.now()
  const byAppWei: Record<string, bigint> = {}
  for (const app of apps) byAppWei[app.id] = 0n

  let totalWei = 0n
  let lastBurnAt: number | null = null
  let pagesFetched = 0
  let pagesFailed = 0
  let txsScanned = 0
  let txsWithClawdToDead = 0
  let matchedTransfers = 0
  const uniqueTxs = new Set<string>()
  let stoppedReason = 'complete'

  for (const app of apps) {
    let url: string | null = `${BLOCKSCOUT}/addresses/${app.attributionAddress}/transactions`

    for (let page = 0; page < 20 && url; page++) {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        pagesFailed++
        stoppedReason = `receiver_page_http_${res.status}_${app.id}_p${page}`
        break
      }

      const json = await res.json() as {
        items?: { hash: string; timestamp: string; status: string }[]
        next_page_params?: { block_number: number; index: number; items_count: number }
      }
      pagesFetched++

      for (const tx of json.items || []) {
        if (tx.status !== 'ok') continue
        txsScanned++

        const ttRes = await fetch(`${BLOCKSCOUT}/transactions/${tx.hash}/token-transfers`, {
          cache: 'no-store',
        })
        if (!ttRes.ok) continue

        const ttJson = await ttRes.json() as { items?: TokenTransferItem[] }
        let txHadBurn = false

        for (const item of ttJson.items || []) {
          if (item.token?.address_hash?.toLowerCase() !== CLAWD) continue
          if (item.to?.hash?.toLowerCase() !== DEAD) continue

          const wei = BigInt(item.total.value)
          totalWei += wei
          byAppWei[app.id] = (byAppWei[app.id] || 0n) + wei
          matchedTransfers++
          txHadBurn = true
          uniqueTxs.add(tx.hash)

          const ts = new Date(tx.timestamp).getTime()
          if (!lastBurnAt || ts > lastBurnAt) lastBurnAt = ts
        }

        if (txHadBurn) txsWithClawdToDead++
      }

      const next = json.next_page_params
      if (!next) break
      url = `${BLOCKSCOUT}/addresses/${app.attributionAddress}/transactions?block_number=${next.block_number}&index=${next.index}&items_count=${next.items_count}`
    }
  }

  lastReceiverDebug = {
    pagesFetched,
    pagesFailed,
    txsScanned,
    txsWithClawdToDead,
    matchedTransfers,
    uniqueTxs: [...uniqueTxs],
    stoppedReason,
    durationMs: Date.now() - started,
  }

  const byApp: OnChainBurnTotals['byApp'] = {}
  for (const app of apps) {
    const wei = byAppWei[app.id] || 0n
    byApp[app.id] = { wei, formatted: formatClawdAmount(wei) }
  }

  return { totalWei, totalFormatted: formatClawdAmount(totalWei), lastBurnAt, byApp }
}

/** Sum CLAWD → dead for registered hub apps (receiver tx scan — stable) */
export async function fetchOnChainBurnTotals(apps: BurnAppEntry[] = BURN_APPS): Promise<OnChainBurnTotals> {
  return fetchBurnsViaReceiverTxs(apps)
}

/** Legacy global dead-address scan — kept for debug comparison only */
export async function fetchOnChainBurnTotalsLegacy(): Promise<OnChainBurnTotals> {
  const started = Date.now()
  const attribution = getAttributionSet()
  const txToCache = new Map<string, string>()
  const txStats = { failed: 0, empty: 0 }
  const byAppWei: Record<string, bigint> = {}
  for (const app of BURN_APPS) byAppWei[app.id] = 0n

  let totalWei = 0n
  let lastBurnAt: number | null = null
  let url: string | null = `${BLOCKSCOUT}/addresses/${DEAD_ADDRESS}/token-transfers?type=ERC-20`
  let pagesFetched = 0
  let pagesFailed = 0
  let clawdToDeadSeen = 0
  let matchedTransfers = 0
  const uniqueMatchedTxs = new Set<string>()
  let stoppedReason = 'complete'

  for (let page = 0; page < 30 && url; page++) {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      pagesFailed++
      stoppedReason = `page_http_${res.status}_at_${page}`
      break
    }
    const json = await res.json() as {
      items?: TokenTransferItem[]
      next_page_params?: { block_number: number; index: number; items_count: number }
    }
    pagesFetched++

    for (const item of json.items || []) {
      if (item.token?.address_hash?.toLowerCase() !== CLAWD) continue
      if (item.to?.hash?.toLowerCase() !== DEAD) continue
      clawdToDeadSeen++

      const txTo = await getTxTo(item.transaction_hash, txToCache, txStats)
      if (!attribution.has(txTo)) continue

      const app = BURN_APPS.find(a => a.attributionAddress.toLowerCase() === txTo)
      if (!app) continue

      const wei = BigInt(item.total.value)
      totalWei += wei
      matchedTransfers++
      uniqueMatchedTxs.add(item.transaction_hash)
      byAppWei[app.id] = (byAppWei[app.id] || 0n) + wei

      const ts = new Date(item.timestamp).getTime()
      if (!lastBurnAt || ts > lastBurnAt) lastBurnAt = ts
    }

    const next = json.next_page_params
    if (!next) {
      stoppedReason = 'no_more_pages'
      break
    }
    url = `${BLOCKSCOUT}/addresses/${DEAD_ADDRESS}/token-transfers?type=ERC-20&block_number=${next.block_number}&index=${next.index}&items_count=${next.items_count}`
  }

  if (pagesFetched >= 30) stoppedReason = 'page_cap_30'

  lastDebug = {
    pagesFetched,
    pagesFailed,
    clawdToDeadSeen,
    matchedTransfers,
    txLookupFailed: txStats.failed,
    txLookupEmpty: txStats.empty,
    uniqueMatchedTxs: [...uniqueMatchedTxs],
    stoppedReason,
    durationMs: Date.now() - started,
  }

  const byApp: OnChainBurnTotals['byApp'] = {}
  for (const app of BURN_APPS) {
    const wei = byAppWei[app.id] || 0n
    byApp[app.id] = { wei, formatted: formatClawdAmount(wei) }
  }

  return { totalWei, totalFormatted: formatClawdAmount(totalWei), lastBurnAt, byApp }
}
