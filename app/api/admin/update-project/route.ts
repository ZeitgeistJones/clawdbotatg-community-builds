import { NextRequest, NextResponse } from 'next/server'
import { updateProjectDesc } from '@/lib/projects'

export async function POST(req: NextRequest) {
  const { key, id, desc } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!id || typeof desc !== 'string' || !desc.trim()) {
    return NextResponse.json({ error: 'id and desc required' }, { status: 400 })
  }

  try {
    await updateProjectDesc(id, desc.trim())
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
