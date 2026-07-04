'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import styles from './burnHub.module.css'

const EXECUTE_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

interface Props {
  receiver: `0x${string}`
  disabled?: boolean
  onSuccess?: () => void
}

export default function TriggerExecuteBurnButton({ receiver, disabled, onSuccess }: Props) {
  const { isConnected } = useAccount()
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) onSuccess?.()
  }, [isSuccess, onSuccess])

  if (!isConnected) {
    return (
      <div className={styles.connectWrap}>
        <ConnectButton chainStatus="none" showBalance={false} />
      </div>
    )
  }

  const busy = isPending || confirming

  return (
    <div className={styles.burnBtnWrap}>
      <button
        type="button"
        className={styles.burnBtn}
        disabled={disabled || busy}
        onClick={() => {
          reset()
          writeContract({
            address: receiver,
            abi: EXECUTE_ABI,
            functionName: 'execute',
          })
        }}
      >
        {busy ? 'burning…' : 'burn now'}
      </button>
      {isSuccess && hash && (
        <a
          className={styles.txLink}
          href={`https://basescan.org/tx/${hash}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          tx ↗
        </a>
      )}
      {error && <span className={styles.burnError}>{error.message.slice(0, 80)}</span>}
    </div>
  )
}
