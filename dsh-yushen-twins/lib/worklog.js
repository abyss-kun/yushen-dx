/* 标签
 * id: lib-worklog
 * kind: module
 * summary: 工作记录：我（开发侧）每动一步，都要落到鱼神的账上，能被小鱼搜到
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: recordWork / listWork / searchWork / traceLine（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
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

// 改｜2026-11-10 19:55｜大鱼·子代理｜授权：老板（本次任务书：让「改成什么样、为什么」能被检索到）｜lib/worklog.js:19-45｜工作账多收一个 diff 字段：记账那一刻的工作区 diff（前 40 行），抓不到就是空串｜为什么：有 commit 的改动是极少数（11-10 实测 730 个文件没提交），光靠 git show 取不到「改前→改后」，只能读当前行段 + 当时的原话；在写账那一刻抓才是真数据｜验证：node --check lib/worklog.js；node scripts/note-work.mjs 记一条后 worklog.jsonl 里出现非空 diff｜可改：字段只增不删；抓取失败必须是空串，不许编
export function recordWork({
  what, files = [], evidence = '', kind = 'change', note = '', tq = '',
  by = '', auth = '', why = '', where = '', mutable = '', diff = '',
} = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('what 不能为空（这次改了什么）')
  const list = Array.isArray(files) ? files.map((f) => String(f).slice(0, 160)).slice(0, 20) : []
  const row = {
    at: new Date().toISOString(),
    // 2026-11-04：分身之间不通气的补丁——记下是哪条会话写的，注入里才能区分"我"和"别人"
    session: String(process.env.DSH_SESSION_ID || '').slice(0, 60),
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
    diff: cut(diff, 4000), // 记账那一刻的工作区 diff（前 40 行）；抓不到就是空串
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

// 改｜2026-11-02 14:52｜大鱼·子会话（工作台）｜授权：主人（本次任务书：六要素要齐）｜lib/worklog.js:59-74｜traceLine 补上「验证：」一段（原来只有 5 项），并把字段里的 ｜ 和换行先换掉，免得一条留痕被拆坏｜为什么：新的六要素要求「怎么验」，note-work 打印的那行必须自带，贴上去就能过 check-trace｜验证：node scripts/note-work.mjs 打印的行被 parseTrace 认成六项齐；check-trace --files lib/worklog.js 退出 0｜可改：字段只增不删；不许给缺的字段填假值
/** 贴到改动处上方的一行：格式固定，好 grep、好查。六要素定义见 lib/trace-standard.js。 */
export function traceLine(row = {}) {
  const clean = (v, n = 300) => String(v || '?').replace(/[｜|]/g, '／').replace(/\s*\n\s*/g, ' ').trim().slice(0, n) || '?'
  const at = String(row.at || '').slice(0, 16).replace('T', ' ')
  return `改｜${at}｜${clean(row.by, 60)}｜授权：${clean(row.auth, 80)}｜${clean(row.where || (row.files || []).join(','), 200)}｜`
    + `${clean(row.what, 200)}｜为什么：${clean(row.why, 200)}｜验证：${clean(row.evidence, 200)}｜可改：${clean(row.mutable, 200)}`
}
