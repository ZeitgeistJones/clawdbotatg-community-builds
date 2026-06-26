import { NextRequest, NextResponse } from 'next/server'
import { rejectProject } from '@/lib/projects'

export async function POST(req: NextRequest) {
  const { id, key } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await rejectProject(id)
  return NextResponse.json({ ok: true })
}
