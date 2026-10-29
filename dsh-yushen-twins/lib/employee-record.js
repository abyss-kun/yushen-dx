// 员工档案：她到底是谁的员工、干过什么、栽过哪、领过哪本书。
//
// 为什么要有：每次派活都在内存里算一遍画像，算完就丢——下次还是"不认识她"，
// 于是手册只能发通用的，通用里就必然混进跟她无关的东西（2026-10-26 铁律那件事）。
//
// 现在落盘：一个会话一份，只追加/合并，不改历史。
//   ~/.dsh/dayu/employees/<sessionId>.json
//
// 证据来源（只读本地账本，不调模型）：派活单、事故单、手册发放记录、卡住排查记录。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { evidenceFor, tagsOf } from './employee-profile.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dayu', 'employees')

function safeId(sessionId) {
  return String(sessionId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
}
function fileOf(sessionId) {
  const id = safeId(sessionId)
  return id ? path.join(DIR, `${id}.json`) : ''
}

export function load(sessionId) {
  const file = fileOf(sessionId)
  if (!file) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    if (raw && typeof raw === 'object') return { ...raw, tags: raw.tags || {}, jobs: raw.jobs || [], incidents: raw.incidents || [], handbooks: raw.handbooks || [], stuck: raw.stuck || [] }
  } catch { /* 没有就是没有 */ }
  return { version: 1, sessionId: String(sessionId), firstSeen: '', lastSeen: '', tags: {}, jobs: [], incidents: [], handbooks: [], stuck: [] }
}

function save(sessionId, record) {
  const file = fileOf(sessionId)
  if (!file) return null
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
  return file
}

