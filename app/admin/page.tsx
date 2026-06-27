'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import styles from './admin.module.css'

interface Project {
  id: string
  name: string
  desc: string
  emoji: string
  url: string
  tag: string
  builder: string
  walletAddress?: string
  status: string
  buildStatus?: string
  submittedAt: number
}

const BUILD_STATUSES = ['building', 'beta', 'v1', 'offline']

function AdminInner() {
  const params = useSearchParams()
  const key = params.get('key') || ''

  const [pending, setPending] = useState<Project[]>([])
  const [approved, setApproved] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [auth, setAuth] = useState<boolean | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')
  const [customStatus, setCustomStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!key) { setAuth(false); setLoading(false); return }
    Promise.all([
      fetch(`/api/admin/list?key=${key}`).then(r => {
        if (r.status === 401) { setAuth(false); return null }
        setAuth(true)
        return r.json()
      }),
      fetch(`/api/admin/approved?key=${key}`).then(r => r.ok ? r.json() : [])
    ]).then(([pendingData, approvedData]) => {
      if (pendingData) setPending(pendingData)
      if (approvedData) setApproved(approvedData)
    }).finally(() => setLoading(false))
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

  async function updateStatus(id: string, buildStatus: string) {
    setActing(id)
    await fetch('/api/admin/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, buildStatus, key }),
    })
    setApproved(a => a.map(p => p.id === id ? { ...p, buildStatus } : p))
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
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'pending' ? styles.tabActive : ''}`} onClick={() => setTab('pending')}>
            pending {pending.length > 0 && <span className={styles.badge}>{pending.length}</span>}
          </button>
          <button className={`${styles.tab} ${tab === 'approved' ? styles.tabActive : ''}`} onClick={() => setTab('approved')}>
            approved
          </button>
        </div>
      </div>

      {tab === 'pending' && (
        pending.length === 0 ? (
          <div className={styles.empty}><span>✅</span><p>nothing pending</p></div>
        ) : (
          <div className={styles.list}>
            {pending.map(p => (
              <div key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.emoji}>{p.emoji}</span>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardName}>{p.name}</div>
                    <div className={styles.cardBuilder}>by {p.builder}</div>
                    {p.walletAddress && <div className={styles.cardWallet}>{p.walletAddress.slice(0,6)}…{p.walletAddress.slice(-4)}</div>}
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.cardUrl}>{p.url}</a>
                  </div>
                  <span className={styles.tagPill}>{p.tag}</span>
                </div>
                <p className={styles.cardDesc}>{p.desc}</p>
                <div className={styles.actions}>
                  <button className={styles.approveBtn} onClick={() => act(p.id, 'approve')} disabled={acting === p.id}>
                    {acting === p.id ? '…' : '✓ approve'}
                  </button>
                  <button className={styles.rejectBtn} onClick={() => act(p.id, 'reject')} disabled={acting === p.id}>
                    {acting === p.id ? '…' : '✕ reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'approved' && (
        approved.length === 0 ? (
          <div className={styles.empty}><span>📭</span><p>no approved projects in KV yet — seed projects are hardcoded</p></div>
        ) : (
          <div className={styles.list}>
            {approved.map(p => (
              <div key={p.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.emoji}>{p.emoji}</span>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardName}>{p.name}</div>
                    <div className={styles.cardBuilder}>by {p.builder}</div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.cardUrl}>{p.url}</a>
                  </div>
                  <span className={styles.tagPill}>{p.tag}</span>
                </div>
                <div className={styles.statusSection}>
                  <div className={styles.statusLabel}>build status</div>
                  <div className={styles.statusRow}>
                    {BUILD_STATUSES.map(s => (
                      <button
                        key={s}
                        className={`${styles.statusBtn} ${p.buildStatus === s ? styles.statusBtnActive : ''}`}
                        onClick={() => updateStatus(p.id, s)}
                        disabled={acting === p.id}
                      >
                        {s}
                      </button>
                    ))}
                    <input
                      type="text"
                      placeholder="custom…"
                      className={styles.customInput}
                      value={customStatus[p.id] || ''}
                      onChange={e => setCustomStatus(cs => ({ ...cs, [p.id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customStatus[p.id]) updateStatus(p.id, customStatus[p.id])
                      }}
                    />
                    {customStatus[p.id] && (
                      <button className={styles.statusBtn} onClick={() => updateStatus(p.id, customStatus[p.id])}>
                        set
                      </button>
                    )}
                  </div>
                  <div className={styles.editLink}>
                    builder edit link: <a href={`/edit?id=${p.id}`} target="_blank" rel="noopener noreferrer">/edit?id={p.id}</a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
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
