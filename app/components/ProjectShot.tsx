'use client'

import { useState, type CSSProperties } from 'react'
import styles from '../page.module.css'

interface Props {
  href: string
  name: string
  builder: string
  preview: string
  monogram: string
  style: CSSProperties
}

export default function ProjectShot({ href, name, builder, preview, monogram, style }: Props) {
  const [failed, setFailed] = useState(false)

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${styles.shot} ${failed ? styles.shotPlain : ''}`}
      style={style}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className={styles.shotImg}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <span className={styles.shotScrim} aria-hidden />
      {failed && (
        <>
          <span className={styles.shotGrain} aria-hidden />
          <span className={styles.shotOrb} aria-hidden />
          <span className={styles.shotMono} aria-hidden>{monogram}</span>
        </>
      )}
      <div className={styles.shotBody}>
        <span className={styles.shotName}>{name}</span>
        <span className={styles.shotBuilder}>{builder}</span>
      </div>
    </a>
  )
}
