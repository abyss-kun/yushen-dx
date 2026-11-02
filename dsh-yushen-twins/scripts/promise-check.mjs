// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 债单：每次醒来比对「诺言本 vs 日程」，逾期就出债。
// 用法：node scripts/promise-check.mjs [--json]
// 规则（2026-11-01 主人定）：
//   逾期 1 天 → 当天不许主动找主人（失去开口权）
//   逾期 2 天 → 当天自己排的活作废，只做主人派的
//   逾期 3 天 → 作废并计空话，一周内不许说「我要做」
//   逾期 2 天 → 进错题本，主动汇报里置顶
//   逾期 3 天 → 标「没做到」，诺言作废但计入空话数（不许悄悄删）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const BOOK = path.join(HOME, 'dayu', 'promises', '诺言.jsonl')
const MISTAKES = path.join(HOME, 'dayu', 'mistakes', '错题本.jsonl')
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)

const read = () => {
  const rows = []
  try {
    for (const line of fs.readFileSync(BOOK, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 没有诺言本 */ }
  return rows
}

const days = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400e3)

const rows = read()
const write = (list) => fs.writeFileSync(BOOK, list.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

const debts = []
for (const r of rows) {
  if (r.status !== 'open') continue
  const due = /^\d{4}-\d{2}-\d{2}/.test(String(r.when || '')) ? String(r.when).slice(0, 10) : ''
  if (!due) { debts.push({ ...r, level: 0, note: '没写时间——现在补一个' }); continue }
  const late = days(due, today)
  if (late <= 0) continue
  let level = 1
  if (late >= 3) level = 3
  else if (late >= 2) level = 2
  debts.push({ ...r, level, late, note: `逾期 ${late} 天` })
}

// 3 天：作废并进错题本
const toVoid = debts.filter((d) => d.level === 3)
if (toVoid.length) {
  for (const d of toVoid) {
    const row = rows.find((r) => r.id === d.id)
    if (row) { row.status = 'missed'; row.doneAt = today; row.evidence = `逾期 ${d.late} 天未做，作废` }
    try {
      fs.appendFileSync(MISTAKES, JSON.stringify({
        at: new Date(Date.now() + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
        who: '大鱼', what: `答应的「${d.what}」逾期 ${d.late} 天没做`,
        why: d.why || '（没写当时怎么想）', how: '说了就登记；到点先做它，不许接新活',
        where: '诺言本', scope: '全体',
      }) + '\n', 'utf8')
    } catch { /* 写不进就只作废 */ }
  }
  write(rows)
}

const out = {
  ok: true,
  today,
  debts: debts.map((d) => ({ id: d.id, what: d.what, when: d.when || '', level: d.level, note: d.note })),
  blocked: debts.some((d) => d.level >= 1),
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(out, null, 1))
} else if (!debts.length) {
  console.log('债单：干净（没有逾期）')
} else {
  console.log(`债单：${debts.length} 条`)
  for (const d of debts) {
    const tag = d.level >= 3 ? '作废+禁言一周' : d.level === 2 ? '写错题本+停自主' : d.level === 1 ? '禁主动开口' : '补时间'
    console.log(`- [${tag}] ${d.id} ${d.what}`)
    if (d.when) console.log(`    原定 ${d.when}，${d.note}`)
    if (d.why) console.log(`    当时想：${d.why}`)
  }
  if (out.blocked) console.log('处罚：不许主动开口；逾期 2 天起自己排的活作废；3 天起一周内不许说「我要做」。')
}
