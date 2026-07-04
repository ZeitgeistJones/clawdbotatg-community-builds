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
  url?: string
}

const BUILD_STATUSES = ['building', 'beta', 'v1', 'offline']
const EMOJIS = ['⏳','🛠️','🗣️','👁️','📊','🔐','🎮','🌐','🤖','💎','🔥','⚡','🧠','🎯','🪄','🦾','🚀']

const EMPTY_CS: ComingSoonItem = { id: '', name: '', desc: '', emoji: '⏳', teaser: '', url: '' }

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
  const [editingCS, setEditingCS] = useState<ComingSoonItem | null>(null) // null = new form
  const [burnTotal, setBurnTotal] = useState<string | null>(null)
  const [rescoreTotal, setRescoreTotal] = useState<number | null>(null)
  const [burnByApp, setBurnByApp] = useState<Record<string, string>>({})
  const [rescoresByApp, setRescoresByApp] = useState<Record<string, number>>({})
  const [syncingBurns, setSyncingBurns] = useState(false)
  const [burnStatus, setBurnStatus] = useState<string | null>(null)
  const [burnError, setBurnError] = useState<string | null>(null)

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
      fetch(`/api/admin/backfill-burns?key=${key}`).then(r => r.ok ? r.json() : null),
    ]).then(([pendingData, approvedData, csData, burnData]) => {
      if (pendingData) setPending(pendingData)
      if (approvedData) setApproved(approvedData)
      if (csData) setComingSoon(csData)
      if (burnData) {
        setBurnTotal(burnData.formatted)
        setRescoreTotal(burnData.rescores ?? 0)
        const map: Record<string, string> = {}
        const rMap: Record<string, number> = {}
        for (const row of burnData.byApp || []) {
          map[row.projectId] = row.formatted
          rMap[row.projectId] = row.rescores ?? 0
        }
        setBurnByApp(map)
        setRescoresByApp(rMap)
      }
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

  async function removeApproved(id: string) {
    if (!confirm('Remove this project from the hub?')) return
    setActing(id)
    const res = await fetch('/api/admin/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, key }),
    })
    if (res.ok) setApproved(a => a.filter(p => p.id !== id))
    setActing(null)
  }

  async function syncBurns(fullBackfill: boolean) {
    setSyncingBurns(true)
    setBurnError(null)
    setBurnStatus(fullBackfill ? 'running one batch…' : 'syncing…')

    try {
      const res = await fetch('/api/admin/backfill-burns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, fullBackfill }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBurnError(data.error || 'Sync failed — wait 2–3 min if rate limited')
        return
      }

      setBurnTotal(data.formatted)
      setRescoreTotal(data.rescores ?? 0)

      const r = data.results?.[0]
      if (r?.rescorePagesRemaining) {
        setBurnStatus('rescores: click backfill again for next page')
      } else if (r && !r.scanComplete) {
        setBurnStatus(`burn logs at block ${r.scannedTo} — click backfill again`)
      } else {
        setBurnStatus('sync complete')
      }

      const stats = await fetch(`/api/admin/backfill-burns?key=${key}`).then(r => r.json())
      const map: Record<string, string> = {}
      const rMap: Record<string, number> = {}
      for (const row of stats.byApp || []) {
        map[row.projectId] = row.formatted
        rMap[row.projectId] = row.rescores ?? 0
      }
      setBurnByApp(map)
      setRescoresByApp(rMap)
    } catch {
      setBurnError('Network error during sync')
    }

    setSyncingBurns(false)
  }

  async function persistCS(items: ComingSoonItem[]) {
    setSavingCS(true)
    await fetch('/api/admin/coming-soon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, items }),
    })
    setSavingCS(false)
  }

  function saveCSItem(item: ComingSoonItem) {
    if (!item.name) return
    let updated: ComingSoonItem[]
    if (item.id && comingSoon.find(c => c.id === item.id)) {
      // editing existing
      updated = comingSoon.map(c => c.id === item.id ? item : c)
    } else {
      // new item
      updated = [...comingSoon, { ...item, id: `cs-${Date.now()}` }]
    }
    setComingSoon(updated)
    persistCS(updated)
    setEditingCS(null)
  }

  function removeCS(id: string) {
    const updated = comingSoon.filter(c => c.id !== id)
    setComingSoon(updated)
    persistCS(updated)
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
        {auth && (
          <div className={styles.burnBar}>
            <span>
              🔥 {burnTotal ?? '…'} CLAWD burned
              {rescoreTotal != null && rescoreTotal > 0 && ` · ${rescoreTotal} rescores`}
            </span>
            <div className={styles.burnActions}>
              <button className={styles.statusBtn} onClick={() => syncBurns(false)} disabled={syncingBurns}>
                {syncingBurns ? '…' : 'sync'}
              </button>
              <button className={styles.statusBtn} onClick={() => syncBurns(true)} disabled={syncingBurns}>
                {syncingBurns ? '…' : 'backfill'}
              </button>
            </div>
          </div>
        )}
        {burnStatus && <div className={styles.burnStatus}>{burnStatus}</div>}
        {burnError && <div className={styles.burnError}>{burnError}</div>}
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

      {/* PENDING */}
      {tab === 'pending' && (
        pending.length === 0
          ? <div className={styles.empty}><span>✅</span><p>nothing pending</p></div>
          : <div className={styles.list}>
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
      )}

      {/* APPROVED */}
      {tab === 'approved' && (
        approved.length === 0
          ? <div className={styles.empty}><span>📭</span><p>no live projects on the hub</p></div>
          : <div className={styles.list}>
              {approved.map(p => (
                <div key={p.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.emoji}>{p.emoji}</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardName}>
                        {p.name}
                        {p.id.startsWith('seed-') && <span className={styles.seedBadge}>original</span>}
                      </div>
                      <div className={styles.cardBuilder}>by {p.builder}</div>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className={styles.cardUrl}>{p.url}</a>
                    </div>
                    <div className={styles.cardActions}>
                      <span className={styles.tagPill}>{p.tag}</span>
                      <button
                        className={styles.rejectBtn}
                        onClick={() => removeApproved(p.id)}
                        disabled={acting === p.id}
                      >
                        {acting === p.id ? '…' : 'remove'}
                      </button>
                    </div>
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
                    {burnByApp[p.id] && (
                      <div className={styles.burnAppTotal}>🔥 {burnByApp[p.id]} CLAWD burned</div>
                    )}
                    {(rescoresByApp[p.id] ?? 0) > 0 && (
                      <div className={styles.burnAppTotal}>📊 {rescoresByApp[p.id]} rescores (burn batches pending)</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* COMING SOON */}
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
                      {c.url && <div className={styles.cardWallet}>url: {c.url}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button className={styles.statusBtn} onClick={() => setEditingCS(c)}>edit</button>
                      <button className={styles.rejectBtn} onClick={() => removeCS(c.id)}>remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* add/edit form */}
          <CSForm
            initial={editingCS || { ...EMPTY_CS }}
            isEditing={!!editingCS}
            saving={savingCS}
            emojis={EMOJIS}
            onSave={saveCSItem}
            onCancel={() => setEditingCS(null)}
          />
        </div>
      )}
    </main>
  )
}

function CSForm({ initial, isEditing, saving, emojis, onSave, onCancel }: {
  initial: ComingSoonItem
  isEditing: boolean
  saving: boolean
  emojis: string[]
  onSave: (item: ComingSoonItem) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<ComingSoonItem>(initial)

  useEffect(() => { setForm(initial) }, [initial])

  function set(field: keyof ComingSoonItem, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  return (
    <div className={styles.card}>
      <div className={styles.statusLabel} style={{ marginBottom: '12px' }}>
        {isEditing ? `editing: ${initial.name}` : 'add coming soon project'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={form.emoji} onChange={e => set('emoji', e.target.value)}
            style={{ width: '70px', padding: '8px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '16px', fontFamily: 'inherit' }}>
            {emojis.map(em => <option key={em} value={em}>{em}</option>)}
          </select>
          <input type="text" placeholder="project name *" value={form.name}
            onChange={e => set('name', e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
        </div>
        <input type="text" placeholder="short description" value={form.desc}
          onChange={e => set('desc', e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
        <input type="text" placeholder="teaser (optional) — e.g. drops this week" value={form.teaser || ''}
          onChange={e => set('teaser', e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
        <input type="url" placeholder="site URL (optional) — shows blurred preview on card" value={form.url || ''}
          onChange={e => set('url', e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={styles.approveBtn} onClick={() => onSave(form)} disabled={!form.name || saving}>
            {saving ? 'saving…' : isEditing ? 'save changes' : '+ add to hub'}
          </button>
          {isEditing && (
            <button className={styles.rejectBtn} onClick={onCancel}>cancel</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>loading…</div>}>
      <AdminInner />
    </Suspense>
  )
}
