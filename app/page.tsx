import { getApproved } from '@/lib/projects'
import type { FeatureTag } from '@/lib/projects'
import styles from './page.module.css'
import Link from 'next/link'

const TAG_STYLE: Record<string, { bg: string; color: string }> = {
  tool:   { bg: '#FFF0E8', color: '#B04A10' },
  game:   { bg: '#EDE8FF', color: '#5533B5' },
  data:   { bg: '#E5F5EE', color: '#0D6E4A' },
  social: { bg: '#FFF0F5', color: '#A02050' },
}

const BUILD_STATUS_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  building: { bg: '#FFFBE6', color: '#92600A', dot: '#F5A623' },
  beta:     { bg: '#EDE8FF', color: '#5533B5', dot: '#7B61FF' },
  v1:       { bg: '#E5F5EE', color: '#0D6E4A', dot: '#2ECC71' },
  offline:  { bg: '#F5F5F5', color: '#888888', dot: '#BBBBBB' },
}

const FEATURE_TAG_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  token_gate:       { bg: '#FFF0E8', color: '#B04A10', icon: '🔒' },
  free_uses:        { bg: '#E8F4FF', color: '#1A5FA8', icon: '⚡' },
  burns_clawd:      { bg: '#FFF0F0', color: '#AA2222', icon: '🔥' },
  paid:             { bg: '#F0FFF0', color: '#1A6B2A', icon: '💵' },
  free:             { bg: '#F0FFF0', color: '#1A6B2A', icon: '🌐' },
  subject_to_change:{ bg: '#FFFFF0', color: '#7A6A00', icon: '⚠️' },
  custom:           { bg: '#F5F5F5', color: '#555555', icon: '•' },
}

function getBuildStatusStyle(status?: string) {
  if (!status) return null
  return BUILD_STATUS_STYLE[status] || { bg: '#F0F0FF', color: '#444', dot: '#999' }
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export const revalidate = 0

export default async function Home() {
  const projects = await getApproved()

  return (
    <main className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M8 28 C8 28 12 20 14 14 C15 10 13 6 16 5 C19 4 20 8 18 13 C16 18 19 24 22 26" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M14 29 C14 29 16 22 17 16 C17.5 12 16 8 19 7 C22 6 22.5 10 21 15 C19.5 20 21 26 23 28" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
            <path d="M20 30 C20 30 20 23 20.5 17 C21 13 20 9 23 8 C26 7 26 11 25 16 C24 21 25 27 27 29" stroke="#111" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          <span className={styles.title}>clawdbotatg community builds</span>
        </div>
        <p className={styles.subtitle}>stuff built by the community, for the community</p>
      </header>

      <div className={styles.grid}>
        {projects.map(p => {
          const tag = TAG_STYLE[p.tag] || TAG_STYLE.tool
          const bStyle = getBuildStatusStyle(p.buildStatus)
          return (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className={styles.card}>
              {bStyle && (
                <div className={styles.statusBadge} style={{ background: bStyle.bg, color: bStyle.color }}>
                  <span className={styles.statusDot} style={{ background: bStyle.dot }} />
                  {p.buildStatus}
                </div>
              )}
              <span className={styles.emoji}>{p.emoji}</span>
              <div className={styles.cardName}>{p.name}</div>
              <div className={styles.cardDesc}>{p.desc}</div>
              <span className={styles.tag} style={{ background: tag.bg, color: tag.color }}>
                {p.tag}
              </span>
              {p.featureTags && p.featureTags.length > 0 && (
                <div className={styles.featureTags}>
                  {p.featureTags.map((ft: FeatureTag, i: number) => {
                    const fStyle = FEATURE_TAG_STYLE[ft.type] || FEATURE_TAG_STYLE.custom
                    return (
                      <span key={i} className={styles.featureTag} style={{ background: fStyle.bg, color: fStyle.color }}>
                        {fStyle.icon} {ft.label}
                      </span>
                    )
                  })}
                </div>
              )}
              <div className={styles.builder}>
                <div className={styles.dot}>{initials(p.builder)}</div>
                <span>{p.builder}</span>
              </div>
            </a>
          )
        })}

        <Link href="/submit" className={`${styles.card} ${styles.addCard}`}>
          <span className={styles.addIcon}>＋</span>
          <span className={styles.addLabel}>submit your project</span>
          <span className={styles.addNote}>reviewed before it goes live</span>
        </Link>
      </div>

      <p className={styles.disclaimer}>
        ⚠️ pricing, access requirements, and feature tags are set by individual builders and may not reflect the current state of each app. always verify before connecting your wallet or making any transactions.
      </p>

      <footer className={styles.footer}>
        built on <a href="https://base.org" target="_blank" rel="noopener noreferrer">Base</a> · powered by CLAWD
      </footer>
    </main>
  )
}
