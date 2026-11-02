// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
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
