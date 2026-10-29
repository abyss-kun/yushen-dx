// 即时记录：我们说的话、想到的点子，落盘不等人。
// 只写本地 append-only 日志；不联网、不调模型。崩溃最多丢正在写的那一行。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { redact } from './redact.js'
import { classify as privacyTier } from './privacy.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const JOURNAL = path.join(DATA, 'journal')
const IDEAS = path.join(DATA, 'ideas')
const MAX_TEXT = 4000
const SECRET_RE = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk|ghp|gho|github_pat|xox[baprs])[-_][a-z0-9_-]{12,}|\bBearer\s+[a-z0-9._~+\/-]{12,}|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|秘密|密码|令牌)\s*[:=：]\s*\S{6,}/i

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function ensure(dir) { fs.mkdirSync(dir, { recursive: true }) }
function appendLine(file, row) {
  ensure(path.dirname(file))
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`)
}

/** 分类只做最粗的三类：想法、对话、决定。 */
export function classify(text) {
  const s = String(text || '')
  if (/^(点子|想法|主意|idea)[:：]/i.test(s) || /我想到|不如|干脆|可以做|好主意|思路/.test(s)) return 'idea'
  if (/^(决定|定了|就这么|结论)[:：]/i.test(s) || /以后就|从今天起|规则定为/.test(s)) return 'decision'
  return 'talk'
}

/**
 * 记一条。返回 {ok, kind, file, duplicate}
 * kind 不给就自动分类；命中凭据的直接拒绝（不把密钥写进日志）。
 */
export function capture(text, { kind = '', sessionId = '', role = '', source = 'owner', at = new Date().toISOString(), tags = [] } = {}) {
  const raw = String(text || '').trim().slice(0, MAX_TEXT)
  if (!raw) return { ok: false, reason: '空内容' }
  const clean = redact(raw)
  const value = clean.text
  const finalKind = ['idea', 'talk', 'decision'].includes(kind) ? kind : classify(value)
  const row = { at, kind: finalKind, text: value, sessionId: String(sessionId || ''), role: String(role || ''), source: String(source || ''), tags: Array.isArray(tags) ? tags.slice(0, 8).map(String) : [], privacy: privacyTier(value).tier }
  if (clean.redacted) row.redacted = clean.hits
  const file = path.join(JOURNAL, `${dayKey(new Date(at))}.jsonl`)
  // 同一分钟同一句不重复记
  try {
    const tail = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-300)
    const key = crypto.createHash('sha256').update(`${row.kind}|${row.text}|${row.at.slice(0, 16)}`).digest('hex')
    for (const line of tail) {
      try {
        const old = JSON.parse(line)
        const oldKey = crypto.createHash('sha256').update(`${old.kind}|${old.text}|${String(old.at).slice(0, 16)}`).digest('hex')
        if (oldKey === key) return { ok: true, kind: finalKind, file, duplicate: true }
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 今天还没有文件 */ }
  appendLine(file, row)
  appendLine(path.join(IDEAS, `${dayKey(new Date(at))}.jsonl`), row)
  // 想法和决定另留一份人能直接读的
  if (finalKind !== 'talk') {
    ensure(IDEAS)
    const md = path.join(IDEAS, `${dayKey(new Date(at))}.md`)
    const tag = row.tags.length ? ` #${row.tags.join(' #')}` : ''
    fs.appendFileSync(md, `- **${String(at).slice(11, 19)}** [${finalKind}] ${value.replace(/\s+/g, ' ')}${tag}\n`)
  }
  return { ok: true, kind: finalKind, file, duplicate: false }
}

export function listCapture({ date = '', limit = 50 } = {}) {
  const file = path.join(JOURNAL, `${date || dayKey()}.jsonl`)
  try {
    return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-Math.max(1, Math.min(500, Number(limit) || 50))).map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

export function searchCapture(q, { limit = 30 } = {}) {
  const needle = String(q || '').toLowerCase().trim()
  if (!needle) return []
  const out = []
  let days = []
  try { days = fs.readdirSync(JOURNAL).filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().reverse().slice(0, 30) } catch { return [] }
  for (const name of days) {
    for (const line of fs.readFileSync(path.join(JOURNAL, name), 'utf8').split(/\r?\n/)) {
      if (!line.toLowerCase().includes(needle)) continue
      try { out.push(JSON.parse(line)) } catch { /* 跳过 */ }
      if (out.length >= limit) return out
    }
  }
  return out
}
