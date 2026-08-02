/** Live site preview: prefer og/twitter image, else thum.io screenshot. */

export function screenshotUrl(siteUrl: string): string {
  const clean = siteUrl.trim().replace(/\/$/, '')
  return `https://image.thum.io/get/width/900/crop/1125/noanimate/${clean}`
}

function absolutize(href: string, base: string): string | null {
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

function extractMetaImage(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    /<meta[^>]+name=["']twitter:image:src["'][^>]+content=["']([^"']+)["']/i,
  ]

  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) {
      const abs = absolutize(m[1].trim(), baseUrl)
      if (abs && /^https?:\/\//i.test(abs) && !/\.ico(\?|$)/i.test(abs) && !/favicon/i.test(abs)) {
        return abs
      }
    }
  }
  return null
}

/**
 * Resolve a headshot URL for a project site.
 * Tries OG/Twitter image (cached 24h), falls back to a live screenshot.
 */
export async function resolvePreview(siteUrl: string): Promise<string> {
  const shot = screenshotUrl(siteUrl)
  try {
    const res = await fetch(siteUrl, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; ClawdCommunityBuilds/1.0)',
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return shot
    const html = await res.text()
    const og = extractMetaImage(html, res.url || siteUrl)
    if (og) return og
  } catch {
    // network / timeout / blocked — screenshot still works
  }
  return shot
}
