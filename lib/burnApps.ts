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
  // CLAWD DCA — burns via executeBurn() (USDC → CLAWD → 0xdead) on the engine contract
  {
    id: 'clawd-dca-v3',
    host: 'clawd-dca.vercel.app',
    attributionAddress: '0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC',
    receiverAddress: '0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC',
    appUrl: 'https://clawd-dca.vercel.app',
    basescanWriteUrl:
      'https://basescan.org/address/0xDB5Da5B9C55D5FC72EB19692aB41Aabbc46278AC',
  },
  // v2 memorial — still holds historical CLAWD→dead burns (~43K)
  {
    id: 'clawd-dca-v2',
    attributionAddress: '0xa16095e72936aD6DAb012ec1b95222F6FCB5f5C2',
    receiverAddress: '0xa16095e72936aD6DAb012ec1b95222F6FCB5f5C2',
    appUrl: 'https://clawd-dca.vercel.app',
    basescanWriteUrl:
      'https://basescan.org/address/0xa16095e72936aD6DAb012ec1b95222F6FCB5f5C2',
  },
]
