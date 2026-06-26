import { NextRequest, NextResponse } from 'next/server'
import { getPending } from '@/lib/projects'

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const pending = await getPending()
  return NextResponse.json(pending)
}
