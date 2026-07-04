/** Apps on the hub that burn CLAWD on Base */
export interface BurnAppEntry {
  id: string
  /** Contract users call — used to attribute CLAWD→dead burns (tx.to) */
  attributionAddress: `0x${string}`
  /** For batch execute() apps — contract that holds rescore ETH */
  receiverAddress?: `0x${string}`
  executeSelector?: `0x${string}`
  host?: string
  appUrl?: string
  basescanWriteUrl?: string
}

export const BURN_APPS: BurnAppEntry[] = [
  {
    id: 'build-report',
    host: 'the-build-report.vercel.app',
    attributionAddress: '0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad',
    receiverAddress: '0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad',
    executeSelector: '0x61461954',
    appUrl: 'https://the-build-report.vercel.app',
    basescanWriteUrl:
      'https://basescan.org/address/0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad#writeContract',
  },
]
