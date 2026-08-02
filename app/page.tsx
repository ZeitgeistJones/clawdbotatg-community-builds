import { getApproved } from '@/lib/projects'
import type { FeatureTag } from '@/lib/projects'
import { getBurnHubSnapshot } from '@/lib/burnHub'
import BurnStats from './components/BurnStats'
import styles from './page.module.css'
import Link from 'next/link'
import Image from 'next/image'
import { Redis } from '@upstash/redis'
import ComingSoonCard from './components/ComingSoonCard'

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const TAG_STYLE: Record<string, { bg: string; color: string }> = {
  tool:   { bg: 'var(--tag-tool-bg)', color: 'var(--tag-tool-fg)' },
  game:   { bg: 'var(--tag-game-bg)', color: 'var(--tag-game-fg)' },
  data:   { bg: 'var(--tag-data-bg)', color: 'var(--tag-data-fg)' },
  social: { bg: 'var(--tag-social-bg)', color: 'var(--tag-social-fg)' },
}

const BUILD_STATUS_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  building: { bg: 'var(--status-building-bg)', color: 'var(--status-building-fg)', dot: 'var(--status-building-dot)' },
  beta:     { bg: 'var(--status-beta-bg)', color: 'var(--status-beta-fg)', dot: 'var(--status-beta-dot)' },
  v1:       { bg: 'var(--status-v1-bg)', color: 'var(--status-v1-fg)', dot: 'var(--status-v1-dot)' },
  offline:  { bg: 'var(--status-offline-bg)', color: 'var(--status-offline-fg)', dot: 'var(--status-offline-dot)' },
}

const FEATURE_TAG_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  token_gate:        { bg: 'var(--ft-token-bg)', color: 'var(--ft-token-fg)', icon: '🔒' },
  free_uses:         { bg: 'var(--ft-freeuses-bg)', color: 'var(--ft-freeuses-fg)', icon: '⚡' },
  burns_clawd:       { bg: 'var(--ft-burns-bg)', color: 'var(--ft-burns-fg)', icon: '🔥' },
  paid:              { bg: 'var(--ft-paid-bg)', color: 'var(--ft-paid-fg)', icon: '💵' },
  free:              { bg: 'var(--ft-free-bg)', color: 'var(--ft-free-fg)', icon: '🌐' },
  subject_to_change: { bg: 'var(--ft-warn-bg)', color: 'var(--ft-warn-fg)', icon: '⚠️' },
  custom:            { bg: 'var(--ft-custom-bg)', color: 'var(--ft-custom-fg)', icon: '•' },
}

function getBuildStatusStyle(status?: string) {
  if (!status) return null
  return BUILD_STATUS_STYLE[status] || {
    bg: 'var(--status-fallback-bg)',
    color: 'var(--status-fallback-fg)',
    dot: 'var(--status-fallback-dot)',
  }
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

interface ComingSoonItem {
  id: string
  name: string
  desc: string
  emoji: string
  teaser?: string
  url?: string
}

export const revalidate = 0

export default async function Home() {
  const approvedPromise = getApproved()
  const [projects, comingSoon, burnHub] = await Promise.all([
    approvedPromise,
    kv.get<ComingSoonItem[]>('coming-soon').then(r => r || []),
    approvedPromise.then(p => getBurnHubSnapshot(p)),
  ])
  const { totalFormatted, lastBurnAt, pending } = burnHub

  return (
    <main className={styles.wrap}>
      <header className={styles.header}>
        <Image
          src="/clawd-logo.png"
          alt="clawdbotatg community builds"
          width={90}
          height={90}
          className={styles.logoImg}
          priority
        />
        <h1 className={styles.title}>clawdbotatg community builds</h1>
        <p className={styles.subtitle}>stuff built by the community, for the community</p>
        <BurnStats
          totalFormatted={totalFormatted}
          lastBurnAt={lastBurnAt}
          pending={pending}
        />
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

        {comingSoon.map(item => (
          <ComingSoonCard key={item.id} item={item} />
        ))}

        <Link href="/submit" className={`${styles.card} ${styles.addCard}`}>
          <span className={styles.addIcon}>＋</span>
          <span className={styles.addLabel}>submit your project</span>
          <span className={styles.addNote}>reviewed before it goes live</span>
        </Link>
      </div>

      <p className={styles.disclaimer}>
        ⚠️ pricing, access requirements, and feature tags may not reflect the current state of each app. always verify before connecting your wallet or making any transactions.
      </p>

      <footer className={styles.footer}>
        built on <a href="https://base.org" target="_blank" rel="noopener noreferrer">Base</a> · powered by CLAWD
      </footer>
    </main>
  )
}
