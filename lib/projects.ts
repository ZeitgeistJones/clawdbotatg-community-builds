import { Redis } from "@upstash/redis"
const kv = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export type ProjectStatus = 'pending' | 'approved' | 'rejected'

export interface Project {
  id: string
  name: string
  desc: string
  emoji: string
  url: string
  tag: 'tool' | 'game' | 'data' | 'social'
  builder: string
  status: ProjectStatus
  submittedAt: number
}

const APPROVED_KEY = 'projects:approved'
const PENDING_KEY  = 'projects:pending'

export async function getApproved(): Promise<Project[]> {
  const ids = await kv.lrange<string>(APPROVED_KEY, 0, -1)
  if (!ids.length) return SEED_PROJECTS
  const projects = await Promise.all(ids.map(id => kv.get<Project>(`project:${id}`)))
  return projects.filter(Boolean) as Project[]
}

export async function getPending(): Promise<Project[]> {
  const ids = await kv.lrange<string>(PENDING_KEY, 0, -1)
  if (!ids.length) return []
  const projects = await Promise.all(ids.map(id => kv.get<Project>(`project:${id}`)))
  return projects.filter(Boolean) as Project[]
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

const SEED_PROJECTS: Project[] = [
  {
    id: 'seed-1',
    name: 'Talk __ 2 Me',
    desc: 'Explains any GitHub repo in plain English, with personality modes',
    emoji: '🗣️',
    url: 'https://talk-normie-2-me.vercel.app',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    status: 'approved',
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
    status: 'approved',
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
    status: 'approved',
    submittedAt: 0,
  },
  {
    id: 'seed-4',
    name: 'Tripwire',
    desc: 'Token-gated dashboard for CLAWD holders',
    emoji: '🔐',
    url: 'https://tripwire.vercel.app',
    tag: 'tool',
    builder: 'Zeitgeist Jones',
    status: 'approved',
    submittedAt: 0,
  },
]
