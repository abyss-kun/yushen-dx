// 工作记录：我（开发侧）每动一步，都要落到鱼神的账上，能被小鱼搜到。
// 数据：~/.dsh/dayu/worklog.jsonl
//
// 2026-10-30 老板立规：以后不管谁改什么，都要留下六件事——谁、什么时候、在哪、干了什么、
// 谁让他干的、为什么；再补一条「这段以后还允不允许改」。要能查。
// 所以这里多收五个字段，并由 note-work.mjs 生成一行注释，贴到改动处上方。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'worklog.jsonl')

const cut = (v, n) => String(v || '').slice(0, n)

export function recordWork({
  what, files = [], evidence = '', kind = 'change', note = '', tq = '',
  by = '', auth = '', why = '', where = '', mutable = '',
} = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('what 不能为空（这次改了什么）')
  const list = Array.isArray(files) ? files.map((f) => String(f).slice(0, 160)).slice(0, 20) : []
  const row = {
    at: new Date().toISOString(),
    kind: cut(kind, 20),
    what: cut(text, 400),
    files: list,
    evidence: cut(evidence, 300),
    note: cut(note, 300),
    tq: cut(tq, 600),
    // 留痕六件 + 一条政策（老板 2026-10-30 立）
    by: cut(by, 60),        // 谁改的：角色·通道，例如「大鱼·工作台」
    auth: cut(auth, 80),    // 谁让改的：主人 / 自己 / 某个员工
    why: cut(why, 300),     // 为什么改
    where: cut(where, 200), // 改在哪：文件:行号或章节
    mutable: cut(mutable, 200), // 这段以后还让不让改
  }
  fs.mkdirSync(DATA, { recursive: true })
  fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
  return row
}

export function listWork(limit = 30) {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    return lines.slice(-Math.max(1, Math.min(200, limit))).reverse().map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

export function searchWork(q, limit = 20) {
  const text = String(q || '').trim().toLowerCase()
  if (!text) return []
  return listWork(500).filter((w) => [w.what, w.evidence, w.note, w.by, w.auth, w.why, w.where, w.mutable, ...(w.files || [])].join(' ').toLowerCase().includes(text)).slice(0, limit)
}

/** 贴到改动处上方的一行：格式固定，好 grep、好查。 */
export function traceLine(row = {}) {
  const at = String(row.at || '').slice(0, 16).replace('T', ' ')
  return `改｜${at}｜${row.by || '?'}｜授权：${row.auth || '?'}｜${row.where || (row.files || []).join(',') || '?'}｜`
    + `${row.what || '?'}｜为什么：${row.why || '?'}｜可改：${row.mutable || '?'}`
}
