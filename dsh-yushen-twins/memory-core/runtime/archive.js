/* 标签
 * id: lib-raw-layout
 * kind: module
 * summary: 本源归档的目录规则：年/月/会话/轮，session.json 随会话，索引单独放。
 * tags: 归档, 目录, 本源, zstd, 分卷
 * created: 2026-11-12 21:35:00
 * changed: 2026-11-12 21:35:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：可以归档，但文件夹分类别找不到）
 * audience: 维护者、恢复脚本、未来接层的人
 * owner: 框架；路径规则定了就别随手改
 * mutable: 可改；改路径要同时改索引和恢复器
 * usage: archiveDir(sessionId, startedAt) / archiveFile(...) / monthKey(...)
 * why: raw 会越来越大；按会话/轮归档，能按 turnId 直接找到，不用翻遍全盘
 * result: 冷档路径稳定；session.json 和索引能解释每个压缩文件是谁
 */
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = dataRoot(HOME)
export const ARCHIVE_ROOT = path.join(DATA, 'archive', 'raw')
export const ARCHIVE_INDEX = path.join(DATA, 'archive', 'index')
export const STAGING = path.join(DATA, 'archive', '.staging')
export const TRASH = path.join(DATA, 'archive', 'trash')

export function monthKey(iso) {
  const s = String(iso || '')
  const m = /^(\d{4})-(\d{2})/.exec(s)
  if (m) return `${m[1]}/${m[2]}`
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function archiveDir(sessionId, startedAt) {
  return path.join(ARCHIVE_ROOT, ...monthKey(startedAt).split('/'), String(sessionId))
}

export function archiveFile(sessionId, turn, startedAt) {
  return path.join(archiveDir(sessionId, startedAt), `${Number(turn) || 0}.jsonl.zst`)
}

export function archiveSessionFile(sessionId, startedAt) {
  return path.join(archiveDir(sessionId, startedAt), 'session.json')
}

export function archiveIndexFile(startedAt) {
  return path.join(ARCHIVE_INDEX, `${monthKey(startedAt).replace('/', '-')}.jsonl`)
}
