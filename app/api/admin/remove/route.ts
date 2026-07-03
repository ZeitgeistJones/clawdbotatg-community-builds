import { NextRequest, NextResponse } from 'next/server'
import { removeProject } from '@/lib/projects'

export async function POST(req: NextRequest) {
  const { id, key } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await removeProject(id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
}
