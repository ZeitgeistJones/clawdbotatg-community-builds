'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useSignMessage } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import Link from 'next/link'
import styles from './edit.module.css'

const BUILD_STATUSES = ['building', 'beta', 'v1', 'offline']

const PRESET_TAGS = [
  { type: 'free',             label: 'Free to use',       icon: '🌐', hasValue: false },
  { type: 'free_uses',        label: 'Free uses',         icon: '⚡', hasValue: true,  valuePlaceholder: 'e.g. 1 free scan' },
  { type: 'token_gate',       label: 'Token gate',        icon: '🔒', hasValue: true,  valuePlaceholder: 'e.g. 10M CLAWD' },
  { type: 'paid',             label: 'Paid',              icon: '💵', hasValue: true,  valuePlaceholder: 'e.g. $0.10/gen' },
  { type: 'burns_clawd',      label: 'Burns CLAWD',       icon: '🔥', hasValue: true,  valuePlaceholder: 'e.g. 5% or 1000 CLAWD/gen' },
  { type: 'subject_to_change',label: 'Subject to change', icon: '⚠️', hasValue: false },
  { type: 'custom',           label: 'Custom',            icon: '•',  hasValue: true,  valuePlaceholder: 'e.g. invite only' },
]

interface FeatureTag {
  type: string
  label: string
  value?: string
}

interface TagEntry {
  type: string
  icon: string
  value: string
}

function buildLabel(type: string, icon: string, value: string): string {
  const preset = PRESET_TAGS.find(p => p.type === type)
  if (!preset?.hasValue) return preset?.label || value
  return value || preset.label
}

