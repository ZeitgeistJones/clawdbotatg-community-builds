import { getApproved } from '@/lib/projects'
import { getBurnHubSnapshot } from '@/lib/burnHub'
import { resolvePreview } from '@/lib/preview'
import BurnStats from './components/BurnStats'
import ProjectShot from './components/ProjectShot'
import styles from './page.module.css'
import Link from 'next/link'
import Image from 'next/image'
import { Redis } from '@upstash/redis'
import ComingSoonCard from './components/ComingSoonCard'

const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

interface ComingSoonItem {
  id: string
  name: string
  desc: string
  emoji: string
  teaser?: string
  url?: string
}

/** Distinct poster palettes — used when screenshot/OG fails */
const SHOT_PALETTES = [
  { from: '#2a1410', mid: '#8a3a22', to: '#ff7a45', ink: '#fff4ee' },
  { from: '#0c1a18', mid: '#1a5c48', to: '#3ecf8e', ink: '#e8fff5' },
  { from: '#141820', mid: '#2a4060', to: '#6eb6ff', ink: '#eef6ff' },
  { from: '#1a1218', mid: '#6a2a40', to: '#ff6b8a', ink: '#ffeef2' },
  { from: '#16140c', mid: '#6a5820', to: '#e8c84a', ink: '#fffceb' },
  { from: '#101418', mid: '#2a4850', to: '#5ad4c8', ink: '#e8fffc' },
  { from: '#1c1010', mid: '#7a2828', to: '#f06050', ink: '#fff0ee' },
  { from: '#101610', mid: '#3a5a28', to: '#8fd45a', ink: '#f2ffe8' },
]

function hashId(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

function shotStyle(id: string) {
  const p = SHOT_PALETTES[hashId(id) % SHOT_PALETTES.length]
  const angle = 135 + (hashId(id) % 50)
  return {
    ['--shot-from' as string]: p.from,
    ['--shot-mid' as string]: p.mid,
    ['--shot-to' as string]: p.to,
    ['--shot-ink' as string]: p.ink,
    ['--shot-angle' as string]: `${angle}deg`,
  }
}

function monogram(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
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

  const [projectPreviews, soonPreviews] = await Promise.all([
    Promise.all(projects.map(p => resolvePreview(p.url))),
    Promise.all(comingSoon.map(item => (item.url ? resolvePreview(item.url) : Promise.resolve(null)))),
  ])

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
        {projects.map((p, i) => (
          <ProjectShot
            key={p.id}
            href={p.url}
            name={p.name}
            builder={p.builder}
            preview={projectPreviews[i]}
            monogram={monogram(p.name)}
            style={shotStyle(p.id)}
          />
        ))}

        {comingSoon.map((item, i) => (
          <ComingSoonCard key={item.id} item={item} preview={soonPreviews[i]} />
        ))}

        <Link href="/submit" className={`${styles.shot} ${styles.addShot}`}>
          <span className={styles.addIcon}>＋</span>
          <span className={styles.addLabel}>submit your project</span>
        </Link>
      </div>

      <p className={styles.disclaimer}>
        ⚠️ always verify pricing and access requirements before connecting your wallet or making any transactions.
      </p>

      <footer className={styles.footer}>
        built on <a href="https://base.org" target="_blank" rel="noopener noreferrer">Base</a> · powered by CLAWD
      </footer>
    </main>
  )
}
