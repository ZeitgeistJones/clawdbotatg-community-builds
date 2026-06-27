'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useSignMessage } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Link from 'next/link'
import styles from './edit.module.css'

const BUILD_STATUSES = ['building', 'beta', 'v1', 'offline']

function EditInner() {
  const params = useSearchParams()
  const projectId = params.get('id') || ''
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [project, setProject] = useState<{ name: string; buildStatus?: string; walletAddress?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [buildStatus, setBuildStatus] = useState('building')
  const [customStatus, setCustomStatus] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  useEffect(() => {
    if (!projectId) { setLoading(false); return }
    fetch(`/api/projects/get?id=${projectId}`)
      .then(r => r.json())
      .then(data => {
        setProject(data)
        if (data.buildStatus) {
          if (BUILD_STATUSES.includes(data.buildStatus)) {
            setBuildStatus(data.buildStatus)
          } else {
            setUseCustom(true)
            setCustomStatus(data.buildStatus)
          }
        }
      })
      .finally(() => setLoading(false))
  }, [projectId])

  async function handleSave() {
    if (!isConnected || !address) { setError('Connect your wallet first.'); return }
    if (!project) return

    const walletLower = address.toLowerCase()
    const projectWallet = project.walletAddress?.toLowerCase()

    if (projectWallet && walletLower !== projectWallet) {
      setError('This wallet doesn\'t match the one used to submit this project.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const newStatus = useCustom ? customStatus || 'building' : buildStatus
      const message = `Update build status for ${project.name}\nNew status: ${newStatus}\nWallet: ${address}`
      const signature = await signMessageAsync({ message })

      const res = await fetch('/api/projects/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, buildStatus: newStatus, walletAddress: address, signature }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed')
      }

      setSaved(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className={styles.center}>loading…</div>
  if (!project) return <div className={styles.center}>project not found</div>

  if (saved) {
    return (
      <main className={styles.wrap}>
        <div className={styles.success}>
          <span>✅</span>
          <h1>status updated!</h1>
          <p>Your project status is now live on the hub.</p>
          <Link href="/" className={styles.backBtn}>← back to the hub</Link>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.wrap}>
      <Link href="/" className={styles.back}>← back</Link>

      <div className={styles.header}>
        <h1 className={styles.title}>update build status</h1>
        <p className={styles.subtitle}>{project.name}</p>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>your wallet</label>
          <ConnectButton chainStatus="none" showBalance={false} />
          {isConnected && project.walletAddress && address?.toLowerCase() !== project.walletAddress.toLowerCase() && (
            <p className={styles.walletMismatch}>⚠️ wrong wallet — connect the one you submitted with</p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>build status</label>
          <div className={styles.statusRow}>
            {BUILD_STATUSES.map(s => (
              <button
                key={s}
                type="button"
                className={`${styles.statusBtn} ${!useCustom && buildStatus === s ? styles.statusBtnActive : ''}`}
                onClick={() => { setUseCustom(false); setBuildStatus(s) }}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.statusBtn} ${useCustom ? styles.statusBtnActive : ''}`}
              onClick={() => setUseCustom(true)}
            >
              custom
            </button>
          </div>
          {useCustom && (
            <input
              type="text"
              placeholder="e.g. paused, wip, shipit..."
              value={customStatus}
              onChange={e => setCustomStatus(e.target.value)}
              maxLength={20}
              style={{ marginTop: '8px' }}
            />
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving || !isConnected}
        >
          {saving ? 'signing…' : 'update status'}
        </button>
      </div>
    </main>
  )
}

export default function EditPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>loading…</div>}>
      <EditInner />
    </Suspense>
  )
}
