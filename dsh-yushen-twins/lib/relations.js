// 关系账：谁常来、谁欠她一句、谁上次让她不痛快。
//
// 数据在桥的 people 文件里（本地只读）；这里只做摘要，不改人家。
import fs from 'node:fs'
import path from 'node:path'
import { qqBridgeState } from './paths.js'

const BRIDGE_STATE = () => process.env.QQ_BRIDGE_STATE || qqBridgeState()
const ROLE_FILE = { dayu: 'people-大肥鱼.json', xiaoyu: 'people-小肥鱼.json', dragon: 'people-小肥鱼.json' }

function fileFor(role) { return path.join(BRIDGE_STATE(), ROLE_FILE[role] || ROLE_FILE.dayu) }

/** 容错读：文件可能是 {people:{...}} / 数组 / 键值表。 */
export function loadPeople(role) {
  let doc = null
  try { doc = JSON.parse(fs.readFileSync(fileFor(role), 'utf8')) } catch { return [] }
  const arr = Array.isArray(doc) ? doc : (doc?.people && Array.isArray(doc.people) ? doc.people : Object.entries(doc || {}).map(([k, v]) => ({ id: k, ...(v && typeof v === 'object' ? v : {}) })))
  return arr.filter((x) => x && typeof x === 'object').map((p) => ({
    id: String(p.id || p.uid || p.qq || ''),
    name: String(p.name || p.nick || p.card || p.id || ''),
    tier: String(p.tier || p.level || ''),
    affinity: Number(p.affinity ?? p.score ?? p.favor ?? 0),
    lastSeen: p.lastSeen || p.lastAt || p.last || '',
    note: String(p.note || p.impression || '').slice(0, 60),
  }))
}

/** 摘要：常来的、最近的、她记着的。 */
export function relationsSummary(role, { top = 5 } = {}) {
  const people = loadPeople(role)
  if (!people.length) return { ok: false, reason: '还没有关系数据（桥那边没跑过）', people: [] }
  const byAffinity = [...people].sort((a, b) => b.affinity - a.affinity).slice(0, top)
  const recent = [...people].filter((p) => p.lastSeen).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 3)
  const noted = people.filter((p) => p.note).slice(-3)
  return { ok: true, total: people.length, byAffinity, recent, noted }
}

/** 注入：只报事实，不下判断。 */
export function relationsLine(role) {
  const s = relationsSummary(role)
  if (!s.ok) return ''
  const top = s.byAffinity.map((p) => `${p.name}${p.affinity ? `（${p.affinity}）` : ''}`).join('、')
  return `## 你认识的人\n${s.total} 个。最熟的：${top}。\n谁值得理、谁不值得，你自己看着办。`
}
