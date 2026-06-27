import { NextRequest, NextResponse } from 'next/server'
import { updateProjectMeta } from '@/lib/projects'

export async function POST(req: NextRequest) {
  const { id, buildStatus, featureTags, manualTagsOverride, key } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const meta: Record<string, unknown> = {}
  if (buildStatus !== undefined) meta.buildStatus = buildStatus
  if (featureTags !== undefined) meta.featureTags = featureTags
  if (manualTagsOverride !== undefined) meta.manualTagsOverride = manualTagsOverride
  await updateProjectMeta(id, meta)
  return NextResponse.json({ ok: true })
}
