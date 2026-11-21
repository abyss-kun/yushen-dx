/* 标签
 * id: lib-self-push
 * kind: module
 * summary: 主动推送：把她攒着、但一直没机会说的事，端到老板面前
 * audience: 维护者 / 宿主
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: pushPaths / buildPush / markPushed（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 主动推送：把她攒着、但一直没机会说的事，端到老板面前。
//
// 为什么（2026-11-03 老板）：「为什么别人的鱼可以想到其他的，而你我不问你不说」。
// 查下来：容器都有（议程 / 攒话 / 想念），但一直是空的；而且**没有通道**——攒着的话
// 只写进 news.json，注入里也只说「你攒了 N 件」，从来不推到老板眼前。所以她"不问不说"。
//
// 这条只做一件事：一天两次（默认间隔 8 小时）、有**新的或没说过**的内容时，
// 汇总成一条通知交给收件箱；没内容就不推（不刷屏是硬约束）。
//
// 数据：news 在 runtime/<role>/news.json（她写），承诺在 relations/promises.jsonl，
// 推送水位在 runtime/<role>/push.json。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

/** 两个推送时段的本地小时（含端点前）：午后一次、睡前一次。 */
export const SLOTS = Object.freeze([[13, 15], [21, 23]])
export const MIN_GAP_MS = 8 * 60 * 60 * 1000   // 8 小时最小间隔（不是时区偏移）

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
const readLines = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
const inSlot = (now) => {
  const h = new Date(now).getHours()
  return SLOTS.some(([from, to]) => h >= from && h < to)
}

export function pushPaths(role, { dataDir = DATA } = {}) {
  const runtime = path.join(dataDir, 'runtime', role)
  return {
    news: path.join(runtime, 'news.json'),
    state: path.join(runtime, 'push.json'),
    agenda: path.join(runtime, 'agenda.json'),
    promises: path.join(dataDir, 'relations', 'promises.jsonl'),
  }
}

/** 攒着的话里，还没被推过的那几条（水位按条数记；她清过就当全清了）。 */
function freshNews(role, paths, state) {
  const doc = readJson(paths.news, { items: [] })
  const items = Array.isArray(doc.items) ? doc.items : []
  const seen = Number(state.newsCount) || 0
  const fresh = items.length > seen ? items.slice(seen) : []
  return { items, fresh }
}

function overduePromises(paths, now) {
  const rows = readLines(paths.promises)
  return rows
    .filter((r) => r && r.status === 'open' && r.dueAt && Number.isFinite(Date.parse(r.dueAt)))
    .filter((r) => Date.parse(r.dueAt) <= now)
    .map((r) => ({
      who: String(r.who || ''),
      what: String(r.what || ''),
      overdueHours: Math.floor((now - Date.parse(r.dueAt)) / 3600000),
    }))
}

/**
 * 算出这一轮要不要推、推什么。
 * - 距上次推送 < minGapMs → 不推（除非 force）
 * - 不在两个时段里 → 不推（除非 force）
 * - 没新攒话、没逾期承诺 → 不推
 */
export function buildPush(role, { dataDir = DATA, now = Date.now(), minGapMs = MIN_GAP_MS, force = false } = {}) {
  const paths = pushPaths(role, { dataDir })
  const state = readJson(paths.state, {})
  const lastAt = Number(state.lastAt) || 0
  const gap = now - lastAt

  const { items, fresh } = freshNews(role, paths, state)
  const overdue = overduePromises(paths, now)

  if (!fresh.length && !overdue.length) return { push: false, reason: 'nothing-new', news: items.length, overdue: overdue.length }
  if (!force) {
    if (lastAt && gap < minGapMs) return { push: false, reason: 'too-soon', nextInMs: minGapMs - gap }
    if (!inSlot(now)) return { push: false, reason: 'off-slot' }
  }

  const lines = []
  if (fresh.length) {
    lines.push(`· 她攒着 ${items.length} 件想跟你说的，最近这几件：`)
    for (const it of fresh.slice(-3)) lines.push(`  - ${String(it.what || '').slice(0, 80)}`)
  }
  if (overdue.length) {
    lines.push(`· 逾期未兑现的承诺 ${overdue.length} 条：`)
    for (const p of overdue.slice(0, 3)) lines.push(`  - 答应${p.who ? `（${p.who}）` : ''}：${p.what.slice(0, 60)}（逾期 ${p.overdueHours} 小时）`)
  }

  return {
    push: true,
    text: `【她想跟你说】\n${lines.join('\n')}`,
    news: items.length,
    fresh: fresh.length,
    overdue: overdue.length,
    key: `${items.length}|${overdue.length}|${fresh.map((x) => x.at || '').join(',')}`,
  }
}

/** 推完记水位（只记成功推送过的条数，不删她的数据）。 */
export function markPushed(role, result, { dataDir = DATA, now = Date.now() } = {}) {
  if (!result?.push) return false
  const paths = pushPaths(role, { dataDir })
  const state = readJson(paths.state, {})
  fs.mkdirSync(path.dirname(paths.state), { recursive: true })
  const next = { ...state, lastAt: now, newsCount: result.news, lastKey: result.key || '', lastOverdue: result.overdue || 0 }
  fs.writeFileSync(paths.state, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return true
}
