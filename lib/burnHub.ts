import { createPublicClient, formatUnits, http } from 'viem'
import { base } from 'viem/chains'
import { BURN_APPS } from '@/lib/burnApps'
import { fetchOnChainBurnTotals } from '@/lib/clawdBurnIndex'
import { normalizeProjectUrl } from '@/lib/burnConfig'
import { getRescoresByApp } from '@/lib/burnIndexer'
import { getApproved } from '@/lib/projects'

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

export async function getBurnHubSnapshot() {
  const [approved, onChain, client] = await Promise.all([
    getApproved(),
    fetchOnChainBurnTotals(),
    Promise.resolve(getPublicClient()),
  ])

  const pending: PendingBurnApp[] = []

  for (const entry of BURN_APPS) {
    if (!entry.receiverAddress) continue

    const ethWei = await client.getBalance({ address: entry.receiverAddress })
    if (ethWei === 0n) continue

    pending.push({
      id: entry.id,
      receiverAddress: entry.receiverAddress,
      ethPending: formatUnits(ethWei, 18),
      appUrl: entry.appUrl,
    })
  }

  const rescoresByApp: Record<string, number> = {}
  for (const entry of BURN_APPS) {
    if (!entry.host) continue
    const project = approved.find(p => normalizeProjectUrl(p.url) === entry.host)
    if (project) {
      rescoresByApp[entry.id] = await getRescoresByApp(project.id)
    }
  }

  return {
    totalFormatted: onChain.totalFormatted,
    lastBurnAt: onChain.lastBurnAt,
    pending,
    rescoresByApp,
  }
}
