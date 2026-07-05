'use client'

import styles from './ComingSoonCard.module.css'

interface ComingSoonItem {
  id: string
  name: string
  desc: string
  emoji: string
  teaser?: string
  url?: string
}

function previewHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function ComingSoonCard({ item }: { item: ComingSoonItem }) {
  const hasUrl = Boolean(item.url)

  return (
    <div className={`${styles.wrap}${hasUrl ? ` ${styles.wrapWithPreview}` : ''}`}>
      <div className={styles.card}>
        <div className={styles.badge}>coming soon</div>
        <span className={styles.emoji}>{item.emoji}</span>
        <div className={styles.name}>{item.name}</div>
        <div className={styles.desc}>{item.desc}</div>
        {item.teaser && <div className={styles.teaser}>{item.teaser}</div>}
      </div>

      {hasUrl && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.previewLink}
        >
          {previewHost(item.url!)}
          <span className={styles.previewArrow}>↗</span>
        </a>
      )}
    </div>
  )
}
