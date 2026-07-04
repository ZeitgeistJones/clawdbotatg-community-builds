import { getApproved } from '@/lib/projects'
import type { FeatureTag } from '@/lib/projects'
import { getBurnHubSnapshot } from '@/lib/burnHub'
import BurnHubPanel from './components/BurnHubPanel'
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
  token_gate:        { bg: '#FFF0E8', color: '#B04A10', icon: '🔒' },
  free_uses:         { bg: '#E8F4FF', color: '#1A5FA8', icon: '⚡' },
  burns_clawd:       { bg: '#FFF0F0', color: '#AA2222', icon: '🔥' },
  paid:              { bg: '#F0FFF0', color: '#1A6B2A', icon: '💵' },
  free:              { bg: '#F0FFF0', color: '#1A6B2A', icon: '🌐' },
  subject_to_change: { bg: '#FFFFF0', color: '#7A6A00', icon: '⚠️' },
  custom:            { bg: '#F5F5F5', color: '#555555', icon: '•' },
}

function getBuildStatusStyle(status?: string) {
  if (!status) return null
  return BUILD_STATUS_STYLE[status] || { bg: '#F0F0FF', color: '#444', dot: '#999' }
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

function formatLastUpdated(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function Home() {
  const [projects, comingSoon, burnHub] = await Promise.all([
    getApproved(),
    kv.get<ComingSoonItem[]>('coming-soon').then(r => r || []),
    getBurnHubSnapshot(),
  ])
  const { totalBurns: burns, lastUpdated, apps: burnApps } = burnHub

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
        <div className={styles.burnStats}>
          <p className={styles.burnCounter}>
            🔥 {burns.formatted} CLAWD community builds burns
          </p>
          {lastUpdated && (
            <p className={styles.burnUpdated}>updated {formatLastUpdated(lastUpdated)}</p>
          )}
        </div>
        <BurnHubPanel apps={burnApps} />
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
        ⚠️ pricing, access requirements, and feature tags are set by individual builders and may not reflect the current state of each app. always verify before connecting your wallet or making any transactions.
      </p>

      <footer className={styles.footer}>
        built on <a href="https://base.org" target="_blank" rel="noopener noreferrer">Base</a> · powered by CLAWD
      </footer>
    </main>
  )
}
