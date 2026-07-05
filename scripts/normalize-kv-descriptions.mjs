/**
 * One-time script to normalize KV project descriptions (~95 chars).
 * Requires ADMIN_KEY and a deployed site with /api/admin/update-project.
 *
 * Usage (PowerShell):
 *   $env:ADMIN_KEY="your-key"
 *   $env:BASE_URL="https://clawdbotatg-community-builds.vercel.app"
 *   node scripts/normalize-kv-descriptions.mjs
 */

const BASE_URL = process.env.BASE_URL || 'https://clawdbotatg-community-builds.vercel.app'
const ADMIN_KEY = process.env.ADMIN_KEY

const APPROVED_DESC = {
  'The Build Report':
    'Grades clawdbotatg repos on builder quality, token mechanics, and integrity—with plain-English scorecards.',
  CoverageKit:
    'Find GitHub coverage gaps and generate video assets in seconds—built for teams who ship in public.',
}

const COMING_SOON_PATCH = {
  'Clawd Drops': {
    desc: 'Set a goal, pick your CLAWD look, and get a short stylized build-to-drop video with multi-clip splicing.',
    teaser: 'Drops soon—still polishing. Burned through credits getting it right.',
  },
  'TOCABI (take our clawd and built it)': {
    desc: 'On-chain bounty board for CLAWD on Base—post bounties, fund rewards, and let builders claim them.',
    teaser: "The community's most wanted list. Post a bounty. Fund the reward.",
  },
}

async function main() {
  if (!ADMIN_KEY) {
    console.error('Set ADMIN_KEY env var (from Vercel project settings).')
    process.exit(1)
  }

  const approvedRes = await fetch(`${BASE_URL}/api/admin/approved?key=${encodeURIComponent(ADMIN_KEY)}`)
  if (!approvedRes.ok) {
    throw new Error(`approved fetch failed: ${approvedRes.status}`)
  }
  const approved = await approvedRes.json()

  for (const project of approved) {
    const nextDesc = APPROVED_DESC[project.name]
    if (!nextDesc) continue

    const res = await fetch(`${BASE_URL}/api/admin/update-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: ADMIN_KEY, id: project.id, desc: nextDesc }),
    })
    const body = await res.json()
    if (!res.ok) throw new Error(`update ${project.name}: ${body.error || res.status}`)
    console.log(`updated approved: ${project.name} (${nextDesc.length} chars)`)
  }

  const csRes = await fetch(`${BASE_URL}/api/admin/coming-soon?key=${encodeURIComponent(ADMIN_KEY)}`)
  if (!csRes.ok) {
    throw new Error(`coming-soon fetch failed: ${csRes.status}`)
  }
  const comingSoon = await csRes.json()

  const updated = comingSoon.map(item => {
    const patch = COMING_SOON_PATCH[item.name]
    if (!patch) return item
    return { ...item, desc: patch.desc, teaser: patch.teaser }
  })

  const csPost = await fetch(`${BASE_URL}/api/admin/coming-soon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: ADMIN_KEY, items: updated }),
  })
  if (!csPost.ok) {
    const body = await csPost.json().catch(() => ({}))
    throw new Error(`coming-soon update failed: ${body.error || csPost.status}`)
  }

  for (const item of updated) {
    const patch = COMING_SOON_PATCH[item.name]
    if (patch) console.log(`updated coming soon: ${item.name} (${patch.desc.length} chars)`)
  }

  console.log('done')
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
