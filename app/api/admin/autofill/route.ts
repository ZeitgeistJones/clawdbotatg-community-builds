import { NextRequest, NextResponse } from 'next/server'
import { autofillProject } from '@/lib/autofill'

export async function POST(req: NextRequest) {
  let body: { url?: string; key?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { url, key } = body
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Valid URL required' }, { status: 400 })
  }

  try {
    const draft = await autofillProject(url)
    return NextResponse.json(draft)
  } catch (err) {
    console.error('autofill failed:', err)
    const message = err instanceof Error && err.message === 'Invalid URL'
      ? 'Valid URL required'
      : 'Autofill failed — fill in manually'
    return NextResponse.json({ error: message }, { status: err instanceof Error && err.message === 'Invalid URL' ? 400 : 500 })
  }
}
