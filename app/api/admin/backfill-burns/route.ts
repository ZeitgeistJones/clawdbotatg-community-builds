import { NextRequest, NextResponse } from 'next/server'
import { syncAllBurns, getBurnTotal, getBurnByApp, formatClawdAmount } from '@/lib/burnIndexer'
import { getApproved } from '@/lib/projects'
import { resolveBurnConfig } from '@/lib/burnConfig'

export async function POST(req: NextRequest) {
  const { key, fullBackfill } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await syncAllBurns({ fullBackfill: !!fullBackfill })
    const total = await getBurnTotal()
    return NextResponse.json({ ok: true, results, total: total.wei.toString(), formatted: total.formatted })
  } catch (err) {
    console.error('backfill-burns failed:', err)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [total, projects] = await Promise.all([getBurnTotal(), getApproved()])
  const byApp = await Promise.all(
    projects.map(async p => {
      const config = resolveBurnConfig(p.url, p.burnConfig)
      if (!config) return null
      const wei = await getBurnByApp(p.id)
      return {
        projectId: p.id,
        name: p.name,
        wei: wei.toString(),
        formatted: formatClawdAmount(wei),
      }
    }),
  )

  return NextResponse.json({
    total: total.wei.toString(),
    formatted: total.formatted,
    byApp: byApp.filter(Boolean),
  })
}
