export interface BurnConfig {
  receiverAddress: `0x${string}`
  /** Uniswap V3 pool — primary `from` on CLAWD→dead during execute() */
  poolAddress?: `0x${string}`
  /** execute() selector on receiver contract */
  executeSelector?: string
  /**
   * Rescore payment in wei (0.000008 ETH).
   * Stored as a string wherever this travels through JSON/KV (project.burnConfig,
   * the autofill draft, admin edits) since JSON can't hold a literal bigint.
   * Only the static BURN_APP_CONFIGS below use real bigint literals in code.
   * resolveBurnConfig() normalizes either shape to bigint before returning.
   */
  rescorePaymentWei?: bigint | string
  startBlock?: number
  /**
   * 'execute' (default): the clawdbotatg batch-burn pattern — only counts a Transfer
   * if it happened inside a transaction that called `executeSelector` on `receiverAddress`.
   * Use this for apps built on your own shared receiver contract (e.g. The Build Report).
   *
   * 'direct': just sums every CLAWD Transfer from `receiverAddress` (and `poolAddress`,
   * if set) straight to a burn destination — no selector check, no rescore tracking.
   * Use this for third-party apps you don't control, where you only know the wallet/
   * contract that does the burning (same approach as Ash Ledger).
   */
  mode?: 'execute' | 'direct'
}

/** CLAWD on Base */
export const CLAWD_TOKEN = '0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07' as const

export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as const
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

/** Per-app burn indexing config, matched by normalized project URL */
export const BURN_APP_CONFIGS: Record<string, BurnConfig> = {
  'the-build-report.vercel.app': {
    receiverAddress: '0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad',
    poolAddress: '0xCD55381a53da35Ab1D7Bc5e3fE5F76cac976FAc3',
    executeSelector: '0x61461954',
    rescorePaymentWei: 8000000000000n,
    startBlock: 48130514,
  },
  'clawd-dca.vercel.app': {
    mode: 'direct',
    receiverAddress: '0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC',
    startBlock: 30000000,
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

function normalizeRescorePaymentWei(v?: bigint | string): bigint | undefined {
  if (v === undefined || v === null || v === '') return undefined
  return typeof v === 'string' ? BigInt(v) : v
}

export function resolveBurnConfig(
  url: string,
  inline?: BurnConfig,
): (Omit<BurnConfig, 'rescorePaymentWei'> & { rescorePaymentWei?: bigint; host: string }) | null {
  if (inline?.receiverAddress) {
    return {
      ...inline,
      mode: inline.mode || 'execute',
      rescorePaymentWei: normalizeRescorePaymentWei(inline.rescorePaymentWei),
      host: normalizeProjectUrl(url),
    }
  }
  const host = normalizeProjectUrl(url)
  const config = BURN_APP_CONFIGS[host]
  if (!config) return null
  return {
    ...config,
    mode: config.mode || 'execute',
    rescorePaymentWei: normalizeRescorePaymentWei(config.rescorePaymentWei),
    host,
  }
}
