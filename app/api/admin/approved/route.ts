import { NextRequest, NextResponse } from 'next/server'
import { getApproved } from '@/lib/projects'

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Only return KV projects (not seed), filter out seeds
  const all = await getApproved()
  const kvOnly = all.filter(p => !p.id.startsWith('seed-'))
  return NextResponse.json(kvOnly)
}
