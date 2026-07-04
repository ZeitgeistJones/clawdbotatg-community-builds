import { createPublicClient, formatUnits, http } from 'viem'
import { base } from 'viem/chains'
import { BURN_APPS } from '@/lib/burnApps'
import { normalizeProjectUrl } from '@/lib/burnConfig'
import { getApproved } from '@/lib/projects'
import {
  formatClawdAmount,
  getBurnByApp,
  getBurnLastUpdated,
  getBurnTotal,
  getRescoresByApp,
} from '@/lib/burnIndexer'

function getPublicClient() {
  const url = process.env.BASE_PUBLIC_RPC_URL || 'https://mainnet.base.org'
  return createPublicClient({ chain: base, transport: http(url) })
}

export interface BurnAppSnapshot {
  id: string
  name: string
  appUrl: string
  basescanWriteUrl: string
  receiverAddress: `0x${string}`
  burnsFormatted: string
  rescores: number
  ethPending: string
  hasPendingEth: boolean
}

export async function getBurnHubSnapshot() {
  const [approved, totalBurns, lastUpdated, client] = await Promise.all([
    getApproved(),
    getBurnTotal(),
    getBurnLastUpdated(),
    Promise.resolve(getPublicClient()),
  ])

  const apps: BurnAppSnapshot[] = await Promise.all(
    BURN_APPS.map(async entry => {
      const project = approved.find(p => normalizeProjectUrl(p.url) === entry.host)
      const projectId = project?.id

      const [burnsWei, rescores, ethWei] = await Promise.all([
        projectId ? getBurnByApp(projectId) : Promise.resolve(0n),
        projectId ? getRescoresByApp(projectId) : Promise.resolve(0),
        client.getBalance({ address: entry.receiverAddress }),
      ])

      const ethPending = formatUnits(ethWei, 18)

      return {
        id: entry.id,
        name: entry.name,
        appUrl: entry.appUrl,
        basescanWriteUrl: entry.basescanWriteUrl,
        receiverAddress: entry.receiverAddress,
        burnsFormatted: formatClawdAmount(burnsWei),
        rescores,
        ethPending,
        hasPendingEth: ethWei > 0n,
      }
    }),
  )

  return { totalBurns, lastUpdated, apps }
}
