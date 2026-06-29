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

interface ComingSoonItem {
  id: string
  name: string
  desc: string
  emoji: string
  teaser?: string
}

const BUILD_STATUSES = ['building', 'beta', 'v1', 'offline']
const EMOJIS = ['🛠️','🗣️','👁️','📊','🔐','🎮','🌐','🤖','💎','🔥','⚡','🧠','🎯','🪄','🦾','⏳','🚀']

function AdminInner() {
  const params = useSearchParams()
  const key = params.get('key') || ''

  const [pending, setPending] = useState<Project[]>([])
  const [approved, setApproved] = useState<Project[]>([])
  const [comingSoon, setComingSoon] = useState<ComingSoonItem[]>([])
  const [loading, setLoading] = useState(true)
  const [auth, setAuth] = useState<boolean | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved' | 'coming-soon'>('pending')
  const [customStatus, setCustomStatus] = useState<Record<string, string>>({})
  const [savingCS, setSavingCS] = useState(false)

  // new coming soon form
  const [newCS, setNewCS] = useState({ name: '', desc: '', emoji: '⏳', teaser: '' })

  useEffect(() => {
    if (!key) { setAuth(false); setLoading(false); return }
    Promise.all([
      fetch(`/api/admin/list?key=${key}`).then(r => {
        if (r.status === 401) { setAuth(false); return null }
        setAuth(true)
        return r.json()
      }),
      fetch(`/api/admin/approved?key=${key}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/admin/coming-soon?key=${key}`).then(r => r.ok ? r.json() : []),
    ]).then(([pendingData, approvedData, csData]) => {
      if (pendingData) setPending(pendingData)
      if (approvedData) setApproved(approvedData)
      if (csData) setComingSoon(csData)
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

  async function saveComingSoon(items: ComingSoonItem[]) {
    setSavingCS(true)
    await fetch('/api/admin/coming-soon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, items }),
    })
    setSavingCS(false)
  }

  function addComingSoon() {
    if (!newCS.name) return
    const item: ComingSoonItem = {
      id: `cs-${Date.now()}`,
      name: newCS.name,
      desc: newCS.desc,
      emoji: newCS.emoji,
      teaser: newCS.teaser || undefined,
    }
    const updated = [...comingSoon, item]
    setComingSoon(updated)
    saveComingSoon(updated)
    setNewCS({ name: '', desc: '', emoji: '⏳', teaser: '' })
  }

  function removeComingSoon(id: string) {
    const updated = comingSoon.filter(c => c.id !== id)
    setComingSoon(updated)
    saveComingSoon(updated)
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
          <button className={`${styles.tab} ${tab === 'coming-soon' ? styles.tabActive : ''}`} onClick={() => setTab('coming-soon')}>
            coming soon {comingSoon.length > 0 && <span className={styles.badge}>{comingSoon.length}</span>}
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
          <div className={styles.empty}><span>📭</span><p>no approved projects in KV yet</p></div>
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
                      <button key={s}
                        className={`${styles.statusBtn} ${p.buildStatus === s ? styles.statusBtnActive : ''}`}
                        onClick={() => updateStatus(p.id, s)}
                        disabled={acting === p.id}>
                        {s}
                      </button>
                    ))}
                    <input type="text" placeholder="custom…" className={styles.customInput}
                      value={customStatus[p.id] || ''}
                      onChange={e => setCustomStatus(cs => ({ ...cs, [p.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && customStatus[p.id]) updateStatus(p.id, customStatus[p.id]) }}
                    />
                    {customStatus[p.id] && (
                      <button className={styles.statusBtn} onClick={() => updateStatus(p.id, customStatus[p.id])}>set</button>
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

      {tab === 'coming-soon' && (
        <div>
          {/* existing items */}
          {comingSoon.length > 0 && (
            <div className={styles.list} style={{ marginBottom: '1.5rem' }}>
              {comingSoon.map(c => (
                <div key={c.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.emoji}>{c.emoji}</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardName}>{c.name}</div>
                      <div className={styles.cardBuilder}>{c.desc}</div>
                      {c.teaser && <div className={styles.cardWallet}>teaser: {c.teaser}</div>}
                    </div>
                    <button className={styles.rejectBtn} onClick={() => removeComingSoon(c.id)}>remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* add new */}
          <div className={styles.card}>
            <div className={styles.statusLabel} style={{ marginBottom: '12px' }}>add coming soon project</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={newCS.emoji} onChange={e => setNewCS(n => ({ ...n, emoji: e.target.value }))}
                  style={{ width: '70px', padding: '8px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '16px' }}>
                  {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                </select>
                <input type="text" placeholder="project name" value={newCS.name}
                  onChange={e => setNewCS(n => ({ ...n, name: e.target.value }))}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
              </div>
              <input type="text" placeholder="short description" value={newCS.desc}
                onChange={e => setNewCS(n => ({ ...n, desc: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
              <input type="text" placeholder="teaser text (optional) — e.g. 'drops this week'" value={newCS.teaser}
                onChange={e => setNewCS(n => ({ ...n, teaser: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
              <button className={styles.approveBtn} onClick={addComingSoon} disabled={!newCS.name || savingCS}
                style={{ alignSelf: 'flex-start' }}>
                {savingCS ? 'saving…' : '+ add to hub'}
              </button>
            </div>
          </div>
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
