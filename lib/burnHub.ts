import { createPublicClient, formatUnits, http } from 'viem'
import { base } from 'viem/chains'
import { BURN_APPS } from '@/lib/burnApps'
import { normalizeProjectUrl } from '@/lib/burnConfig'
import { getRescoresByApp } from '@/lib/burnIndexer'
import { getHubBurnForDisplay } from '@/lib/burnSnapshot'
import { getApproved, type Project } from '@/lib/projects'

function getPublicClient() {
  const url = process.env.BASE_PUBLIC_RPC_URL || 'https://mainnet.base.org'
  return createPublicClient({ chain: base, transport: http(url) })
}

function debugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) {
  // #region agent log
  fetch('http://127.0.0.1:7685/ingest/806f9d64-9ddf-4ee5-9b60-ca0a71789be3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '391049' },
    body: JSON.stringify({
      sessionId: '391049',
      runId: 'post-fix-v2',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}

export interface PendingBurnApp {
  id: string
  receiverAddress: `0x${string}`
  ethPending: string
  appUrl?: string
}

export async function getBurnHubSnapshot(approved?: Project[]) {
  const started = Date.now()

  const [projectList, hubBurn, client] = await Promise.all([
    approved ?? getApproved(),
    getHubBurnForDisplay(),
    Promise.resolve(getPublicClient()),
  ])

  debugLog('H6', 'burnHub.ts:hubBurn', 'hub burn totals resolved', {
    source: hubBurn.source,
    totalFormatted: hubBurn.totalFormatted,
    lastBurnAt: hubBurn.lastBurnAt,
    ms: Date.now() - started,
  })

  const pendingEntries = BURN_APPS.filter(e => e.receiverAddress)
  const pendingResults = await Promise.all(
    pendingEntries.map(async entry => {
      const ethWei = await client.getBalance({ address: entry.receiverAddress! })
      if (ethWei === 0n) return null
      return {
        id: entry.id,
        receiverAddress: entry.receiverAddress!,
        ethPending: formatUnits(ethWei, 18),
        appUrl: entry.appUrl,
      } satisfies PendingBurnApp
    }),
  )
  const pending = pendingResults.filter(Boolean) as PendingBurnApp[]

  const rescoreEntries = BURN_APPS.filter(e => e.host)
  const rescorePairs = await Promise.all(
    rescoreEntries.map(async entry => {
      const project = projectList.find(p => normalizeProjectUrl(p.url) === entry.host)
      if (!project) return null
      const count = await getRescoresByApp(project.id)
      return [entry.id, count] as const
    }),
  )
  const rescoresByApp = Object.fromEntries(
    rescorePairs.filter(Boolean) as [string, number][],
  )

  debugLog('H6', 'burnHub.ts:snapshot', 'getBurnHubSnapshot complete', {
    totalMs: Date.now() - started,
    source: hubBurn.source,
    totalFormatted: hubBurn.totalFormatted,
  })

  return {
    totalFormatted: hubBurn.totalFormatted,
    lastBurnAt: hubBurn.lastBurnAt,
    pending,
    rescoresByApp,
  }
}
