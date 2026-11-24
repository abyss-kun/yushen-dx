// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: core-ledger
 * kind: module
 * summary: 账本（唯一事实）：一天一个 events/<日>.jsonl，只追加不改旧行；record() 写一条，today() 读当天最后 N 条。
 * tags: 账本, 事实, 只追加, 核心
 * created: 2026-11-11 00:45:00
 * changed: 2026-11-11 00:45:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式、一眼看懂谁的、能不能动）
 * audience: 核心层（store/dispatch/host 用它记账）、维护者、新装的角色
 * owner: 框架；改它等于改"什么算一条事实"，要老板点头
 * mutable: 可改；**只追加、不改旧行**这条不许破（改了就不是账本了）
 * usage: record({kind,text,...}) → 写一行并回读该行；today(limit) → 当天最后 N 条，坏行跳过
 * why: 之前各类记录散在十几个文件里，没有一处"唯一事实"；审计、对账、复盘都对不齐
 * result: 一个日文件、一条一行的追加式账本；读侧容错（坏行跳过，不整份报废）
 */
// core · 账本（唯一事实）
// 一天一个文件：events/YYYY-MM-DD.jsonl；只追加，不改旧行。

import { append, read } from './store.js'

const pad = (n) => String(n).padStart(2, '0')
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function record(event) {
  const at = new Date().toISOString()
  const row = { at, ...event }
  append(`events/${dayKey()}.jsonl`, JSON.stringify(row))
  return row
}

export function today(limit = 200) {
  const lines = read(`events/${dayKey()}.jsonl`, '').split(/\r?\n/).filter(Boolean)
  const rows = []
  for (const line of lines) {
    try { rows.push(JSON.parse(line)) } catch { /* 跳过坏行 */ }
  }
  return rows.slice(-limit)
}
