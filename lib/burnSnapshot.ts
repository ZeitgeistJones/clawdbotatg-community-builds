import { kv } from '@/lib/kv'
import { fetchOnChainBurnTotals } from '@/lib/clawdBurnIndex'
import { formatClawdAmount } from '@/lib/burnIndexer'

export const HUB_TOTAL_KEY = 'burns:hub:totalWei'
export const HUB_LAST_BURN_KEY = 'burns:hub:lastBurnAt'
export const HUB_UPDATED_KEY = 'burns:hub:updatedAt'

export interface HubBurnCache {
  totalFormatted: string
  totalWei: bigint
  lastBurnAt: number | null
  updatedAt: number | null
}

export async function getHubBurnCache(): Promise<HubBurnCache | null> {
  const [totalRaw, lastBurnRaw, updatedRaw] = await Promise.all([
    kv.get<string>(HUB_TOTAL_KEY),
    kv.get<string>(HUB_LAST_BURN_KEY),
    kv.get<string>(HUB_UPDATED_KEY),
  ])

  if (!totalRaw) return null

  const totalWei = BigInt(totalRaw)
  if (totalWei === 0n) return null

  return {
    totalWei,
    totalFormatted: formatClawdAmount(totalWei),
    lastBurnAt: lastBurnRaw ? Number(lastBurnRaw) : null,
    updatedAt: updatedRaw ? Number(updatedRaw) : null,
  }
}

/** Blockscout scan — run from cron/admin, not on every page view */
export async function syncHubBurnCache(): Promise<HubBurnCache> {
  const onChain = await fetchOnChainBurnTotals()
  const updatedAt = Date.now()

  await Promise.all([
    kv.set(HUB_TOTAL_KEY, onChain.totalWei.toString()),
    kv.set(HUB_LAST_BURN_KEY, onChain.lastBurnAt?.toString() ?? ''),
    kv.set(HUB_UPDATED_KEY, updatedAt.toString()),
  ])

  return {
    totalWei: onChain.totalWei,
    totalFormatted: onChain.totalFormatted,
    lastBurnAt: onChain.lastBurnAt,
    updatedAt,
  }
}

export async function getHubBurnForDisplay(): Promise<HubBurnCache & { source: 'cache' | 'sync' }> {
  const cached = await getHubBurnCache()
  if (cached) return { ...cached, source: 'cache' }

  const synced = await syncHubBurnCache()
  return { ...synced, source: 'sync' }
}
