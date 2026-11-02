// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 「有没有值得说的一句」——主动开口的第一半：判断，不发送。
// 用法：node scripts/should-speak.mjs [--json]
// 原则（2026-11-02 改进清单 1.1）：一天 1–3 次，宁少勿多；没有值得说的就不说。
// 判据（命中任一条才说）：
//   1) 有逾期诺言 / 欠账（该认错或该补）
//   2) 有任务刚做完、且他还没看到（值得报一句）
//   3) 有他关心的事有进展（像是「昨天问的那件事」）
//   4) 距上次主动开口已超过 12 小时，且手上确实有一条「自己排的事」在动
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return d } }
const readJsonl = (p) => {
  const rows = []
  try { for (const l of fs.readFileSync(p, 'utf8').split('\n')) { if (!l.trim()) continue; try { rows.push(JSON.parse(l)) } catch { /* 坏行 */ } } } catch { /* 没有 */ }
  return rows
}
const now = Date.now()
const hours = (ms) => ms / 3600e3

const reasons = []

// 1) 逾期诺言
const promises = readJsonl(path.join(D, 'promises', '诺言.jsonl')).filter((r) => r.status === 'open')
const today = new Date(now + 8 * 3600e3).toISOString().slice(0, 10)
const overdue = promises.filter((r) => /^\d{4}-\d{2}-\d{2}/.test(String(r.when || '')) && String(r.when).slice(0, 10) < today)
if (overdue.length) reasons.push({ kind: 'overdue', weight: 3, why: `${overdue.length} 条诺言逾期`, line: `我欠你 ${overdue.length} 件事没做：${overdue[0].what.slice(0, 40)}` })

// 2) 刚做完的事（今天的 worklog 里带 evidence 的）
const work = readJsonl(path.join(D, 'worklog.jsonl')).filter((r) => String(r.at || '').slice(0, 10) === today)
const withEvidence = work.filter((r) => String(r.evidence || '').trim().length > 8)
if (withEvidence.length >= 2) {
  const last = withEvidence[withEvidence.length - 1]
  reasons.push({ kind: 'done', weight: 2, why: `今天做完 ${withEvidence.length} 件`, line: `今天做完 ${withEvidence.length} 件，最后一件：${String(last.what || '').slice(0, 50)}` })
}

// 3) 手上自己排的事在动
const agenda = readJson(path.join(D, 'agenda.json'), null)
const own = (agenda?.items || []).filter((i) => i.origin === 'self' || i.by === 'self')
const moving = own.filter((i) => i.state === 'doing')
if (moving.length) reasons.push({ kind: 'progress', weight: 1, why: `${moving.length} 件自己在做`, line: `我在弄：${String(moving[0].what || '').slice(0, 40)}（${moving[0].state}）` })

// 4) 距上次主动开口 > 12 小时（有东西可说才提）
const lastSpeak = readJson(path.join(D, 'runtime', 'last-proactive.json'), null)
const since = lastSpeak?.at ? hours(now - new Date(lastSpeak.at).getTime()) : 999
if (since > 12 && reasons.length) reasons.push({ kind: 'silence', weight: 1, why: `已 ${Math.round(since)} 小时没主动开口` })

reasons.sort((a, b) => b.weight - a.weight)
const speak = reasons.length > 0 && since > 2 // 两小时内刚说过就不再开口
const out = {
  ok: true,
  speak,
  why: speak ? reasons[0].why : (reasons.length ? '刚说过，先不打扰' : '没有值得说的一句'),
  line: speak ? reasons[0].line : '',
  candidates: reasons.slice(0, 3),
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1))
else console.log(speak ? `该说：${out.line}` : `不说：${out.why}`)
