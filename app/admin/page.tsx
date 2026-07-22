'use client'

import { useEffect, useState, Suspense, type Dispatch, type SetStateAction } from 'react'
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
  burnConfig?: {
    mode?: 'execute' | 'direct'
    receiverAddress?: string
    poolAddress?: string
    executeSelector?: string
    rescorePaymentWei?: string | number
    startBlock?: number
  }
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

interface BurnConfigForm {
  mode: 'execute' | 'direct'
  receiverAddress: string
  poolAddress: string
  executeSelector: string
  rescorePaymentWei: string
  startBlock: string
}

interface QuickAddDraft {
  name: string
  desc: string
  emoji: string
  tag: string
  buildStatus: string
  featureTags?: { type: string; label: string; value?: string }[]
  burnConfig?: {
    mode?: 'execute' | 'direct'
    receiverAddress?: string
    poolAddress?: string
    executeSelector?: string
    rescorePaymentWei?: string
    startBlock?: number
  }
  url: string
  source: { hasStatusEndpoint: boolean; hasBurnConfigEndpoint: boolean; descFromClaude: boolean }
}

const EMPTY_BURN_FORM: BurnConfigForm = {
  mode: 'direct',
  receiverAddress: '',
  poolAddress: '',
  executeSelector: '',
  rescorePaymentWei: '',
  startBlock: '',
}

const BUILD_STATUSES = ['building', 'beta', 'v1', 'v2', 'v3', 'v4', 'offline']
const EMOJIS = ['⏳','🛠️','🗣️','👁️','📊','🔐','🎮','🌐','🤖','💎','🔥','⚡','🧠','🎯','🪄','🦾','🚀']

const EMPTY_CS: ComingSoonItem = { id: '', name: '', desc: '', emoji: '⏳', teaser: '', url: '' }

