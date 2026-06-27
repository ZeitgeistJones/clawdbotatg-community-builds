import { NextRequest, NextResponse } from 'next/server'
import { getProject, updateProjectMeta } from '@/lib/projects'

export async function POST(req: NextRequest) {
  try {
    const { id, buildStatus, featureTags, manualTagsOverride, walletAddress } = await req.json()
    if (!id || !walletAddress) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const project = await getProject(id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // if no wallet on file, allow any connected wallet to claim it
    if (project.walletAddress && project.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Wallet does not match.' }, { status: 403 })
    }

    const meta: Record<string, unknown> = {}
    if (buildStatus !== undefined) meta.buildStatus = buildStatus
    if (featureTags !== undefined) meta.featureTags = featureTags
    if (manualTagsOverride !== undefined) meta.manualTagsOverride = manualTagsOverride
    // save wallet if not already set
    if (!project.walletAddress) meta.walletAddress = walletAddress

    await updateProjectMeta(id, meta)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
