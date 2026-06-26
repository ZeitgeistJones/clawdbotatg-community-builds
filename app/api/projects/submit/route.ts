import { NextRequest, NextResponse } from 'next/server'
import { submitProject } from '@/lib/projects'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, desc, emoji, url, tag, builder } = body

    if (!name || !desc || !url || !builder) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const project = await submitProject({ name, desc, emoji, url, tag, builder })
    return NextResponse.json(project)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
