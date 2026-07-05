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

export interface PendingBurnApp {
  id: string
  receiverAddress: `0x${string}`
  ethPending: string
  appUrl?: string
}

export async function getBurnHubSnapshot(approved?: Project[]) {
  const [projectList, hubBurn, client] = await Promise.all([
    approved ?? getApproved(),
    getHubBurnForDisplay(),
    Promise.resolve(getPublicClient()),
  ])

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

  return {
    totalFormatted: hubBurn.totalFormatted,
    lastBurnAt: hubBurn.lastBurnAt,
    pending,
    rescoresByApp,
  }
}
