'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './submit.module.css'

const EMOJIS = ['🛠️','🗣️','👁️','📊','🔐','🎮','🌐','🤖','💎','🔥','⚡','🧠','🎯','🪄','🦾']

export default function SubmitPage() {
  const [form, setForm] = useState({
    name: '',
    desc: '',
    emoji: '🛠️',
    url: '',
    tag: 'tool',
    builder: '',
  })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit() {
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
      const res = await fetch('/api/projects/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
          <p>Your project is pending review. Once approved it&apos;ll show up on the hub.</p>
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
        <p className={styles.subtitle}>CLAWD-related stuff only — it&apos;ll be reviewed before going live</p>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label}>project name</label>
          <input
            type="text"
            placeholder="My CLAWD App"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            maxLength={50}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>short description</label>
          <textarea
            placeholder="What it does, in one or two sentences"
            value={form.desc}
            onChange={e => set('desc', e.target.value)}
            maxLength={120}
            rows={2}
            style={{ resize: 'none' }}
          />
          <span className={styles.charCount}>{form.desc.length}/120</span>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>URL</label>
          <input
            type="url"
            placeholder="https://myapp.vercel.app"
            value={form.url}
            onChange={e => set('url', e.target.value)}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>emoji</label>
            <select value={form.emoji} onChange={e => set('emoji', e.target.value)}>
              {EMOJIS.map(em => (
                <option key={em} value={em}>{em}</option>
              ))}
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
          <label className={styles.label}>your name / handle</label>
          <input
            type="text"
            placeholder="Zeitgeist Jones"
            value={form.builder}
            onChange={e => set('builder', e.target.value)}
            maxLength={40}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'submitting…' : 'submit for review'}
        </button>
      </div>
    </main>
  )
}
