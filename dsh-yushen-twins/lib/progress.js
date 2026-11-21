/* 标签
 * id: lib-progress
 * kind: module
 * summary: 进度视图：在做 / 卡住 / 等谁 / 最近做完，从议程、承诺、派活、worklog 合成一张只读表。
 * tags: 进度, 视图, 台账, 派活
 * created: 2026-11-21 19:5x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：做插件做软件要能知道进度，哪些有哪些没有）
 * audience: 注入/工具/维护
 * owner: 框架；只读，不改账
 * usage: buildProgress({days}) / renderProgress({days})
 * why: 数据散在四处，问“到哪了”要翻四个文件
 * result: renderProgress() 一张 markdown；只读，不改任何账
 * mutable: 可改
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readAgenda } from './agenda.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const ROLES = ['dayu', 'xiaoyu', 'dragon']
const STATE_CN = { doing: '在做', want: '想做', blocked: '卡住', waiting: '等', done: '做完', dropped: '放下' }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

function oneLine(s, n = 50) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n) }

export function buildProgress({ now = Date.now(), days = 7 } = {}) {
  const doing = []; const blocked = []; const waiting = []
  for (const role of ROLES) {
    let items = []
    try { items = readAgenda(role).items || [] } catch { items = [] }
    for (const it of items) {
      const row = { role, what: String(it.what || ''), state: it.state, at: it.updatedAt || it.at || '' }
      if (!row.what) continue
      if (it.state === 'doing' || it.state === 'want') doing.push(row)
      else if (it.state === 'blocked') blocked.push(row)
      else if (it.state === 'waiting') waiting.push(row)
    }
  }
  const promises = readJsonl(path.join(DATA, 'relations', 'promises.jsonl'))
    .filter((r) => String(r.status || '') === 'open')
    .map((r) => ({ what: String(r.what || ''), at: r.madeAt || r.at || '' }))
  const jobs = readJson(path.join(DATA, 'dispatch.json'), [])
  const dispatch = (Array.isArray(jobs) ? jobs : [])
    .filter((j) => ['waiting', 'ready-for-review', 'returned'].includes(String(j.status || '')))
    .slice(-5)
    .map((j) => ({ id: j.id, status: j.status, brief: oneLine(j.brief, 40) }))
  const cutoff = new Date(now - days * 86400e3).toISOString()
  const done = readJsonl(path.join(DATA, 'worklog.jsonl'))
    .filter((r) => r.at && r.at >= cutoff && String(r.kind || '') === 'change')
    .map((r) => ({ at: r.at.slice(0, 10), what: oneLine(r.what, 60) }))
    .slice(-8)
    .reverse()
  return { doing, blocked, waiting, promises, dispatch, done }
}

export function renderProgress(opts = {}) {
  const p = buildProgress(opts)
  const out = ['# 进度（只读生成，别手改）', '']
  const sec = (title, rows, fmt) => {
    out.push(`## ${title}（${rows.length}）`)
    if (!rows.length) out.push('- 没有')
    for (const r of rows) out.push(`- ${fmt(r)}`)
    out.push('')
  }
  sec('在做', p.doing, (r) => `[${r.role}] ${r.what}${r.at ? `（${String(r.at).slice(0, 10)}）` : ''}`)
  sec('卡住', p.blocked, (r) => `[${r.role}] ${r.what}`)
  sec('等谁', p.waiting, (r) => `[${r.role}] ${r.what}`)
  sec('答应的事（没还）', p.promises, (r) => `${r.what}`)
  sec('派活单', p.dispatch, (r) => `${r.id} · ${r.status} · ${r.brief}`)
  sec('最近做完（近 7 天）', p.done, (r) => `${r.at} ${r.what}`)
  return out.join('\n').trim() + '\n'
}
