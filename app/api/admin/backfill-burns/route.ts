import { NextRequest, NextResponse } from 'next/server'
import { syncAllBurns, getBurnTotal, getBurnByApp, getRescoreTotal, getRescoresByApp, formatClawdAmount } from '@/lib/burnIndexer'
import { getApproved } from '@/lib/projects'
import { resolveBurnConfig } from '@/lib/burnConfig'

export async function POST(req: NextRequest) {
  const { key, fullBackfill } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await syncAllBurns({ fullBackfill: !!fullBackfill })
    const [total, rescores] = await Promise.all([getBurnTotal(), getRescoreTotal()])
    return NextResponse.json({
      ok: true,
      results: results.map(r => ({
        ...r,
        newBurns: r.newBurns.toString(),
        rescoreWarning: r.rescoreWarning,
      })),
      total: total.wei.toString(),
      formatted: total.formatted,
      rescores,
    })
  } catch (err) {
    console.error('backfill-burns failed:', err)
    const message = err instanceof Error ? err.message : 'Backfill failed'
    return NextResponse.json({ error: message.slice(0, 200) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [total, rescores, projects] = await Promise.all([
    getBurnTotal(),
    getRescoreTotal(),
    getApproved(),
  ])
  const byApp = await Promise.all(
    projects.map(async p => {
      const config = resolveBurnConfig(p.url, p.burnConfig)
      if (!config) return null
      const [wei, rescoreCount] = await Promise.all([
        getBurnByApp(p.id),
        getRescoresByApp(p.id),
      ])
      return {
        projectId: p.id,
        name: p.name,
        wei: wei.toString(),
        formatted: formatClawdAmount(wei),
        rescores: rescoreCount,
      }
    }),
  )

  return NextResponse.json({
    total: total.wei.toString(),
    formatted: total.formatted,
    rescores,
    byApp: byApp.filter(Boolean),
  })
}