function toBurnForm(cfg?: Project['burnConfig']): BurnConfigForm {
  if (!cfg?.receiverAddress) return { ...EMPTY_BURN_FORM }
  return {
    mode: cfg.mode === 'execute' ? 'execute' : 'direct',
    receiverAddress: cfg.receiverAddress || '',
    poolAddress: cfg.poolAddress || '',
    executeSelector: cfg.executeSelector || '',
    rescorePaymentWei: cfg.rescorePaymentWei != null ? String(cfg.rescorePaymentWei) : '',
    startBlock: cfg.startBlock != null ? String(cfg.startBlock) : '',
  }
}

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
  const [editingCS, setEditingCS] = useState<ComingSoonItem | null>(null)
  const [burnTotal, setBurnTotal] = useState<string | null>(null)
  const [rescoreTotal, setRescoreTotal] = useState<number | null>(null)
  const [burnByApp, setBurnByApp] = useState<Record<string, string>>({})
  const [rescoresByApp, setRescoresByApp] = useState<Record<string, number>>({})
  const [syncingBurns, setSyncingBurns] = useState(false)
  const [burnStatus, setBurnStatus] = useState<string | null>(null)
  const [burnError, setBurnError] = useState<string | null>(null)

  const [quickUrl, setQuickUrl] = useState('')
  const [autofilling, setAutofilling] = useState(false)
  const [autofillError, setAutofillError] = useState<string | null>(null)
  const [draft, setDraft] = useState<QuickAddDraft | null>(null)
  const [adding, setAdding] = useState(false)

  const [editingInfoId, setEditingInfoId] = useState<string | null>(null)
  const [infoForm, setInfoForm] = useState<{ name: string; builder: string }>({ name: '', builder: '' })
  const [savingInfo, setSavingInfo] = useState(false)

  const [draftBurnForm, setDraftBurnForm] = useState<BurnConfigForm>(EMPTY_BURN_FORM)
  const [showDraftBurnForm, setShowDraftBurnForm] = useState(false)

  const [editingBurnId, setEditingBurnId] = useState<string | null>(null)
  const [burnForm, setBurnForm] = useState<BurnConfigForm>(EMPTY_BURN_FORM)
  const [savingBurn, setSavingBurn] = useState(false)

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
        setBurnTotal(burnData.hubBurn?.totalFormatted ?? burnData.formatted)
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

  async function runAutofill() {
    if (!quickUrl) return
    setAutofilling(true)
    setAutofillError(null)
    setDraft(null)
    setShowDraftBurnForm(false)
    setDraftBurnForm(EMPTY_BURN_FORM)
    try {
      const res = await fetch('/api/admin/autofill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: quickUrl, key }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAutofillError(data.error || 'Autofill failed')
        return
      }
      setDraft(data)
      if (data.burnConfig?.receiverAddress) {
        setDraftBurnForm(toBurnForm(data.burnConfig))
        setShowDraftBurnForm(true)
      }
    } catch {
      setAutofillError('Network error during autofill')
    } finally {
      setAutofilling(false)
    }
  }

  function burnFormToConfig(f: BurnConfigForm) {
    if (!f.receiverAddress.trim()) return undefined
    return {
      mode: f.mode,
      receiverAddress: f.receiverAddress.trim(),
      poolAddress: f.poolAddress.trim() || undefined,
      executeSelector: f.mode === 'execute' ? (f.executeSelector.trim() || undefined) : undefined,
      rescorePaymentWei: f.mode === 'execute' ? (f.rescorePaymentWei.trim() || undefined) : undefined,
      startBlock: f.startBlock.trim() ? Number(f.startBlock.trim()) : undefined,
    }
  }

  async function submitQuickAdd() {
    if (!draft || !draft.name || !draft.url) return
    setAdding(true)
    setAutofillError(null)
    try {
      const res = await fetch('/api/admin/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, burnConfig: burnFormToConfig(draftBurnForm), key }),
      })
      if (res.ok) {
        const project = await res.json()
        setApproved(a => [project, ...a])
        setDraft(null)
        setQuickUrl('')
        setDraftBurnForm(EMPTY_BURN_FORM)
        setShowDraftBurnForm(false)
        setTab('approved')
      } else {
        const data = await res.json().catch(() => ({}))
        setAutofillError(data.error || 'Could not add project')
      }
    } catch {
      setAutofillError('Network error while adding')
    } finally {
      setAdding(false)
    }
  }

  function setDraftField<K extends keyof QuickAddDraft>(field: K, value: QuickAddDraft[K]) {
    setDraft(d => d ? { ...d, [field]: value } : d)
  }

  function startEditBurn(id: string, existing?: BurnConfigForm) {
    setEditingBurnId(id)
    setBurnForm(existing || { ...EMPTY_BURN_FORM })
  }

  async function saveBurnConfig(id: string) {
    setSavingBurn(true)
    try {
      const cleaned = burnFormToConfig(burnForm) || null
      const res = await fetch('/api/admin/update-burn-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, burnConfig: cleaned, key }),
      })
      if (res.ok) {
        setApproved(a => a.map(p => {
          if (p.id !== id) return p
          if (cleaned) return { ...p, burnConfig: cleaned }
          const { burnConfig: _removed, ...rest } = p
          return rest
        }))
        setEditingBurnId(null)
      }
    } catch {
      // leave form open to retry
    }
    setSavingBurn(false)
  }

  function startEditInfo(p: { id: string; name: string; builder: string }) {
    setEditingInfoId(p.id)
    setInfoForm({ name: p.name, builder: p.builder })
  }

  async function saveInfo(id: string) {
    if (!infoForm.name.trim() || !infoForm.builder.trim()) return
    setSavingInfo(true)
    try {
      const res = await fetch('/api/admin/update-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: infoForm.name.trim(), builder: infoForm.builder.trim(), key }),
      })
      if (res.ok) {
        setApproved(a => a.map(p => p.id === id ? { ...p, name: infoForm.name.trim(), builder: infoForm.builder.trim() } : p))
        setEditingInfoId(null)
      }
    } catch {
      // leave the edit form open so they can retry
    }
    setSavingInfo(false)
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

      setBurnTotal(data.hubBurn?.totalFormatted ?? data.formatted)
      setRescoreTotal(data.rescores ?? 0)

      const r = data.results?.[0]
      const warn = r?.rescoreWarning
      if (r && !r.scanComplete) {
        setBurnStatus(`block ${r.scannedTo}${warn ? ` · rescores: ${warn}` : ''} — click backfill again`)
      } else if (warn) {
        setBurnStatus(`sync done · rescores: ${warn}`)
      } else {
        setBurnStatus('sync complete')
      }

      const stats = await fetch(`/api/admin/backfill-burns?key=${key}`).then(r => r.json())
      setBurnTotal(stats.hubBurn?.totalFormatted ?? stats.formatted ?? data.hubBurn?.totalFormatted ?? data.formatted)
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
      updated = comingSoon.map(c => c.id === item.id ? item : c)
    } else {
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

        {/* QUICK ADD */}
        <div className={styles.card} style={{ marginBottom: '1rem' }}>
          <div className={styles.statusLabel} style={{ marginBottom: '8px' }}>🔗 quick add from link</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="url"
              placeholder="https://someapp.vercel.app"
              value={quickUrl}
              onChange={e => setQuickUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && quickUrl && !autofilling) runAutofill() }}
              style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }}
            />
            <button className={styles.approveBtn} onClick={runAutofill} disabled={!quickUrl || autofilling}>
              {autofilling ? 'reading site…' : 'autofill'}
            </button>
          </div>
          {autofillError && <p className={styles.error}>{autofillError}</p>}

          {draft && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={draft.emoji} onChange={e => setDraftField('emoji', e.target.value)}
                  style={{ width: '70px', padding: '8px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '16px', fontFamily: 'inherit' }}>
                  {EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                </select>
                <input type="text" placeholder="name" value={draft.name}
                  onChange={e => setDraftField('name', e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }} />
                <select value={draft.tag} onChange={e => setDraftField('tag', e.target.value)}
                  style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit' }}>
                  <option value="tool">tool</option>
                  <option value="data">data</option>
                  <option value="game">game</option>
                  <option value="social">social</option>
                </select>
              </div>
              <textarea placeholder="description" value={draft.desc} rows={2}
                onChange={e => setDraftField('desc', e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit', resize: 'none' }} />
              <div className={styles.statusRow}>
                {BUILD_STATUSES.map(s => (
                  <button key={s}
                    className={`${styles.statusBtn} ${draft.buildStatus === s ? styles.statusBtnActive : ''}`}
                    onClick={() => setDraftField('buildStatus', s)}>
                    {s}
                  </button>
                ))}
                <input type="text" placeholder="custom…" className={styles.customInput}
                  value={BUILD_STATUSES.includes(draft.buildStatus) ? '' : draft.buildStatus}
                  onChange={e => setDraftField('buildStatus', e.target.value)}
                />
              </div>
              <div className={styles.cardWallet}>
                {draft.source.hasStatusEndpoint ? '✓ pulled live status/tags from /api/status' : 'no /api/status found on that site — check tags manually'}
                {' · '}
                {draft.source.descFromClaude ? 'description drafted by claude' : 'description scraped from page meta tags'}
              </div>
              {draft.featureTags && draft.featureTags.length > 0 && (
                <div className={styles.cardWallet}>tags: {draft.featureTags.map(t => t.label).join(', ')}</div>
              )}

              <div className={styles.cardWallet}>
                {draft.source.hasBurnConfigEndpoint
                  ? '🔥 burn config detected from /api/burn-config'
                  : 'no /api/burn-config found — add burn details manually if this app burns CLAWD'}
                {' '}
                <button className={styles.statusBtn} style={{ marginLeft: '6px' }} onClick={() => setShowDraftBurnForm(s => !s)}>
                  {showDraftBurnForm ? 'hide' : draftBurnForm.receiverAddress ? 'edit burn config' : 'add burn config'}
                </button>
              </div>
              {showDraftBurnForm && (
                <BurnConfigFields form={draftBurnForm} setForm={setDraftBurnForm} />
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className={styles.approveBtn} onClick={submitQuickAdd} disabled={adding || !draft.name}>
                  {adding ? 'adding…' : '+ add to hub'}
                </button>
                <button className={styles.rejectBtn} onClick={() => {
                  setDraft(null)
                  setDraftBurnForm(EMPTY_BURN_FORM)
                  setShowDraftBurnForm(false)
                }}>cancel</button>
              </div>
            </div>
          )}
        </div>

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
                      {editingInfoId === p.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '4px' }}>
                          <input type="text" value={infoForm.name}
                            onChange={e => setInfoForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="project name"
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', fontFamily: 'inherit', fontWeight: 600 }} />
                          <input type="text" value={infoForm.builder}
                            onChange={e => setInfoForm(f => ({ ...f, builder: e.target.value }))}
                            placeholder="builder name / handle"
                            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '12px', fontFamily: 'inherit' }} />
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button className={styles.approveBtn} onClick={() => saveInfo(p.id)} disabled={savingInfo}>
                              {savingInfo ? 'saving…' : 'save changes'}
                            </button>
                            <button className={styles.statusBtn} onClick={() => setEditingInfoId(null)}>cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.cardName}>
                          {p.name}
                          {p.id.startsWith('seed-') && <span className={styles.seedBadge}>original</span>}
                          {!p.id.startsWith('seed-') && (
                            <button className={styles.statusBtn} style={{ marginLeft: '8px' }} onClick={() => startEditInfo(p)}>edit</button>
                          )}
                        </div>
                      )}
                      {editingInfoId !== p.id && <div className={styles.cardBuilder}>by {p.builder}</div>}
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
                    {!p.id.startsWith('seed-') && (
                      <div style={{ marginTop: '8px' }}>
                        {editingBurnId === p.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button className={styles.approveBtn} onClick={() => saveBurnConfig(p.id)} disabled={savingBurn}>
                                {savingBurn ? 'saving…' : 'save changes'}
                              </button>
                              <button className={styles.statusBtn} onClick={() => setEditingBurnId(null)}>cancel</button>
                            </div>
                            <BurnConfigFields form={burnForm} setForm={setBurnForm} />
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button className={styles.approveBtn} onClick={() => saveBurnConfig(p.id)} disabled={savingBurn}>
                                {savingBurn ? 'saving…' : 'save changes'}
                              </button>
                              <button className={styles.statusBtn} onClick={() => setEditingBurnId(null)}>cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className={styles.statusBtn} onClick={() => startEditBurn(p.id, toBurnForm(p.burnConfig))}>
                            {p.burnConfig?.receiverAddress ? '🔥 edit burn config' : '+ add burn config'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* COMING SOON */}
      {tab === 'coming-soon' && (
        <div>
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

          <CSForm
            key={editingCS?.id ?? 'new'}
            initial={editingCS || EMPTY_CS}
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

function BurnConfigFields({
  form,
  setForm,
}: {
  form: BurnConfigForm
  setForm: Dispatch<SetStateAction<BurnConfigForm>>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', background: '#fafafa', borderRadius: '8px' }}>
      <div className={styles.statusRow}>
        <button className={`${styles.statusBtn} ${form.mode === 'direct' ? styles.statusBtnActive : ''}`}
          onClick={() => setForm(f => ({ ...f, mode: 'direct' }))}>
          direct (third-party app)
        </button>
        <button className={`${styles.statusBtn} ${form.mode === 'execute' ? styles.statusBtnActive : ''}`}
          onClick={() => setForm(f => ({ ...f, mode: 'execute' }))}>
          execute() (your shared receiver)
        </button>
      </div>
      <input type="text" placeholder="receiver address (0x...)" value={form.receiverAddress}
        onChange={e => setForm(f => ({ ...f, receiverAddress: e.target.value }))}
        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '12px', fontFamily: 'monospace' }} />
      <input type="text" placeholder="pool address (optional, 0x...)" value={form.poolAddress}
        onChange={e => setForm(f => ({ ...f, poolAddress: e.target.value }))}
        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '12px', fontFamily: 'monospace' }} />
      {form.mode === 'execute' && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input type="text" placeholder="execute selector (optional, 0x...)" value={form.executeSelector}
            onChange={e => setForm(f => ({ ...f, executeSelector: e.target.value }))}
            style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '12px', fontFamily: 'monospace' }} />
          <input type="text" placeholder="rescore payment wei (optional)" value={form.rescorePaymentWei}
            onChange={e => setForm(f => ({ ...f, rescorePaymentWei: e.target.value }))}
            style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '12px', fontFamily: 'monospace' }} />
        </div>
      )}
      <input type="text" placeholder="start block (optional)" value={form.startBlock}
        onChange={e => setForm(f => ({ ...f, startBlock: e.target.value }))}
        style={{ width: '150px', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '12px', fontFamily: 'monospace' }} />
    </div>
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
