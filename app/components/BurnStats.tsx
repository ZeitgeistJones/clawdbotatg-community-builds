'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { PendingBurnApp } from '@/lib/burnHub'
import TriggerExecuteBurnButton from './TriggerExecuteBurnButton'
import styles from './burnHub.module.css'

interface Props {
  totalFormatted: string
  lastBurnAt: number | null
  pending: PendingBurnApp[]
}

function LocalTime({ ts, prefix }: { ts: number; prefix: string }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    setText(
      new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    )
  }, [ts])

  if (!text) return null
  return (
    <p className={styles.burnUpdated}>
      {prefix} {text}
    </p>
  )
}

export default function BurnStats({ totalFormatted, lastBurnAt, pending }: Props) {
  const router = useRouter()

  return (
    <div className={styles.burnHub}>
      <p className={styles.burnCounter}>
        🔥 {totalFormatted} CLAWD community builds burns
      </p>
      {lastBurnAt ? (
        <LocalTime ts={lastBurnAt} prefix="last burn" />
      ) : (
        <p className={styles.burnUpdated}>no burns indexed yet</p>
      )}

      {pending.map(app => (
        <div key={app.id} className={styles.pendingRow}>
          <span className={styles.pendingLabel}>
            {trimEth(app.ethPending)} ETH ready to burn
          </span>
          <TriggerExecuteBurnButton
            receiver={app.receiverAddress}
            onSuccess={() => router.refresh()}
          />
          {app.appUrl && (
            <a href={app.appUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
              app ↗
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

function trimEth(v: string): string {
  const n = Number(v)
  if (n === 0) return '0'
  if (n < 0.000001) return n.toExponential(2)
  return n.toFixed(6).replace(/\.?0+$/, '')
}
