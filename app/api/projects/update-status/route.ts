import { NextRequest, NextResponse } from 'next/server'
import { getProject, updateBuildStatus } from '@/lib/projects'

export async function POST(req: NextRequest) {
  try {
    const { id, buildStatus, walletAddress } = await req.json()
    if (!id || !buildStatus || !walletAddress) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const project = await getProject(id)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // seed projects (no walletAddress) can only be updated via admin
    if (!project.walletAddress) {
      return NextResponse.json({ error: 'Use the admin panel to update this project.' }, { status: 403 })
    }

    if (project.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: 'Wallet does not match.' }, { status: 403 })
    }

    await updateBuildStatus(id, buildStatus)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
