import { fetchAppStatus, type FeatureTag, type BuildStatus } from './projects'

export interface PageMeta {
  title?: string
  description?: string
  textSample?: string
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_HTML_CHARS = 500_000

// Match content="..." regardless of whether `property`/`name` comes before or after content
function grabMeta(html: string, attr: 'property' | 'name', key: string): string | undefined {
  const a = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i')
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, 'i')
  return html.match(a)?.[1]?.trim() || html.match(b)?.[1]?.trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

export async function fetchPageMeta(url: string): Promise<PageMeta> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClawdCommunityBuilds/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 0 },
    })
    if (!res.ok) return {}
    // Cap size so a giant HTML dump can't blow memory / regex time
    const html = (await res.text()).slice(0, MAX_HTML_CHARS)

    const ogTitle = grabMeta(html, 'property', 'og:title')
    const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim()
    const title = decodeEntities(ogTitle || titleTag || '') || undefined

    const ogDesc = grabMeta(html, 'property', 'og:description')
    const metaDesc = grabMeta(html, 'name', 'description')
    const description = decodeEntities(ogDesc || metaDesc || '') || undefined

    const textSample = decodeEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000)
    )

    return { title, description, textSample }
  } catch {
    // Timeouts, DNS failures, TLS errors, aborted requests → empty meta
    return {}
  }
}

// A few existing descriptions from lib/projects.ts, used purely as a style guide for tone/length
const STYLE_EXAMPLES = [
  'Explains any GitHub repo in plain English, with personality modes for every type of reader.',
  'Your wallet tells its story through dramatic first-person coin narratives from on-chain history.',
  'Public accountability dashboard that scores CLAWD build delivery across repos and timelines.',
  'Token-gated dashboard for CLAWD holders—monitor signals, access controls, and holder-only tools.',
]

async function generateDescription(
  name: string,
  meta: PageMeta
): Promise<{ text: string | null; fromClaude: boolean }> {
  const fallback = meta.description?.trim() || null
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { text: fallback, fromClaude: false }

  const prompt = `Write ONE punchy sentence (max ~20 words) describing what this app does, matching the tone and length of these examples:
${STYLE_EXAMPLES.map(e => `- ${e}`).join('\n')}

App name: ${name}
Page title: ${meta.title || 'unknown'}
Existing meta description: ${meta.description || 'none'}
Page text sample: ${meta.textSample || 'none'}

Respond with ONLY the sentence. No quotes, no preamble, no trailing period required.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) return { text: fallback, fromClaude: false }
    const data = await res.json()
    const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text?.trim()
    if (text) return { text, fromClaude: true }
    return { text: fallback, fromClaude: false }
  } catch {
    return { text: fallback, fromClaude: false }
  }
}

export interface AutofillResult {
  name: string
  desc: string
  emoji: string
  tag: 'tool' | 'game' | 'data' | 'social'
  buildStatus: BuildStatus
  featureTags?: FeatureTag[]
  url: string
  source: {
    hasStatusEndpoint: boolean
    descFromClaude: boolean
  }
}

async function fetchAppStatusBounded(url: string) {
  // Don't let a hung /api/status stall the whole autofill (fetchAppStatus has no timeout)
  return Promise.race([
    fetchAppStatus(url),
    new Promise<null>(resolve => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
  ])
}

export async function autofillProject(rawUrl: string): Promise<AutofillResult> {
  let url: string
  try {
    url = new URL(rawUrl.trim()).toString().replace(/\/$/, '')
  } catch {
    throw new Error('Invalid URL')
  }

  const [status, meta] = await Promise.all([
    fetchAppStatusBounded(url),
    fetchPageMeta(url),
  ])

  // Strip a trailing "| Site Name" or "- Site Name" suffix some titles have
  const name = (meta.title || 'New Project').replace(/\s*[-|–—]\s*[^-|–—]*$/, '').trim() || 'New Project'

  const { text: desc, fromClaude } = await generateDescription(name, meta)

  return {
    name,
    desc: desc || '',
    emoji: '🛠️',
    tag: 'tool',
    buildStatus: status?.buildStatus || 'building',
    featureTags: status?.featureTags,
    url,
    source: {
      hasStatusEndpoint: !!status,
      descFromClaude: fromClaude,
    },
  }
}
