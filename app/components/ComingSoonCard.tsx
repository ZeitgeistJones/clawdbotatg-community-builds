'use client'

import { useState } from 'react'
import styles from './ComingSoonCard.module.css'

interface ComingSoonItem {
  id: string
  name: string
  desc: string
  emoji: string
  teaser?: string
  url?: string
}

export default function ComingSoonCard({ item }: { item: ComingSoonItem }) {
  const [iframeError, setIframeError] = useState(false)

  return (
    <div className={styles.card}>
      <div className={styles.preview}>
        {item.url && !iframeError ? (
          <div className={styles.iframeWrap}>
            <iframe
              src={item.url}
              className={styles.iframe}
              onError={() => setIframeError(true)}
              sandbox="allow-scripts allow-same-origin"
              title={item.name}
            />
            <div className={styles.iframeOverlay} />
          </div>
        ) : (
          <div className={styles.fallbackBg} />
        )}
        <div className={styles.badge}>coming soon</div>
      </div>

      <div className={styles.textPanel}>
        <span className={styles.emoji}>{item.emoji}</span>
        <div className={styles.name}>{item.name}</div>
        <div className={styles.desc}>{item.desc}</div>
        {item.teaser && <div className={styles.teaser}>{item.teaser}</div>}
      </div>
    </div>
  )
}
