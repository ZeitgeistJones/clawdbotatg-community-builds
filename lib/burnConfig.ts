export interface BurnConfig {
  receiverAddress: `0x${string}`
  paymentEth?: string
  startBlock?: number
}

/** CLAWD on Base */
export const CLAWD_TOKEN = '0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07' as const

export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const

/** Per-app burn indexing config, matched by normalized project URL */
export const BURN_APP_CONFIGS: Record<string, BurnConfig> = {
  'the-build-report.vercel.app': {
    receiverAddress: '0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad',
    paymentEth: '0.000008',
    startBlock: 48100000,
  },
}

export function normalizeProjectUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  }
}

export function resolveBurnConfig(
  url: string,
  inline?: BurnConfig,
): (BurnConfig & { host: string }) | null {
  if (inline?.receiverAddress) {
    return { ...inline, host: normalizeProjectUrl(url) }
  }
  const host = normalizeProjectUrl(url)
  const config = BURN_APP_CONFIGS[host]
  if (!config) return null
  return { ...config, host }
}