/** 回话里有没有可复查的东西（路径、哈希、命令输出、通过数）。没有就等于"只说了做完了"。 */
export function hasEvidence(text) {
  const s = String(text || '')
  if (!s.trim()) return false
  return /[A-Za-z]:\\|sha256|sha1|`[^`]{3,}`|\d+\s*(passed|通过)|\bhttps?:\/\//i.test(s)
}

function briefOf(job) {
  return String(job?.brief || '').replace(/\s+/g, ' ').slice(0, 80)
}

/**
 * 把账本里的证据合并进档案（幂等：按 id 去重）。
 * 派活后、出事时、或她想起来看一眼时都可以调。
 */
export function sync(sessionId, { now = new Date().toISOString() } = {}) {
  const sid = String(sessionId || '')
  if (!sid) return null
  const rec = load(sid)
  const ev = evidenceFor(sid, { jobs: 30, incidents: 30 })
  const before = { jobs: rec.jobs.length, incidents: rec.incidents.length }

  // 事故单要原文，所以另读一次全量（evidenceFor 只给拼好的字符串）
  const incidentsRaw = (() => {
    try {
      const all = JSON.parse(fs.readFileSync(path.join(HOME, 'dayu', 'incidents.json'), 'utf8').replace(/^\uFEFF/, ''))
      return (Array.isArray(all) ? all : []).filter((i) => String(i.sessionId || '') === sid)
    } catch { return [] }
  })()

  const jobsRaw = (() => {
    try {
      const all = JSON.parse(fs.readFileSync(path.join(HOME, 'dayu', 'dispatch.json'), 'utf8').replace(/^\uFEFF/, ''))
      return (Array.isArray(all) ? all : []).filter((j) => String(j.sessionId || '') === sid)
    } catch { return [] }
  })()

  const jobIds = new Set(rec.jobs.map((j) => j.id))
  for (const j of jobsRaw) {
    if (jobIds.has(j.id)) continue
    rec.jobs.push({
      id: j.id,
      brief: briefOf(j),
      status: String(j.status || ''),
      at: String(j.createdAt || ''),
      resultChars: String(j.result || '').length,
      hasEvidence: hasEvidence(j.result),
    })
  }
  const incIds = new Set(rec.incidents.map((i) => i.id))
  for (const i of incidentsRaw) {
    if (incIds.has(i.id)) continue
    rec.incidents.push({ id: i.id, title: String(i.title || ''), at: String(i.at || ''), count: Number(i.count) || 1 })
  }

  // 岗位标签：**重算**不累加（以前每次 sync 都涨次数，越调越"确认"，是假的）。
  // 命中三次以上才算"确认"，一次只算"可能"。
  const text = [rec.jobs.map((j) => j.brief).join('\n'), rec.incidents.map((i) => i.title).join('\n')].join('\n')
  const fresh = {}
  for (const t of tagsOf(text)) {
    const cur = fresh[t.tag] || { hits: 0, lastAt: '', evidence: [] }
    cur.hits += Number(t.count) || 1
    cur.lastAt = now
    cur.evidence = [...new Set([...(cur.evidence || []), t.hit])].slice(-3)
    cur.confidence = cur.hits >= 3 ? '确认' : '可能'
    fresh[t.tag] = cur
  }
  rec.tags = fresh

  rec.lastSeen = now
  if (!rec.firstSeen) rec.firstSeen = jobsRaw.length || incidentsRaw.length ? now : ''
  rec.jobs = rec.jobs.slice(-50)
  rec.incidents = rec.incidents.slice(-50)
  save(sid, rec)
  return { ...rec, added: { jobs: rec.jobs.length - before.jobs, incidents: rec.incidents.length - before.incidents } }
}

/** 记一次手册发放：发了哪几章、哪几个工具、多大、什么时候到期。 */
export function recordHandbook(sessionId, meta = {}) {
  const rec = load(sessionId)
  if (!rec) return null
  rec.handbooks.push({
    at: new Date().toISOString(),
    chapters: Array.isArray(meta.chapters) ? meta.chapters : [],
    tools: Array.isArray(meta.tools) ? meta.tools : [],
    chars: Number(meta.chars) || 0,
    expiresAt: String(meta.expiresAt || ''),
    jobId: String(meta.jobId || ''),
  })
  rec.handbooks = rec.handbooks.slice(-30)
  save(sessionId, rec)
  return rec.handbooks[rec.handbooks.length - 1]
}

/** 记一次卡住排查：症状 → 结论 → 动作。以后同类能直接对上来。 */
export function recordStuck(sessionId, entry = {}) {
  const rec = load(sessionId)
  if (!rec) return null
  rec.stuck.push({
    at: new Date().toISOString(),
    symptom: String(entry.symptom || '').slice(0, 200),
    verdict: String(entry.verdict || ''),
    action: String(entry.action || '').slice(0, 300),
    jobId: String(entry.jobId || ''),
  })
  rec.stuck = rec.stuck.slice(-30)
  save(sessionId, rec)
  return rec.stuck[rec.stuck.length - 1]
}

/** 一句话看懂这个员工。 */
export function summary(sessionId) {
  const rec = load(sessionId)
  if (!rec) return { ok: false, reason: '没有 sessionId' }
  const tags = Object.entries(rec.tags)
    .sort((a, b) => b[1].hits - a[1].hits)
    .map(([tag, v]) => `${tag}（${v.confidence}，${v.hits} 次）`)
  const totalJobs = rec.jobs.length
  const noEvidence = rec.jobs.filter((j) => !j.hasEvidence).length
  const repeatInc = rec.incidents.filter((i) => Number(i.count) >= 2)
  return {
    ok: true,
    sessionId: rec.sessionId,
    firstSeen: rec.firstSeen,
    lastSeen: rec.lastSeen,
    who: tags.join('、') || '还没看出是干什么的',
    jobs: { total: totalJobs, noEvidence },
    incidents: { total: rec.incidents.length, repeat: repeatInc.length },
    handbooks: rec.handbooks.length,
    stuck: rec.stuck.length,
    file: fileOf(sessionId),
  }
}
