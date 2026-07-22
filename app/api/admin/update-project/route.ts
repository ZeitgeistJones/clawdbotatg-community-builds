import { NextRequest, NextResponse } from 'next/server'
import { updateProjectFields } from '@/lib/projects'

export async function POST(req: NextRequest) {
  const { key, id, name, builder, desc } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const fields: Partial<{ name: string; builder: string; desc: string }> = {}
  if (typeof name === 'string' && name.trim()) fields.name = name.trim()
  if (typeof builder === 'string' && builder.trim()) fields.builder = builder.trim()
  if (typeof desc === 'string' && desc.trim()) fields.desc = desc.trim()

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  try {
    await updateProjectFields(id, fields)
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
