import { NextResponse } from 'next/server'
import {
  fetchOnChainBurnTotals,
  fetchOnChainBurnTotalsLegacy,
  getBurnFetchDebug,
  getReceiverTxDebug,
} from '@/lib/clawdBurnIndex'

export async function GET() {
  const [receiverTotals, legacyTotals] = await Promise.all([
    fetchOnChainBurnTotals(),
    fetchOnChainBurnTotalsLegacy(),
  ])

  const fmt = (t: typeof receiverTotals) => ({
    totalFormatted: t.totalFormatted,
    totalWei: t.totalWei.toString(),
    lastBurnAt: t.lastBurnAt,
    byApp: Object.fromEntries(
      Object.entries(t.byApp).map(([k, v]) => [k, { ...v, wei: v.wei.toString() }]),
    ),
  })

  return NextResponse.json({
    receiverMethod: fmt(receiverTotals),
    legacyDeadAddressMethod: fmt(legacyTotals),
    debug: {
      receiver: getReceiverTxDebug(),
      legacy: getBurnFetchDebug(),
    },
  })
}
