export interface BurnConfig {
  receiverAddress: `0x${string}`
  /** Uniswap V3 pool — primary `from` on CLAWD→dead during execute() */
  poolAddress?: `0x${string}`
  /** execute() selector on receiver contract */
  executeSelector?: string
  /** Rescore payment in wei (0.000008 ETH) */
  rescorePaymentWei?: bigint
  startBlock?: number
}

/** CLAWD on Base */
export const CLAWD_TOKEN = '0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07' as const

export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const

/** Per-app burn indexing config, matched by normalized project URL */
export const BURN_APP_CONFIGS: Record<string, BurnConfig> = {
  'the-build-report.vercel.app': {
    receiverAddress: '0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad',
    poolAddress: '0xCD55381a53da35Ab1D7Bc5e3fE5F76cac976FAc3',
    executeSelector: '0x61461954',
    rescorePaymentWei: 8000000000000n,
    startBlock: 48130514,
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
