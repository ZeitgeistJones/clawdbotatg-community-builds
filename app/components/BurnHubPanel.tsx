'use client'

import type { BurnAppSnapshot } from '@/lib/burnHub'
import TriggerExecuteBurnButton from './TriggerExecuteBurnButton'
import styles from './burnHub.module.css'

interface Props {
  apps: BurnAppSnapshot[]
}

export default function BurnHubPanel({ apps }: Props) {
  if (apps.length === 0) return null

  return (
    <div className={styles.panel}>
      {apps.map(app => (
        <div key={app.id} className={styles.appRow}>
          <div className={styles.appMeta}>
            <span className={styles.appName}>{app.name}</span>
            <span className={styles.appStats}>
              {app.rescores > 0 && `${app.rescores} rescores · `}
              {app.hasPendingEth
                ? `${trimEth(app.ethPending)} ETH pending swap`
                : 'no ETH pending'}
              {' · '}
              {app.burnsFormatted} CLAWD burned
            </span>
          </div>
          <div className={styles.appActions}>
            <TriggerExecuteBurnButton
              receiver={app.receiverAddress}
              disabled={!app.hasPendingEth}
            />
            <a href={app.appUrl} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
              rescore ↗
            </a>
            <a
              href={app.basescanWriteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.linkBtn}
            >
              basescan ↗
            </a>
          </div>
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
