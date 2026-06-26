'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import styles from './admin.module.css'

interface Project {
  id: string
  name: string
  desc: string
  emoji: string
  url: string
  tag: string
  builder: string
  status: string
  submittedAt: number
}

function AdminInner() {
  const params = useSearchParams()
  const key = params.get('key') || ''

  const [pending, setPending] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [auth, setAuth] = useState<boolean | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  useEffect(() => {
    if (!key) { setAuth(false); setLoading(false); return }
    fetch(`/api/admin/list?key=${key}`)
      .then(r => {
        if (r.status === 401) { setAuth(false); return null }
        setAuth(true)
        return r.json()
      })
      .then(data => { if (data) setPending(data) })
      .finally(() => setLoading(false))
  }, [key])

  async function act(id: string, action: 'approve' | 'reject') {
    setActing(id)
    await fetch(`/api/admin/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, key }),
    })
    setPending(p => p.filter(x => x.id !== id))
    setActing(null)
  }

  if (loading) return <div className={styles.center}>loading…</div>
  if (auth === false) return (
    <div className={styles.center}>
      <p className={styles.denied}>🔐 access denied</p>
      <p className={styles.hint}>add <code>?key=YOURKEY</code> to the URL</p>
    </div>
  )

  return (
    <main className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>admin panel</h1>
        <p className={styles.subtitle}>{pending.length} pending submission{pending.length !== 1 ? 's' : ''}</p>
      </div>

      {pending.length === 0 ? (
        <div className={styles.empty}>
          <span>✅</span>
          <p>all clear — nothing waiting for review</p>
        </div>
      ) : (
        <div className={styles.list}>
          {pending.map(p => (
            <div key={p.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.emoji}>{p.emoji}</span>
                <div className={styles.cardInfo}>
                  <div className={styles.cardName}>{p.name}</div>
                  <div className={styles.cardBuilder}>by {p.builder}</div>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.cardUrl}
                  >
                    {p.url}
                  </a>
                </div>
                <span className={styles.tagPill}>{p.tag}</span>
              </div>
              <p className={styles.cardDesc}>{p.desc}</p>
              <div className={styles.actions}>
                <button
                  className={styles.approveBtn}
                  onClick={() => act(p.id, 'approve')}
                  disabled={acting === p.id}
                >
                  {acting === p.id ? '…' : '✓ approve'}
                </button>
                <button
                  className={styles.rejectBtn}
                  onClick={() => act(p.id, 'reject')}
                  disabled={acting === p.id}
                >
                  {acting === p.id ? '…' : '✕ reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>loading…</div>}>
      <AdminInner />
    </Suspense>
  )
}
