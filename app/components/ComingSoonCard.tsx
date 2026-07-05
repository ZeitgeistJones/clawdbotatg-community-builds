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
  const showPreview = item.url && !iframeError

  return (
    <div className={`${styles.wrap}${showPreview ? ` ${styles.wrapWithPreview}` : ''}`}>
      <div className={styles.card}>
        <div className={styles.badge}>coming soon</div>
        <span className={styles.emoji}>{item.emoji}</span>
        <div className={styles.name}>{item.name}</div>
        <div className={styles.desc}>{item.desc}</div>
        {item.teaser && <div className={styles.teaser}>{item.teaser}</div>}
      </div>

      {showPreview && (
        <div className={styles.preview}>
          <iframe
            src={item.url}
            className={styles.iframe}
            onError={() => setIframeError(true)}
            sandbox="allow-scripts allow-same-origin"
            title={`${item.name} preview`}
          />
        </div>
      )}
    </div>
  )
}
