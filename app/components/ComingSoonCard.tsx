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

const SOON_PALETTES = [
  { from: '#1a1c22', mid: '#2a2e38', to: '#5a6070', ink: '#d8dce8' },
  { from: '#18161c', mid: '#2c2834', to: '#6a6078', ink: '#e0dce8' },
]

function hashId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

function monogram(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function ComingSoonCard({
  item,
  preview,
}: {
  item: ComingSoonItem
  preview?: string | null
}) {
  const [failed, setFailed] = useState(!preview)
  const p = SOON_PALETTES[hashId(item.id) % SOON_PALETTES.length]
  const style = {
    ['--shot-from' as string]: p.from,
    ['--shot-mid' as string]: p.mid,
    ['--shot-to' as string]: p.to,
    ['--shot-ink' as string]: p.ink,
  }

  const inner = (
    <>
      {preview && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className={styles.img}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <span className={styles.scrim} aria-hidden />
      {(failed || !preview) && (
        <>
          <span className={styles.grain} aria-hidden />
          <span className={styles.mono} aria-hidden>{monogram(item.name)}</span>
        </>
      )}
      <span className={styles.badge}>coming soon</span>
      <div className={styles.body}>
        <span className={styles.name}>{item.name}</span>
      </div>
    </>
  )

  if (item.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.shot}
        style={style}
      >
        {inner}
      </a>
    )
  }

  return (
    <div className={styles.shot} style={style}>
      {inner}
    </div>
  )
}
