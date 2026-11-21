/* 标签
 * id: lib-vector-index
 * kind: module
 * summary: 卡片/事件段的持久词频向量索引：文档入库、落盘、按余弦检索；不下载模型、不联网。
 * tags: 检索, 索引, 词频, 持久, 本地
 * created: 2026-11-19 22:15:00
 * changed: 2026-11-19 22:16:19
 * author: 大鱼·本班
 * authority: 老板（2026-11-19：2/3/4 先做，小模型只放地址）
 * audience: 记忆查询、后台维护
 * owner: 框架；索引可重建，不删原文
 * mutable: 可改；换分词/模型要升版本，旧索引自动作废
 * usage: buildIndex(docs) / saveIndex(role,index) / loadIndex(role) / search(index,q,{limit})
 * why: 每次查询现算所有候选太浪费；卡片/事件段的词频向量可以落盘复用
 * result: 索引 JSON（id/text/vec/meta），检索返回带分数和 meta
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'
import { vectorOf, cosine } from './lexical-vector.js'

export const VERSION = 1
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export function indexPath(role = 'workbench') {
  return path.join(dataRoot(HOME), 'runtime', String(role || 'workbench').replace(/[\\/:*?"<>|\s]/g, '_'), 'vector-index.json')
}

export function buildIndex(docs, { role = 'workbench', at = Date.now() } = {}) {
  const items = []
  for (const d of Array.isArray(docs) ? docs : []) {
    const id = String(d?.id || '').trim()
    const text = String(d?.text || '').trim()
    if (!id || !text) continue
    const vec = vectorOf(text)
    if (!vec.size) continue
    items.push({ id, text: text.slice(0, 2000), vec: [...vec], meta: d.meta && typeof d.meta === 'object' ? d.meta : {} })
  }
  return { version: VERSION, builtAt: new Date(Number(at) || Date.now()).toISOString(), role, items }
}

export function saveIndex(role, index) {
  const file = indexPath(role)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(index) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return { ok: true, file, items: index.items.length }
}

export function loadIndex(role = 'workbench') {
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath(role), 'utf8').replace(/^\uFEFF/, ''))
    if (raw?.version !== VERSION || !Array.isArray(raw.items)) return null
    return raw
  } catch { return null }
}

export function search(index, query, { limit = 10, minScore = 0.01 } = {}) {
  const q = String(query || '').trim()
  if (!index || !Array.isArray(index.items) || !q) return []
  const qv = vectorOf(q)
  if (!qv.size) return []
  const out = []
  for (const it of index.items) {
    const score = cosine(qv, new Map(it.vec || []))
    if (score >= minScore) out.push({ id: it.id, score, text: it.text, meta: it.meta || {} })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, Math.max(1, Math.min(100, Number(limit) || 10)))
}
