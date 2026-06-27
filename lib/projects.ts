import { Redis } from "@upstash/redis"
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export type ProjectStatus = 'pending' | 'approved' | 'rejected'
export type BuildStatus = 'building' | 'beta' | 'v1' | 'offline' | string

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
  submittedAt: number
}

const APPROVED_KEY = 'projects:approved'
const PENDING_KEY  = 'projects:pending'

export async function getApproved(): Promise<Project[]> {
  const seedStatuses = await Promise.all(
    SEED_PROJECTS.map(p => kv.get<string>(`buildstatus:${p.id}`))
  )
  const hydratedSeeds = SEED_PROJECTS.map((p, i) => ({
    ...p,
    buildStatus: (seedStatuses[i] ?? p.buildStatus) as BuildStatus,
  }))

  const ids = await kv.lrange<string>(APPROVED_KEY, 0, -1)
  if (!ids.length) return hydratedSeeds
  const projects = await Promise.all(ids.map(id => kv.get<Project>(`project:${id}`)))
  return [...hydratedSeeds, ...(projects.filter(Boolean) as Project[])]
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
    const overrideStatus = await kv.get<string>(`buildstatus:${id}`)
    return { ...seed, buildStatus: (overrideStatus ?? seed.buildStatus) as BuildStatus }
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

export async function updateBuildStatus(id: string, buildStatus: BuildStatus): Promise<void> {
  if (id.startsWith('seed-')) {
    await kv.set(`buildstatus:${id}`, buildStatus)
    return
  }
  const project = await kv.get<Project>(`project:${id}`)
  if (!project) throw new Error('Project not found')
  await kv.set(`project:${id}`, { ...project, buildStatus })
}

const SEED_PROJECTS: Project[] = [
  {
    id: 'seed-1',
    name: 'Talk __ 2 Me',
    desc: 'Explains any GitHub repo in plain English, with personality modes',
    emoji: '🗣️',
    url: 'https://talk-normie-2-me.vercel.app',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    walletAddress: '0xf2c44aF68aE2a983d1331b2D3aEF3c516Ae4a0Fc',
    status: 'approved',
    buildStatus: 'v1',
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
    submittedAt: 0,
  },
]
