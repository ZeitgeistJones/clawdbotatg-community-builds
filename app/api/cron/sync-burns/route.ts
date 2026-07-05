import { NextRequest, NextResponse } from 'next/server'
import { syncAllBurns } from '@/lib/burnIndexer'
import { syncHubBurnCache } from '@/lib/burnSnapshot'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [results, hubBurn] = await Promise.all([
      syncAllBurns(),
      syncHubBurnCache(),
    ])
    return NextResponse.json({
      ok: true,
      results,
      hubBurn: {
        totalFormatted: hubBurn.totalFormatted,
        totalWei: hubBurn.totalWei.toString(),
        lastBurnAt: hubBurn.lastBurnAt,
        updatedAt: hubBurn.updatedAt,
      },
    })
  } catch (err) {
    console.error('sync-burns failed:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
