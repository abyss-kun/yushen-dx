/* 标签
 * id: lib-mechanism-registry
 * kind: module
 * summary: 机制登记：把 docs/记忆架构-节点图.json 读成统一记录，按 id/名字/文件查；纯读、零模型。
 * tags: 机制, 登记, 节点图, 只读, 零模型
 * created: 2026-11-16 20:50:00
 * changed: 2026-11-16 22:09:59
 * author: 大鱼·子代理（机制登记最小模块）
 * authority: 老板（2026-11-16：机制登记最小模块，只读、别建新记忆表）
 * audience: 她（以后按机制查"这事归哪段代码"）、维护者、脚本
 * owner: 框架；真源仍是 docs/记忆架构-节点图.json（这里只读不写）
 * defaults: 默认读仓库根下 docs/记忆架构-节点图.json
 * off: 不查就查不到机制；不影响任何已有流程
 * mutable: 可改读法；**只读**，不改真源、不写任何文件、不建新表
 * usage: loadMechanisms({file}) → 记录数组；findMechanism('N08'|'检索')；mechanismsForFile('lib/soul.js')
 * why: 机制散在文档与代码里，问"这条机制归哪段代码/有没有测试"要人肉翻节点图
 * result: 一份统一形状的机制记录（以后可作「知识/机制」节点的原料）
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 机制登记（最小模块）：
//
// 只做三件事，全部**纯读**：
//   1. loadMechanisms({file})  把节点图读成统一记录；
//   2. findMechanism(idOrName) 按 id 或名字找一条；
//   3. mechanismsForFile(p)    按 files 里的文件（文件名/相对路径/绝对路径后缀）找机制。
//
// 不联网、不叫模型、不写任何文件、不建新记忆表。
// 坏 JSON、顶层结构不对、单条缺 id/name —— 一律跳过（能读多少读多少），不抛错。
//
// 记录形状（以后作「知识/机制」节点用）：
//   { mechanismId, name, principle, input, output, files, tests, status, source: 'node-map', notes }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 真源：记忆架构节点图（唯一默认来源）。 */
export const DEFAULT_MECHANISM_FILE = path.join(ROOT, 'docs', '记忆架构-节点图.json')

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** 文件路径统一成 posix 风格、去 ./ 前缀；匹配时再统一小写。 */
function normalizePath(p) {
  return String(p || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\.\//, '')
}

/** files/tests：只收非空字符串，去重，保持原顺序。 */
function strList(v) {
  if (!Array.isArray(v)) return []
  const out = []
  const seen = new Set()
  for (const item of v) {
    const s = str(item)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

/** 一条节点 → 一条统一记录；缺 id 或 name 返回 null（调用方跳过）。 */
function toRecord(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null
  const mechanismId = str(node.id)
  const name = str(node.name)
  if (!mechanismId || !name) return null
  return {
    mechanismId,
    name,
    principle: str(node.principle),
    input: str(node.input),
    output: str(node.output),
    files: strList(node.files),
    tests: strList(node.tests),
    status: str(node.status),
    source: 'node-map',
    notes: str(node.notes),
  }
}

/**
 * 从节点图 JSON 读成统一记录。
 *
 * 认两种顶层形状：`{ version, updatedAt, nodes: [...] }`（真源）和裸数组（测试夹具）。
 * 读不到/不是 JSON/顶层不对 → 返回 []；单条坏 → 跳过；mechanismId 重复 → 留第一条。
 *
 * @param {{file?: string}|string} [opts] 默认读 DEFAULT_MECHANISM_FILE
 * @returns {Array<object>}
 */
export function loadMechanisms(opts = {}) {
  const file = typeof opts === 'string' ? opts : (opts && opts.file) || DEFAULT_MECHANISM_FILE
  let data = null
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
  const nodes = Array.isArray(data) ? data : (data && Array.isArray(data.nodes) ? data.nodes : [])
  const out = []
  const seen = new Set()
  for (const node of nodes) {
    const rec = toRecord(node)
    if (!rec || seen.has(rec.mechanismId)) continue
    seen.add(rec.mechanismId)
    out.push(rec)
  }
  return out
}

/**
 * 按 id 或名字找一条机制（先 id 精确、再名字精确；都不分大小写，两边去空白）。
 * 找不到 → null。
 *
 * @param {string} idOrName 例如 'N08' / '检索' / 'N08 检索'
 * @param {{file?: string}} [opts]
 */
export function findMechanism(idOrName, opts = {}) {
  const q = str(idOrName).toLowerCase()
  if (!q) return null
  const records = loadMechanisms(opts)
  const byId = records.find((r) => r.mechanismId.toLowerCase() === q)
  if (byId) return byId
  return records.find((r) => r.name.toLowerCase() === q) || null
}

/**
 * 按文件找机制：节点 files 里记的可能是
 *   · 纯文件名（"test-source.mjs"）、
 *   · 仓库相对路径（"lib/soul.js"）、
 *   · 或调用方给绝对路径（"<repo>/lib/soul.js"）。
 * 判据：大小写不敏感的「相等 / 一方是另一方以 / 结尾的后缀 / 文件名相同」，四条任一命中即算。
 * 同一条机制只出现一次，顺序按节点图原顺序。
 *
 * @param {string} filePath 文件名、相对路径或绝对路径
 * @param {{file?: string}} [opts]
 * @returns {Array<object>}
 */
export function mechanismsForFile(filePath, opts = {}) {
  const target = normalizePath(filePath).toLowerCase()
  if (!target) return []
  const targetBase = target.split('/').pop()
  const records = loadMechanisms(opts)
  return records.filter((r) =>
    r.files.some((f) => {
      const nf = normalizePath(f).toLowerCase()
      if (!nf) return false
      if (nf === target) return true
      if (target.endsWith(`/${nf}`)) return true
      if (nf.endsWith(`/${target}`)) return true
      return nf.split('/').pop() === targetBase
    })
  )
}

/** 按大白话查机制：名字/原理/输入输出/文件/备注里命中即可；给 recall 用。 */
export function searchMechanisms(query, { limit = 3, file } = {}) {
  const q = str(query).toLowerCase()
  if (!q) return []
  const terms = (q.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9_.-]{2,}/g) || []).filter((x) => x.length >= 2)
  if (!terms.length) return []
  const records = loadMechanisms({ file })
  const scored = []
  for (const r of records) {
    const text = [r.mechanismId, r.name, r.principle, r.input, r.output, ...(r.files || []), ...(r.tests || []), r.notes].join(' ').toLowerCase()
    let score = 0
    for (const t of terms) if (text.includes(t)) score += t.length >= 4 ? 2 : 1
    if (score) scored.push({ ...r, score })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Number(limit) || 3))
}

/** 只认“明确提到”的机制：id、全名、文件名；不从泛词硬连。 */
export function mechanismsForText(text, { limit = 3, file } = {}) {
  const s = String(text || '')
  if (!s.trim()) return []
  const records = loadMechanisms({ file })
  const hits = []
  for (const r of records) {
    let score = 0
    if (r.mechanismId && s.includes(r.mechanismId)) score += 5
    if (r.name && r.name.length >= 2 && s.includes(r.name)) score += 3
    for (const f of r.files || []) {
      const base = String(f).split(/[\\/]/).pop()
      if (base && base !== 'index.js' && base.length >= 4 && s.includes(base)) score += 2
    }
    if (score) hits.push({ ...r, score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Number(limit) || 3))
}
