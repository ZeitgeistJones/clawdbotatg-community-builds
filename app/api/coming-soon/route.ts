import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function GET() {
  const items = await kv.get<unknown[]>('coming-soon') || []
  return NextResponse.json(items)
}