function EditInner() {
  const params = useSearchParams()
  const projectId = params.get('id') || ''
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [project, setProject] = useState<{ name: string; buildStatus?: string; walletAddress?: string; featureTags?: FeatureTag[]; manualTagsOverride?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [buildStatus, setBuildStatus] = useState('building')
  const [customBuildStatus, setCustomBuildStatus] = useState('')
  const [useCustomBuild, setUseCustomBuild] = useState(false)
  const [manualOverride, setManualOverride] = useState(false)

  // tag builder
  const [tags, setTags] = useState<TagEntry[]>([])
  const [addingType, setAddingType] = useState('')
  const [addingValue, setAddingValue] = useState('')

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
            setUseCustomBuild(true)
            setCustomBuildStatus(data.buildStatus)
          }
        }
        if (data.featureTags) {
          setTags(data.featureTags.map((ft: FeatureTag) => {
            const preset = PRESET_TAGS.find(p => p.type === ft.type)
            return { type: ft.type, icon: preset?.icon || '•', value: ft.value || ft.label }
          }))
        }
        setManualOverride(data.manualTagsOverride ?? false)
      })
      .finally(() => setLoading(false))
  }, [projectId])

  function addTag() {
    if (!addingType) return
    const preset = PRESET_TAGS.find(p => p.type === addingType)
    setTags(t => [...t, { type: addingType, icon: preset?.icon || '•', value: addingValue || preset?.label || '' }])
    setAddingType('')
    setAddingValue('')
  }

  function removeTag(i: number) {
    setTags(t => t.filter((_, idx) => idx !== i))
  }

  function updateTagValue(i: number, value: string) {
    setTags(t => t.map((tag, idx) => idx === i ? { ...tag, value } : tag))
  }

  async function handleSave() {
    if (!isConnected || !address) { setError('Connect your wallet first.'); return }
    if (!project) return

    if (project.walletAddress && address.toLowerCase() !== project.walletAddress.toLowerCase()) {
      setError('Wrong wallet — connect the one you submitted with.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const newBuildStatus = useCustomBuild ? customBuildStatus || 'building' : buildStatus
      const featureTags: FeatureTag[] = tags.map(t => ({
        type: t.type,
        label: buildLabel(t.type, t.icon, t.value),
        value: t.value,
      }))

      const message = `Update project info for ${project.name}\nWallet: ${address}`
      const signature = await signMessageAsync({ message })

      const res = await fetch('/api/projects/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          buildStatus: newBuildStatus,
          featureTags,
          manualTagsOverride: manualOverride,
          walletAddress: address,
          signature,
        }),
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
          <h1>updated!</h1>
          <p>Your project info is now live on the hub.</p>
          <Link href="/" className={styles.backBtn}>← back to the hub</Link>
        </div>
      </main>
    )
  }

  const selectedPreset = PRESET_TAGS.find(p => p.type === addingType)

  return (
    <main className={styles.wrap}>
      <Link href="/" className={styles.back}>← back</Link>

      <div className={styles.header}>
        <h1 className={styles.title}>edit project</h1>
        <p className={styles.subtitle}>{project.name}</p>
      </div>

      <div className={styles.form}>

        {/* Wallet */}
        <div className={styles.field}>
          <label className={styles.label}>your wallet</label>
          <ConnectButton chainStatus="none" showBalance={false} />
          {isConnected && project.walletAddress && address?.toLowerCase() !== project.walletAddress.toLowerCase() && (
            <p className={styles.walletMismatch}>⚠️ wrong wallet — connect the one you submitted with</p>
          )}
        </div>

        {/* Build status */}
        <div className={styles.field}>
          <label className={styles.label}>build status</label>
          <div className={styles.statusRow}>
            {BUILD_STATUSES.map(s => (
              <button key={s} type="button"
                className={`${styles.pill} ${!useCustomBuild && buildStatus === s ? styles.pillActive : ''}`}
                onClick={() => { setUseCustomBuild(false); setBuildStatus(s) }}>
                {s}
              </button>
            ))}
            <button type="button"
              className={`${styles.pill} ${useCustomBuild ? styles.pillActive : ''}`}
              onClick={() => setUseCustomBuild(true)}>
              custom
            </button>
          </div>
          {useCustomBuild && (
            <input type="text" placeholder="e.g. paused, wip…" value={customBuildStatus}
              onChange={e => setCustomBuildStatus(e.target.value)} maxLength={20} style={{ marginTop: '8px' }} />
          )}
        </div>

        {/* Feature tags */}
        <div className={styles.field}>
          <label className={styles.label}>feature tags</label>
          <p className={styles.fieldHint}>add as many as you need — multiple pricing points are fine</p>

          {/* existing tags */}
          {tags.length > 0 && (
            <div className={styles.tagList}>
              {tags.map((t, i) => (
                <div key={i} className={styles.tagRow}>
                  <span className={styles.tagIcon}>{t.icon}</span>
                  <input
                    type="text"
                    className={styles.tagValueInput}
                    value={t.value}
                    onChange={e => updateTagValue(i, e.target.value)}
                    placeholder="label"
                  />
                  <button className={styles.removeBtn} onClick={() => removeTag(i)}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* add new tag */}
          <div className={styles.addTagArea}>
            <select
              value={addingType}
              onChange={e => { setAddingType(e.target.value); setAddingValue('') }}
              className={styles.tagTypeSelect}
            >
              <option value="">+ add a tag…</option>
              {PRESET_TAGS.map(p => (
                <option key={p.type} value={p.type}>{p.icon} {p.label}</option>
              ))}
            </select>

            {selectedPreset?.hasValue && (
              <input
                type="text"
                placeholder={selectedPreset.valuePlaceholder}
                value={addingValue}
                onChange={e => setAddingValue(e.target.value)}
                className={styles.tagValueNew}
              />
            )}

            {addingType && (
              <button className={styles.addTagBtn} onClick={addTag}>add</button>
            )}
          </div>
        </div>

        {/* Manual override toggle */}
        <div className={styles.field}>
          <label className={styles.toggleRow}>
            <input type="checkbox" checked={manualOverride} onChange={e => setManualOverride(e.target.checked)} />
            <span className={styles.toggleLabel}>
              lock tags to manual only — don&apos;t auto-fetch from app&apos;s <code>/api/status</code>
            </span>
          </label>
          <p className={styles.fieldHint}>turn this on if auto-fetch is showing wrong info</p>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.saveBtn} onClick={handleSave} disabled={saving || !isConnected}>
          {saving ? 'signing…' : 'save changes'}
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
