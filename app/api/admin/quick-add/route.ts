import { NextRequest, NextResponse } from 'next/server'
import { quickAddProject, type FeatureTag } from '@/lib/projects'
import type { BurnConfig } from '@/lib/burnConfig'

const VALID_TAGS = new Set(['tool', 'game', 'data', 'social'])

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { key, ...data } = body
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (typeof data.name !== 'string' || !data.name.trim() || typeof data.url !== 'string' || !data.url) {
    return NextResponse.json({ error: 'name and url required' }, { status: 400 })
  }

  const tag = typeof data.tag === 'string' && VALID_TAGS.has(data.tag) ? data.tag as 'tool' | 'game' | 'data' | 'social' : 'tool'

  const rawBurn = data.burnConfig as Record<string, unknown> | undefined
  let burnConfig: BurnConfig | undefined
  if (rawBurn?.receiverAddress && typeof rawBurn.receiverAddress === 'string') {
    burnConfig = {
      mode: rawBurn.mode === 'execute' ? 'execute' : 'direct',
      receiverAddress: rawBurn.receiverAddress as `0x${string}`,
      poolAddress: typeof rawBurn.poolAddress === 'string' && rawBurn.poolAddress
        ? rawBurn.poolAddress as `0x${string}`
        : undefined,
      executeSelector: typeof rawBurn.executeSelector === 'string' && rawBurn.executeSelector
        ? rawBurn.executeSelector
        : undefined,
      rescorePaymentWei: rawBurn.rescorePaymentWei != null
        ? String(rawBurn.rescorePaymentWei)
        : undefined,
      startBlock: rawBurn.startBlock != null ? Number(rawBurn.startBlock) : undefined,
    }
  }

  try {
    const project = await quickAddProject({
      name: data.name.trim(),
      desc: typeof data.desc === 'string' ? data.desc : '',
      emoji: typeof data.emoji === 'string' && data.emoji ? data.emoji : '🛠️',
      url: data.url,
      tag,
      builder: typeof data.builder === 'string' && data.builder ? data.builder : 'Zeitgeist Jones',
      buildStatus: typeof data.buildStatus === 'string' && data.buildStatus ? data.buildStatus : 'building',
      featureTags: Array.isArray(data.featureTags) ? data.featureTags as FeatureTag[] : undefined,
      burnConfig,
      manualTagsOverride: true,
    })
    return NextResponse.json(project)
  } catch (err) {
    console.error('quick-add failed:', err)
    return NextResponse.json({ error: 'Could not add project' }, { status: 500 })
  }
}
