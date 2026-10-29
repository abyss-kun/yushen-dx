// core · 派活单（宿主无关）
// 只做存储与取证：不碰 ctx、不投消息；投递由宿主适配器负责。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { recordFishState } from '../lib/state-adapter.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'dispatch.json')
const AUDIT = path.join(DATA, 'audit.jsonl')
const WORKSPACE = process.env.DSH_WORKSPACE || (fs.existsSync('<工作区>\\工作区') ? '<工作区>\\工作区' : process.cwd())
const MAX_RESULT = 4000
const MAX_READ = 120 * 1024
const MAX_SCAN_FILES = 400
const MAX_SCAN_BYTES = 2 * 1024 * 1024

export function ensureDir() { fs.mkdirSync(DATA, { recursive: true }) }

export function readAll() {
  try {
    let text = fs.readFileSync(FILE, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const raw = JSON.parse(text)
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

export function writeAll(list) {
  ensureDir()
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(list.slice(0, 500), null, 2), 'utf8')
  fs.renameSync(tmp, FILE)
}

export function audit(row) {
  try {
    ensureDir()
    fs.appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n', 'utf8')
  } catch { /* 审计写不了不影响干活 */ }
}

export function newId() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

export function clip(text, max = MAX_RESULT) {
  const s = String(text || '')
  return s.length > max ? `${s.slice(0, max)}\n…（截断，共 ${s.length} 字）` : s
}

export function safePath(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('path 不能为空')
  const full = path.resolve(raw)
  const bases = [path.resolve(WORKSPACE), path.resolve(HOME), path.resolve('D:\\deepseekTools')]
  if (!bases.some((base) => full === base || full.startsWith(base + path.sep))) {
    throw new Error(`只能看工作区、.dsh 和 D:\\deepseekTools 下的文件：${full}`)
  }
  return full
}

/** 收话：某条会话回了一句，挂到它最新一单上。 */
export function noteReply(sessionId, text) {
  if (!sessionId || !text) return null
  const list = readAll()
  let hit = null
  for (const task of list) {
    if (task.sessionId !== sessionId) continue
    if (!['dispatched', 'returned', 'redispatched'].includes(task.status)) continue
    task.result = clip(text)
    task.status = 'returned'
    task.returnedAt = new Date().toISOString()
    task.replyCount = Number(task.replyCount || 0) + 1
    hit = task
    break
  }
  if (!hit) return null
  writeAll(list)
  try {
    recordFishState(hit.role || 'dayu', { expression: '思考', lastReason: hit.id })
  } catch { /* 状态记录不阻断收话 */ }
  audit({ kind: 'reply', id: hit.id, sessionId, chars: String(text).length })
  return hit
}

/** 取证：file / check / grep。纯本地，宿主无关。 */
export async function verifyEvidence(args = {}) {
  const kind = String(args?.kind ?? '')
  if (kind === 'file') {
    const full = safePath(args?.path)
    const st = fs.statSync(full)
    if (!st.isFile()) throw new Error('不是一个文件')
    const buf = fs.readFileSync(full)
    const lines = Math.max(1, Math.min(400, Number(args?.maxLines) || 60))
    const text = buf.slice(0, MAX_READ).toString('utf8')
    const head = text.split(/\r?\n/).slice(0, lines).join('\n')
    const sha = crypto.createHash('sha256').update(buf).digest('hex')
    audit({ kind: 'verify', evidence: 'file', path: full })
    return { ok: true, path: full, size: st.size, sha256: sha, lines, head }
  }
  if (kind === 'check') {
    const full = safePath(args?.path)
    if (!fs.existsSync(full)) throw new Error('文件不存在')
    const result = await new Promise((resolve) => {
      execFile(process.execPath, ['--check', full], { timeout: 15000, windowsHide: true }, (error, stdout, stderr) => {
        resolve({ ok: !error, code: error?.code ?? 0, out: String(stdout || '').slice(0, 2000), err: String(stderr || '').slice(0, 2000) })
      })
    })
    audit({ kind: 'verify', evidence: 'check', path: full, ok: result.ok })
    return { ok: true, path: full, syntax: result }
  }
  if (kind === 'grep') {
    const pattern = String(args?.pattern ?? '').trim()
    if (!pattern) throw new Error('pattern 不能为空')
    let re
    try { re = new RegExp(pattern, 'i') } catch { throw new Error('正则不合法') }
    const hits = []
    let scanned = 0
    const walk = (dir, depth) => {
      if (hits.length >= 40 || scanned >= MAX_SCAN_FILES || depth > 4) return
      let entries = []
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (hits.length >= 40 || scanned >= MAX_SCAN_FILES) break
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.tmp') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) { walk(full, depth + 1); continue }
        if (!/\.(js|mjs|cjs|json|md|txt|yml|yaml|css|html)$/i.test(entry.name)) continue
        scanned += 1
        try {
          const st = fs.statSync(full)
          if (st.size > MAX_SCAN_BYTES) continue
          const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/)
          for (let i = 0; i < lines.length; i += 1) {
            if (re.test(lines[i])) {
              hits.push({ file: full, line: i + 1, text: lines[i].slice(0, 200) })
              if (hits.length >= 40) break
            }
          }
        } catch { /* 单文件失败跳过 */ }
      }
    }
    walk(WORKSPACE, 0)
    audit({ kind: 'verify', evidence: 'grep', pattern, hits: hits.length })
    return { ok: true, pattern, hits }
  }
  throw new Error('kind 只能是 file / grep / check')
}
