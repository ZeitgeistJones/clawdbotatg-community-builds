import { Redis } from "@upstash/redis"
import type { BurnConfig } from "./burnConfig"
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export type ProjectStatus = 'pending' | 'approved' | 'rejected'
export type BuildStatus = 'building' | 'beta' | 'v1' | 'offline' | string

export interface FeatureTag {
  type: 'token_gate' | 'free_uses' | 'burns_clawd' | 'paid' | 'free' | 'subject_to_change' | 'custom'
  label: string
  value?: string
}

export type { BurnConfig } from "./burnConfig"

export interface ProjectMeta {
  buildStatus?: BuildStatus
  featureTags?: FeatureTag[]
  manualTagsOverride?: boolean
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
  burnConfig?: BurnConfig
  submittedAt: number
}

const APPROVED_KEY = 'projects:approved'
const PENDING_KEY  = 'projects:pending'
const REMOVED_KEY  = 'projects:removed'

async function getRemovedIds(): Promise<Set<string>> {
  const ids = await kv.smembers(REMOVED_KEY)
  return new Set((ids as string[]) || [])
}

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
  const removed = await getRemovedIds()

  const seedMetas = await Promise.all(
    SEED_PROJECTS.map(p => kv.get<ProjectMeta>(`meta:${p.id}`))
  )
  const hydratedSeeds = (await Promise.all(SEED_PROJECTS.map(async (p, i) => {
    const meta = seedMetas[i]
    let featureTags = meta?.featureTags ?? p.featureTags
    let buildStatus = (meta?.buildStatus ?? p.buildStatus) as BuildStatus

    // check both KV meta override AND seed-level flag
    if (!meta?.manualTagsOverride && !p.manualTagsOverride) {
      const live = await fetchAppStatus(p.url)
      if (live) {
        if (live.featureTags && !featureTags) featureTags = live.featureTags
        if (live.buildStatus && !meta?.buildStatus) buildStatus = live.buildStatus
      }
    }

    return { ...p, buildStatus, featureTags }
  }))).filter(p => !removed.has(p.id))

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

  return [...hydratedSeeds, ...kvProjects.filter(p => !removed.has(p.id))]
}

export async function getPending(): Promise<Project[]> {
  const ids = await kv.lrange<string>(PENDING_KEY, 0, -1)
  if (!ids.length) return []
  const projects = await Promise.all(ids.map(id => kv.get<Project>(`project:${id}`)))
  return projects.filter(Boolean) as Project[]
}

export async function removeProject(id: string): Promise<void> {
  const removed = await getRemovedIds()
  if (removed.has(id)) return

  if (id.startsWith('seed-')) {
    if (!SEED_PROJECTS.some(p => p.id === id)) throw new Error('Project not found')
    await kv.sadd(REMOVED_KEY, id)
    return
  }

  const project = await kv.get<Project>(`project:${id}`)
  if (!project) throw new Error('Project not found')
  await kv.lrem(APPROVED_KEY, 0, id)
  await kv.sadd(REMOVED_KEY, id)
}

export async function getProject(id: string): Promise<Project | null> {
  const removed = await getRemovedIds()
  if (removed.has(id)) return null

  const seed = SEED_PROJECTS.find(p => p.id === id)
  if (seed) {
    const meta = await kv.get<ProjectMeta>(`meta:${id}`)
    return {
      ...seed,
      buildStatus: (meta?.buildStatus ?? seed.buildStatus) as BuildStatus,
      featureTags: meta?.featureTags ?? seed.featureTags,
      manualTagsOverride: meta?.manualTagsOverride ?? seed.manualTagsOverride,
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

// Admin-only: create a project that's already approved, bypassing the wallet-signed
// submit -> pending -> approve flow. Used by the "drop a link" quick-add feature.
export async function quickAddProject(data: Omit<Project, 'id' | 'status' | 'submittedAt'>): Promise<Project> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const project: Project = { ...data, id, status: 'approved', submittedAt: Date.now() }
  await kv.set(`project:${id}`, project)
  await kv.lpush(APPROVED_KEY, id)
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

export async function updateProjectDesc(id: string, desc: string): Promise<void> {
  if (id.startsWith('seed-')) {
    throw new Error('Seed project descriptions are edited in lib/projects.ts')
  }
  const project = await kv.get<Project>(`project:${id}`)
  if (!project) throw new Error('Project not found')
  await kv.set(`project:${id}`, { ...project, desc })
}

const SEED_PROJECTS: Project[] = [
  {
    id: 'seed-1',
    name: 'Talk Normie 2 Me',
    desc: 'Explains any GitHub repo in plain English, with personality modes for every type of reader.',
    emoji: '🗣️',
    url: 'https://talk-normie-2-me.vercel.app',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'v1',
    manualTagsOverride: true,
    featureTags: [
      { type: 'free_uses', label: '2 free uses', value: '2 free uses' },
      { type: 'token_gate', label: '10M CLAWD gate', value: '10M CLAWD' },
    ],
    submittedAt: 0,
  },
  {
    id: 'seed-2',
    name: "I've Seen Things",
    desc: 'Your wallet tells its story through dramatic first-person coin narratives from on-chain history.',
    emoji: '👁️',
    url: 'https://iveseenthings.vercel.app',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'building',
    manualTagsOverride: true,
    featureTags: [
      { type: 'free', label: 'free to use' },
    ],
    submittedAt: 0,
  },
  {
    id: 'seed-3',
    name: 'Larvae Performance Review',
    desc: 'Public accountability dashboard that scores CLAWD build delivery across repos and timelines.',
    emoji: '📊',
    url: 'https://larvaereview.vercel.app',
    tag: 'data',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'v1',
    manualTagsOverride: true,
    featureTags: [
      { type: 'free', label: 'free to use' },
    ],
    submittedAt: 0,
  },
  {
    id: 'seed-4',
    name: 'Tripwire',
    desc: 'Token-gated dashboard for CLAWD holders—monitor signals, access controls, and holder-only tools.',
    emoji: '🔐',
    url: 'https://tripwire-app.vercel.app/',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'v1',
    manualTagsOverride: true,
    featureTags: [
      { type: 'token_gate', label: '10M CLAWD gate', value: '10M CLAWD' },
    ],
    submittedAt: 0,
  },
]

