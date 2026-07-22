import { kv } from '@/lib/kv'
import { BURN_APPS, type BurnAppEntry } from '@/lib/burnApps'
import { normalizeProjectUrl, resolveBurnConfig } from '@/lib/burnConfig'
import { fetchOnChainBurnTotals, getReceiverTxDebug } from '@/lib/clawdBurnIndex'
import { formatClawdAmount } from '@/lib/burnIndexer'
import { getApproved } from '@/lib/projects'

export const HUB_TOTAL_KEY = 'burns:hub:totalWei'
export const HUB_LAST_BURN_KEY = 'burns:hub:lastBurnAt'
export const HUB_UPDATED_KEY = 'burns:hub:updatedAt'
export const HUB_APPS_KEY = 'burns:hub:appsFingerprint'

export interface HubBurnCache {
  totalFormatted: string
  totalWei: bigint
  lastBurnAt: number | null
  updatedAt: number | null
}

function appsFingerprint(apps: BurnAppEntry[]): string {
  return apps.map(a => a.attributionAddress.toLowerCase()).sort().join(',')
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

/** BURN_APPS plus any approved project with its own burnConfig (admin-configured). */
export async function resolveHubBurnApps(): Promise<BurnAppEntry[]> {
  const projects = await getApproved()
  const known = new Set(BURN_APPS.map(a => a.attributionAddress.toLowerCase()))
  const extras: BurnAppEntry[] = []

  for (const p of projects) {
    const config = resolveBurnConfig(p.url, p.burnConfig)
    if (!config?.receiverAddress) continue
    const addr = config.receiverAddress.toLowerCase()
    if (known.has(addr)) continue
    known.add(addr)
    extras.push({
      id: p.id,
      host: normalizeProjectUrl(p.url),
      attributionAddress: config.receiverAddress,
      receiverAddress: config.receiverAddress,
      executeSelector: config.executeSelector as `0x${string}` | undefined,
      appUrl: p.url,
    })
  }

  return [...BURN_APPS, ...extras]
}

/** Blockscout scan — run from cron/admin, not on every page view.
 *  Never clobber a known-good hub total with a failed/empty scan. */
export async function syncHubBurnCache(): Promise<HubBurnCache> {
  const existing = await getHubBurnCache()
  const apps = await resolveHubBurnApps()
  const onChain = await fetchOnChainBurnTotals(apps)
  const debug = getReceiverTxDebug()

  // If the scan failed or returned nothing but we already have a positive total, keep it.
  if (
    onChain.totalWei === 0n &&
    existing &&
    existing.totalWei > 0n &&
    (debug.pagesFailed > 0 || debug.matchedTransfers === 0)
  ) {
    return existing
  }

  const updatedAt = Date.now()

  await Promise.all([
    kv.set(HUB_TOTAL_KEY, onChain.totalWei.toString()),
    kv.set(HUB_LAST_BURN_KEY, onChain.lastBurnAt?.toString() ?? ''),
    kv.set(HUB_UPDATED_KEY, updatedAt.toString()),
    kv.set(HUB_APPS_KEY, appsFingerprint(apps)),
  ])

  return {
    totalWei: onChain.totalWei,
    totalFormatted: onChain.totalFormatted,
    lastBurnAt: onChain.lastBurnAt,
    updatedAt,
  }
}

export async function getHubBurnForDisplay(): Promise<HubBurnCache & { source: 'cache' | 'sync' }> {
  const [cached, apps, finger] = await Promise.all([
    getHubBurnCache(),
    resolveHubBurnApps(),
    kv.get<string>(HUB_APPS_KEY),
  ])

  // Re-scan when burn-app set changes (e.g. CLAWD DCA added) so homepage total catches up
  // without waiting for cron. Otherwise serve cache.
  const appsChanged = finger !== appsFingerprint(apps)
  if (cached && !appsChanged) return { ...cached, source: 'cache' }

  const synced = await syncHubBurnCache()
  return { ...synced, source: 'sync' }
}
