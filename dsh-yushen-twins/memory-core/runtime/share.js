/* 标签
 * id: memory-core-share
 * kind: module
 * summary: 经验共享：默认 role_private；显式 share 后带 authorRole/sharedWith；别人只能读和回写使用结果，不改作者。
 * tags: 经验, 共享, 作者, 可见性
 * created: 2026-11-15 22:20:00
 * changed: 2026-11-15 22:20:27
 * author: 大鱼·本班
 * authority: 老板（2026-11-15：经验可以分享，但必须分清是谁的）
 * audience: cards、query、注入、以后页面
 * owner: 框架；只改可见性，不删作者、不覆盖正文
 * mutable: 可改；共享必须显式调用
 * usage: shareCard(id,{by,to,public}) / canRead(card,role) / listReadable(role) / recordUse(...)
 * why: 经验可互相扶持，但不能把别人的经验改成自己的，也不能自动串角色
 * result: 默认私有；显式共享；使用者只追加使用结果，作者不变
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

function walk(dir, out = []) {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (p.endsWith('.jsonl')) out.push(p)
  }
  return out
}
const cardDirs = () => walk(path.join(dataRoot(HOME), 'library', '在用'))

/** 找卡：按 id，最后一条胜出（同日重复写时）。 */
export function findCard(id) {
  const want = String(id || '')
  if (!want) return null
  let hit = null
  for (const f of cardDirs()) {
    let idx = -1
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      idx += 1
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line.replace(/^\uFEFF/, ''))
        if (String(row?.id) === want) hit = { file: f, index: idx, row }
      } catch { /* 坏行跳过 */ }
    }
  }
  return hit
}

export function canRead(card, role) {
  const r = String(card?.authorRole || card?.role || '')
  const who = String(role || '')
  if (!who) return false
  if (!r) return true // 旧卡没有作者：不擅自私有化，保持可读
  if (r === who || r === 'unknown') return true
  if (card?.visibility === 'public') return true
  if (card?.visibility === 'shared' && Array.isArray(card?.sharedWith) && card.sharedWith.includes(who)) return true
  return false
}

/** 显式共享：保留作者，只改可见性；to 空且 public=false 视为收回私有。 */
export function shareCard(id, { by = '', to = [], public: isPublic = false, now = Date.now() } = {}) {
  const hit = findCard(id)
  if (!hit) return { ok: false, why: '没有这张卡', id }
  const rows = fs.readFileSync(hit.file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } })
  let changed = false
  for (const row of rows) {
    if (String(row?.id) !== String(id)) continue
    row.authorRole = String(row.authorRole || row.role || 'unknown')
    if (isPublic) {
      row.visibility = 'public'
      row.sharedWith = []
    } else if (Array.isArray(to) && to.length) {
      row.visibility = 'shared'
      row.sharedWith = [...new Set(to.map((x) => String(x).trim()).filter(Boolean))]
    } else {
      row.visibility = 'role_private'
      row.sharedWith = []
    }
    row.sharedBy = String(by || '她')
    row.sharedAt = new Date(now).toISOString()
    changed = true
  }
  if (!changed) return { ok: false, why: '没找到可改的行', id }
  const tmp = `${hit.file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  fs.renameSync(tmp, hit.file)
  return { ok: true, id, visibility: isPublic ? 'public' : (to.length ? 'shared' : 'role_private') }
}

export function listReadable(role, { kind = '' } = {}) {
  const out = []
  for (const f of cardDirs()) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line.replace(/^\uFEFF/, ''))
        if (kind && row.kind !== kind) continue
        if (canRead(row, role)) out.push(row)
      } catch { /* 坏行跳过 */ }
    }
  }
  return out
}

/** 使用反馈只追加，不改作者/正文；谁用、好不好，单独记。 */
export function recordUse(id, { by = '', result = '', note = '', now = Date.now() } = {}) {
  const card = findCard(id)
  if (!card) return { ok: false, why: '没有这张卡', id }
  const file = path.join(dataRoot(HOME), 'library', 'meta', 'card-usage.jsonl')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const row = { id: String(id), authorRole: String(card.row.authorRole || card.row.role || ''), usedBy: String(by || ''), result: String(result || ''), note: String(note || '').slice(0, 200), at: new Date(now).toISOString() }
  fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8')
  return { ok: true, usage: row }
}
