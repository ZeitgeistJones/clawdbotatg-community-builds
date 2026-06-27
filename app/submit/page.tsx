'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount, useSignMessage } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import styles from './submit.module.css'

const EMOJIS = ['🛠️','🗣️','👁️','📊','🔐','🎮','🌐','🤖','💎','🔥','⚡','🧠','🎯','🪄','🦾']
const BUILD_STATUSES = ['building', 'beta', 'v1', 'offline']

export default function SubmitPage() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [form, setForm] = useState({
    name: '',
    desc: '',
    emoji: '🛠️',
    url: '',
    tag: 'tool',
    builder: '',
    buildStatus: 'building',
    customStatus: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [useCustom, setUseCustom] = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit() {
    if (!isConnected || !address) {
      setError('Connect your wallet first.')
      return
    }
    if (!form.name || !form.desc || !form.url || !form.builder) {
      setError('Fill in all fields before submitting.')
      return
    }
    if (!form.url.startsWith('http')) {
      setError('URL must start with http:// or https://')
      return
    }

    setError('')
    setStatus('loading')

    try {
      const message = `Submit project to clawdbotatg community builds\n\nProject: ${form.name}\nWallet: ${address}`
      const signature = await signMessageAsync({ message })

      const buildStatus = useCustom ? form.customStatus || 'building' : form.buildStatus

      const res = await fetch('/api/projects/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, buildStatus, walletAddress: address, signature }),
      })
      if (!res.ok) throw new Error()
      setStatus('success')
    } catch {
      setStatus('error')
      setError('Something went wrong. Try again.')
    }
  }

  if (status === 'success') {
    return (
      <main className={styles.wrap}>
        <div className={styles.success}>
          <span className={styles.successEmoji}>🎉</span>
          <h1>submitted!</h1>
          <p>Your project is pending review. Once approved it&apos;ll show up on the hub — and you&apos;ll be able to update your build status anytime with this wallet.</p>
          <Link href="/" className={styles.backBtn}>← back to the hub</Link>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.wrap}>
      <Link href="/" className={styles.back}>← back</Link>

      <div className={styles.header}>
        <h1 className={styles.title}>submit a project</h1>
        <p className={styles.subtitle}>CLAWD-related stuff only — reviewed before going live</p>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>your wallet</label>
          <div className={styles.walletWrap}>
            <ConnectButton chainStatus="none" showBalance={false} />
          </div>
          {isConnected && (
            <span className={styles.walletNote}>
              this wallet will be linked to your project so you can update your build status later
            </span>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>project name</label>
          <input type="text" placeholder="My CLAWD App" value={form.name} onChange={e => set('name', e.target.value)} maxLength={50} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>short description</label>
          <textarea placeholder="What it does, in one or two sentences" value={form.desc} onChange={e => set('desc', e.target.value)} maxLength={120} rows={2} style={{ resize: 'none' }} />
          <span className={styles.charCount}>{form.desc.length}/120</span>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>URL</label>
          <input type="url" placeholder="https://myapp.vercel.app" value={form.url} onChange={e => set('url', e.target.value)} />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>emoji</label>
            <select value={form.emoji} onChange={e => set('emoji', e.target.value)}>
              {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>category</label>
            <select value={form.tag} onChange={e => set('tag', e.target.value)}>
              <option value="tool">tool</option>
              <option value="data">data</option>
              <option value="game">game</option>
              <option value="social">social</option>
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>build status</label>
          <div className={styles.statusRow}>
            {BUILD_STATUSES.map(s => (
              <button
                key={s}
                type="button"
                className={`${styles.statusBtn} ${!useCustom && form.buildStatus === s ? styles.statusBtnActive : ''}`}
                onClick={() => { setUseCustom(false); set('buildStatus', s) }}
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
              value={form.customStatus}
              onChange={e => set('customStatus', e.target.value)}
              maxLength={20}
              style={{ marginTop: '8px' }}
            />
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label}>your name / handle</label>
          <input type="text" placeholder="Zeitgeist Jones" value={form.builder} onChange={e => set('builder', e.target.value)} maxLength={40} />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.submitBtn} onClick={handleSubmit} disabled={status === 'loading' || !isConnected}>
          {!isConnected ? 'connect wallet to submit' : status === 'loading' ? 'submitting…' : 'submit for review'}
        </button>
      </div>
    </main>
  )
}
