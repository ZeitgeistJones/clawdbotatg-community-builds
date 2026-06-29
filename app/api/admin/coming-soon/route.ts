import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface ComingSoonItem {
  id: string
  name: string
  desc: string
  emoji: string
  teaser?: string
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const items = await kv.get<ComingSoonItem[]>('coming-soon') || []
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const { key, items } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await kv.set('coming-soon', items)
  return NextResponse.json({ ok: true })
}
