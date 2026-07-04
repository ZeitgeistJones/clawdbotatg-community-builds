import { CLAWD_TOKEN, DEAD_ADDRESS } from '@/lib/burnConfig'
import { BURN_APPS } from '@/lib/burnApps'
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

function getAttributionSet() {
  const set = new Set<string>()
  for (const app of BURN_APPS) {
    set.add(app.attributionAddress.toLowerCase())
  }
  return set
}

async function getTxTo(hash: string, cache: Map<string, string>): Promise<string> {
  const key = hash.toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const res = await fetch(`${BLOCKSCOUT}/transactions/${hash}`, { cache: 'no-store' })
  if (!res.ok) return ''
  const json = await res.json() as { to?: { hash?: string } }
  const to = json.to?.hash?.toLowerCase() || ''
  cache.set(key, to)
  return to
}

/** Sum CLAWD → dead attributed to registered hub app contracts (live from Blockscout) */
export async function fetchOnChainBurnTotals(): Promise<OnChainBurnTotals> {
  const attribution = getAttributionSet()
  const txToCache = new Map<string, string>()
  const byAppWei: Record<string, bigint> = {}
  for (const app of BURN_APPS) byAppWei[app.id] = 0n

  let totalWei = 0n
  let lastBurnAt: number | null = null
  let url: string | null = `${BLOCKSCOUT}/addresses/${DEAD_ADDRESS}/token-transfers?type=ERC-20`

  for (let page = 0; page < 30 && url; page++) {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) break
    const json = await res.json() as {
      items?: TokenTransferItem[]
      next_page_params?: { block_number: number; index: number; items_count: number }
    }

    for (const item of json.items || []) {
      if (item.token?.address_hash?.toLowerCase() !== CLAWD) continue
      if (item.to?.hash?.toLowerCase() !== DEAD) continue

      const txTo = await getTxTo(item.transaction_hash, txToCache)
      if (!attribution.has(txTo)) continue

      const app = BURN_APPS.find(a => a.attributionAddress.toLowerCase() === txTo)
      if (!app) continue

      const wei = BigInt(item.total.value)
      totalWei += wei
      byAppWei[app.id] = (byAppWei[app.id] || 0n) + wei

      const ts = new Date(item.timestamp).getTime()
      if (!lastBurnAt || ts > lastBurnAt) lastBurnAt = ts
    }

    const next = json.next_page_params
    if (!next) break
    url = `${BLOCKSCOUT}/addresses/${DEAD_ADDRESS}/token-transfers?type=ERC-20&block_number=${next.block_number}&index=${next.index}&items_count=${next.items_count}`
  }

  const byApp: OnChainBurnTotals['byApp'] = {}
  for (const app of BURN_APPS) {
    const wei = byAppWei[app.id] || 0n
    byApp[app.id] = { wei, formatted: formatClawdAmount(wei) }
  }

  return { totalWei, totalFormatted: formatClawdAmount(totalWei), lastBurnAt, byApp }
}
