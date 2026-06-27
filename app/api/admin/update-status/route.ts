import { NextRequest, NextResponse } from 'next/server'
import { updateBuildStatus } from '@/lib/projects'

export async function POST(req: NextRequest) {
  const { id, buildStatus, key } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await updateBuildStatus(id, buildStatus)
  return NextResponse.json({ ok: true })
}
