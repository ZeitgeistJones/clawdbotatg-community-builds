import { Redis } from "@upstash/redis"
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export type ProjectStatus = 'pending' | 'approved' | 'rejected'
export type BuildStatus = 'building' | 'beta' | 'v1' | 'offline' | string

export interface FeatureTag {
  type: 'token_gate' | 'free_uses' | 'burns_clawd' | 'paid' | 'free' | 'subject_to_change' | 'custom'
  label: string      // display label e.g. "10M CLAWD gate", "burns 5%", "$0.10/gen"
  value?: string     // optional numeric/text value
}

export interface ProjectMeta {
  buildStatus?: BuildStatus
  featureTags?: FeatureTag[]
  manualTagsOverride?: boolean  // if true, skip auto-fetch and use manual tags only
}

export interface Project {
  id: string
  name: string
  desc: string
  emoji: string
  url: string
  tag: 'tool' | 'game' | 'data' | 'social'
  builder: string
  walletAddress?: string
  status: ProjectStatus
  buildStatus?: BuildStatus
  featureTags?: FeatureTag[]
  manualTagsOverride?: boolean
  submittedAt: number
}

const APPROVED_KEY = 'projects:approved'
const PENDING_KEY  = 'projects:pending'

// Try to fetch live status from app's /api/status endpoint
export async function fetchAppStatus(url: string): Promise<{ featureTags?: FeatureTag[]; buildStatus?: BuildStatus } | null> {
  try {
    const base = url.replace(/\/$/, '')
    const res = await fetch(`${base}/api/status`, { next: { revalidate: 300 } })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function getApproved(): Promise<Project[]> {
  const seedMetas = await Promise.all(
    SEED_PROJECTS.map(p => kv.get<ProjectMeta>(`meta:${p.id}`))
  )
  const hydratedSeeds = await Promise.all(SEED_PROJECTS.map(async (p, i) => {
    const meta = seedMetas[i]
    let featureTags = meta?.featureTags ?? p.featureTags
    let buildStatus = (meta?.buildStatus ?? p.buildStatus) as BuildStatus

    // auto-fetch if no manual override
    if (!meta?.manualTagsOverride) {
      const live = await fetchAppStatus(p.url)
      if (live) {
        if (live.featureTags && !featureTags) featureTags = live.featureTags
        if (live.buildStatus && !meta?.buildStatus) buildStatus = live.buildStatus
      }
    }

    return { ...p, buildStatus, featureTags }
  }))

  const ids = await kv.lrange<string>(APPROVED_KEY, 0, -1)
  if (!ids.length) return hydratedSeeds

  const projects = await Promise.all(ids.map(id => kv.get<Project>(`project:${id}`)))
  const kvProjects = await Promise.all((projects.filter(Boolean) as Project[]).map(async p => {
    if (!p.manualTagsOverride) {
      const live = await fetchAppStatus(p.url)
      if (live) {
        return {
          ...p,
          featureTags: p.featureTags ?? live.featureTags,
          buildStatus: p.buildStatus ?? live.buildStatus,
        }
      }
    }
    return p
  }))

  return [...hydratedSeeds, ...kvProjects]
}

export async function getPending(): Promise<Project[]> {
  const ids = await kv.lrange<string>(PENDING_KEY, 0, -1)
  if (!ids.length) return []
  const projects = await Promise.all(ids.map(id => kv.get<Project>(`project:${id}`)))
  return projects.filter(Boolean) as Project[]
}

export async function getProject(id: string): Promise<Project | null> {
  const seed = SEED_PROJECTS.find(p => p.id === id)
  if (seed) {
    const meta = await kv.get<ProjectMeta>(`meta:${id}`)
    return {
      ...seed,
      buildStatus: (meta?.buildStatus ?? seed.buildStatus) as BuildStatus,
      featureTags: meta?.featureTags ?? seed.featureTags,
      manualTagsOverride: meta?.manualTagsOverride,
    }
  }
  return kv.get<Project>(`project:${id}`)
}

export async function submitProject(data: Omit<Project, 'id' | 'status' | 'submittedAt'>): Promise<Project> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const project: Project = { ...data, id, status: 'pending', submittedAt: Date.now() }
  await kv.set(`project:${id}`, project)
  await kv.lpush(PENDING_KEY, id)
  return project
}

export async function approveProject(id: string): Promise<void> {
  const project = await kv.get<Project>(`project:${id}`)
  if (!project) throw new Error('Project not found')
  await kv.set(`project:${id}`, { ...project, status: 'approved' })
  await kv.lrem(PENDING_KEY, 0, id)
  await kv.lpush(APPROVED_KEY, id)
}

export async function rejectProject(id: string): Promise<void> {
  const project = await kv.get<Project>(`project:${id}`)
  if (!project) throw new Error('Project not found')
  await kv.set(`project:${id}`, { ...project, status: 'rejected' })
  await kv.lrem(PENDING_KEY, 0, id)
}

export async function updateProjectMeta(id: string, meta: Partial<ProjectMeta>): Promise<void> {
  if (id.startsWith('seed-')) {
    const existing = await kv.get<ProjectMeta>(`meta:${id}`) || {}
    await kv.set(`meta:${id}`, { ...existing, ...meta })
    return
  }
  const project = await kv.get<Project>(`project:${id}`)
  if (!project) throw new Error('Project not found')
  await kv.set(`project:${id}`, { ...project, ...meta })
}

const SEED_PROJECTS: Project[] = [
  {
    id: 'seed-1',
    name: 'Talk Normie 2 Me',
    desc: 'Explains any GitHub repo in plain English, with personality modes',
    emoji: '🗣️',
    url: 'https://talk-normie-2-me.vercel.app',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'v1',
    featureTags: [
      { type: 'free_uses', label: '2 free uses' },
      { type: 'token_gate', label: '10M CLAWD gate' },
    ],
    submittedAt: 0,
  },
  {
    id: 'seed-2',
    name: "I've Seen Things",
    desc: 'Your wallet tells its story. Dramatic first-person coin narratives',
    emoji: '👁️',
    url: 'https://iveseenthings.vercel.app',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'building',
    featureTags: [
      { type: 'free', label: 'free to use' },
    ],
    submittedAt: 0,
  },
  {
    id: 'seed-3',
    name: 'Larvae Performance Review',
    desc: 'Public accountability dashboard scoring CLAWD build delivery',
    emoji: '📊',
    url: 'https://larvaereview.vercel.app',
    tag: 'data',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'v1',
    featureTags: [
      { type: 'free', label: 'free to use' },
    ],
    submittedAt: 0,
  },
  {
    id: 'seed-4',
    name: 'Tripwire',
    desc: 'Token-gated dashboard for CLAWD holders',
    emoji: '🔐',
    url: 'https://tripwire-app.vercel.app/',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'v1',
    featureTags: [
      { type: 'token_gate', label: '10M CLAWD gate' },
    ],
    submittedAt: 0,
  },
]
