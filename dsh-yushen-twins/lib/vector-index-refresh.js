/* 标签
 * id: lib-vector-index-refresh
 * kind: module
 * summary: 持久词频索引自动更新：看图书馆最新改动时间，索引旧了就重建；不调模型。
 * tags: 检索, 索引, 自动更新, 本地
 * created: 2026-11-19 22:35:00
 * changed: 2026-11-19 23:43:33
 * author: 大鱼·本班
 * authority: 老板（2026-11-19：索引自动更新要闭环）
 * audience: 插件启动、维护任务
 * owner: 框架；只重建索引，不改原文
 * mutable: 可改；扫描规则要和 build-vector-index 一致
 * usage: isStale(role) / refreshAll() / ensureFresh(role)
 * why: 新卡片进了图书馆但索引还是旧的，查询会漏；手动重建容易忘
 * result: 索引 mtime >= 图书馆最新 mtime；否则重建并返回统计
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'
import { buildIndex, saveIndex, indexPath } from './vector-index.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// 2026-11-19：索引只认真角色 + workbench；unbound/unknown 这类脏桶不能各建一份。
const VALID_INDEX_ROLES = new Set(['dayu', 'xiaoyu', 'dragon', 'workbench'])
function normalizeIndexRole(raw) {
  const r = String(raw || '').trim()
  return VALID_INDEX_ROLES.has(r) ? r : 'workbench'
}

function walk(dir, out = []) {
  let list = []
  try { list = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const ent of list) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(json|jsonl)$/i.test(ent.name)) out.push(p)
  }
  return out
}

function rowsOf(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    if (/\.jsonl$/i.test(file)) return text.split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
    const raw = JSON.parse(text)
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.cards)) return raw.cards
    if (Array.isArray(raw?.items)) return raw.items
    return [raw]
  } catch { return [] }
}

function textOf(row) {
  return [row?.head, row?.detail, row?.body, row?.text, row?.summary, row?.snippet, ...(row?.tags || []), ...(row?.keywords || [])]
    .filter((x) => typeof x === 'string' && x.trim()).join('\n').slice(0, 2000)
}

function libraryFiles() {
  const D = dataRoot(HOME)
  return [
    ...walk(path.join(D, 'library', '在用')),
    ...walk(path.join(D, 'library', '中层')),
    ...walk(path.join(D, 'library', '手抄本')),
  ]
}

export function isStale(role) {
  try {
    const idx = indexPath(role)
    const i = fs.statSync(idx).mtimeMs
    const files = libraryFiles()
    const newest = files.reduce((m, f) => Math.max(m, fs.statSync(f).mtimeMs), 0)
    return newest > i + 1000
  } catch { return true }
}

export function refreshAll() {
  const D = dataRoot(HOME)
  const docs = []
  for (const dir of [path.join(D, 'library', '在用'), path.join(D, 'library', '中层'), path.join(D, 'library', '手抄本')]) {
    for (const file of walk(dir)) {
      rowsOf(file).forEach((row, i) => {
        const text = textOf(row)
        if (!text) return
        const role = normalizeIndexRole(row?.role || row?.authorRole)
        const id = String(row?.turnId || row?.id || row?.ref || `${file}#${i}`)
        docs.push({ id, text, role, meta: { role, layer: String(row?.layer || (dir.includes('在用') ? '卡片' : '中层')), ref: String(row?.rawRef || row?.ref || file), turnId: String(row?.turnId || ''), key: String(row?.key || id), at: String(row?.at || row?.startedAt || '') } })
      })
    }
  }
  const byRole = new Map()
  for (const d of docs) {
    if (!byRole.has(d.role)) byRole.set(d.role, [])
    byRole.get(d.role).push(d)
    if (d.role !== 'workbench') {
      if (!byRole.has('workbench')) byRole.set('workbench', [])
      byRole.get('workbench').push(d)
    }
  }
  const out = []
  for (const [role, list] of byRole) {
    const saved = saveIndex(role, buildIndex(list, { role }))
    out.push({ role, docs: list.length, items: saved.items, file: saved.file })
  }
  // 清掉非角色索引（旧桶）；索引可重建，不动原文。
  try {
    const RT = path.join(dataRoot(HOME), 'runtime')
    for (const ent of fs.readdirSync(RT, { withFileTypes: true })) {
      if (!ent.isDirectory() || byRole.has(ent.name)) continue
      const f = path.join(RT, ent.name, 'vector-index.json')
      if (fs.existsSync(f)) fs.rmSync(f, { force: true })
    }
  } catch { /* 清不了不影响重建 */ }
  return out
}

export function ensureFresh(role) {
  if (!isStale(role)) return { ok: true, skipped: true, role }
  const all = refreshAll()
  return { ok: true, role, rebuilt: all }
}
