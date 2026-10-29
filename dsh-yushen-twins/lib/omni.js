// 鱼神 · 全知（一个整体，不是东一块西一块）
// 看见（账本/观察）、读透（插件入职/软件本体）、在场（脏状态/风险）、预测（换班/查重）——
// 都从这一处取；查重只是其中一次查询。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { systemReport } from './system.js'
import { scanDuplicates } from './dup.js'
import { searchWork } from './worklog.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function jsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function registry() {
  return readJson(path.join(HOME, 'xiaoyu', 'registry', 'index.json'), { plugins: [] })
}

/** 一眼全知：软件 + 插件 + 账本 + 活 + 风险 + 重复。 */
export async function snapshot() {
  const events = jsonl(path.join(DATA, 'events', `${dayKey()}.jsonl`))
  const jobs = readJson(path.join(DATA, 'dispatch.json'), [])
  const incidents = readJson(path.join(DATA, 'incidents.json'), [])
  const reg = registry()
  const sys = await systemReport()
  const dup = scanDuplicates()
  const openJobs = (Array.isArray(jobs) ? jobs : []).filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
  const openInc = (Array.isArray(incidents) ? incidents : []).filter((i) => i.status === 'open' || i.status === 'fixing')

  return {
    at: new Date().toISOString(),
    world: {
      software: sys.software,
      plugins: {
        installed: sys.software.plugins.count,
        analyzed: (reg.plugins || []).length,
        scannedAt: reg.scannedAt || '',
        flagged: (reg.plugins || [])
          .filter((p) => (p.behavior?.suspicious || []).length)
          .map((p) => ({ name: p.name, suspicious: p.behavior.suspicious })),
      },
    },
    ledger: { today: events.length, last: events.slice(-3) },
    work: { jobs: Array.isArray(jobs) ? jobs.length : 0, openJobs: openJobs.length, openIncidents: openInc.length },
    risk: sys.restart,
    duplicates: { routes: dup.dupRoutes, tools: dup.dupTools, notes: dup.notes },
  }
}

/** 查一件事：账本、派活、事故、插件里翻。 */
export function search(q, limit = 20) {
  const text = String(q || '').trim().toLowerCase()
  if (!text) return { ok: true, matches: [] }
  const matches = []
  const hit = (s) => String(s || '').toLowerCase().includes(text)

  for (const e of jsonl(path.join(DATA, 'events', `${dayKey()}.jsonl`)).slice(-500)) {
    if (hit(e.type) || hit(e.text) || hit(e.title)) matches.push({ kind: 'event', at: e.at, text: e.text || e.type, id: e.id })
  }
  for (const j of readJson(path.join(DATA, 'dispatch.json'), [])) {
    if (hit(j.id) || hit(j.brief) || hit(j.result)) matches.push({ kind: 'job', at: j.createdAt, text: j.brief, id: j.id, status: j.status })
    if (matches.length > 200) break
  }
  for (const i of readJson(path.join(DATA, 'incidents.json'), [])) {
    if (hit(i.title) || hit(i.text)) matches.push({ kind: 'incident', at: i.lastAt || i.at, text: i.title, id: i.id, status: i.status })
  }
  for (const p of registry().plugins || []) {
    if (hit(p.name) || hit(p.description)) matches.push({ kind: 'plugin', at: p.scannedAt, text: `${p.name} ${p.version}`, id: p.name })
  }
  // 工作记录：开发侧每动一步都记，问“你修了什么”能直接搜到。
  for (const w of searchWork(q, 20)) {
    matches.push({ kind: 'work', at: w.at, text: `${w.what}${w.evidence ? `（${w.evidence}）` : ''}`, id: (w.files || []).join(',') })
  }
  // 动作记录：点了什么、请求到没到。
  for (const a of jsonl(path.join(DATA, 'actions.jsonl')).slice(-200)) {
    if (hit(a.path) || hit(a.method) || hit(a.note)) matches.push({ kind: 'action', at: a.at, text: `${a.method} ${a.path} → ${a.status}`, id: '' })
  }
  return { ok: true, matches: matches.slice(0, limit) }
}
