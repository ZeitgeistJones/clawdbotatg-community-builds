/** Apps on the hub that use batch execute() → CLAWD → dead */
export interface BurnAppEntry {
  id: string
  name: string
  host: string
  receiverAddress: `0x${string}`
  executeSelector: `0x${string}`
  appUrl: string
  basescanWriteUrl: string
}

export const BURN_APPS: BurnAppEntry[] = [
  {
    id: 'build-report',
    name: 'Build Report',
    host: 'the-build-report.vercel.app',
    receiverAddress: '0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad',
    executeSelector: '0x61461954',
    appUrl: 'https://the-build-report.vercel.app',
    basescanWriteUrl:
      'https://basescan.org/address/0x0C1a3DB07304D2E4E551AB4A7b083382a33f25ad#writeContract',
  },
]
