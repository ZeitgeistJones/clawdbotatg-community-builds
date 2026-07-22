import { createPublicClient, formatUnits, http } from 'viem'
import { base } from 'viem/chains'
import { BURN_APPS, type BurnAppEntry } from '@/lib/burnApps'
import { normalizeProjectUrl, resolveBurnConfig } from '@/lib/burnConfig'
import { getRescoresByApp } from '@/lib/burnIndexer'
import { getHubBurnForDisplay } from '@/lib/burnSnapshot'
import { getApproved, type Project } from '@/lib/projects'

function getPublicClient() {
  const url = process.env.BASE_PUBLIC_RPC_URL || 'https://mainnet.base.org'
  return createPublicClient({ chain: base, transport: http(url) })
}

export interface PendingBurnApp {
  id: string
  receiverAddress: `0x${string}`
  ethPending: string
  appUrl?: string
}

// Merge the hand-curated BURN_APPS list with any approved project that carries its own
// burnConfig (set via the admin "quick add from link" autofill, or a manual edit) — so a
// new burning app shows up on the pending-ETH widget without touching this file.
function buildBurnAppEntries(projectList: Project[]): BurnAppEntry[] {
  const knownHosts = new Set(BURN_APPS.map(e => e.host).filter(Boolean))

  const fromProjects: BurnAppEntry[] = projectList
    .map(p => {
      const host = normalizeProjectUrl(p.url)
      if (knownHosts.has(host)) return null // already covered by BURN_APPS, don't double-count
      const config = resolveBurnConfig(p.url, p.burnConfig)
      if (!config?.receiverAddress) return null
      return {
        id: p.id,
        host,
        attributionAddress: config.receiverAddress,
        receiverAddress: config.receiverAddress,
        executeSelector: config.executeSelector as `0x${string}` | undefined,
        appUrl: p.url,
      } satisfies BurnAppEntry
    })
    .filter((e): e is BurnAppEntry => e !== null)

  return [...BURN_APPS, ...fromProjects]
}

export async function getBurnHubSnapshot(approved?: Project[]) {
  const [projectList, hubBurn, client] = await Promise.all([
    approved ?? getApproved(),
    getHubBurnForDisplay(),
    Promise.resolve(getPublicClient()),
  ])

  const burnAppEntries = buildBurnAppEntries(projectList)

  const pendingEntries = burnAppEntries.filter(e => e.receiverAddress)
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

  const rescoreEntries = burnAppEntries.filter(e => e.host)
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

  return {
    totalFormatted: hubBurn.totalFormatted,
    lastBurnAt: hubBurn.lastBurnAt,
    pending,
    rescoresByApp,
  }
}
