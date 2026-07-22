import { NextRequest, NextResponse } from 'next/server'
import { updateProjectBurnConfig } from '@/lib/projects'
import type { BurnConfig } from '@/lib/burnConfig'

export async function POST(req: NextRequest) {
  const { key, id, burnConfig } = await req.json()
  if (key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  // Passing burnConfig: null clears it
  if (burnConfig === null) {
    try {
      await updateProjectBurnConfig(id, null)
      return NextResponse.json({ ok: true, id, cleared: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  }

  if (!burnConfig?.receiverAddress || typeof burnConfig.receiverAddress !== 'string') {
    return NextResponse.json({ error: 'receiverAddress required' }, { status: 400 })
  }

  const cleaned: BurnConfig = {
    mode: burnConfig.mode === 'execute' ? 'execute' : 'direct',
    receiverAddress: burnConfig.receiverAddress,
    poolAddress: burnConfig.poolAddress || undefined,
    executeSelector: burnConfig.executeSelector || undefined,
    rescorePaymentWei: burnConfig.rescorePaymentWei ? String(burnConfig.rescorePaymentWei) : undefined,
    startBlock: burnConfig.startBlock != null ? Number(burnConfig.startBlock) : undefined,
  }

  try {
    await updateProjectBurnConfig(id, cleaned)
    return NextResponse.json({ ok: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
