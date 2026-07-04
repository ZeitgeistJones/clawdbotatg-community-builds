import { NextRequest, NextResponse } from 'next/server'
import { syncAllBurns } from '@/lib/burnIndexer'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await syncAllBurns()
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('sync-burns failed:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
