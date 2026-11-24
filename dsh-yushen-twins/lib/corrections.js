// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-corrections
 * kind: module
 * summary: 纠错：被老板纠正过一次就记下来，下次进她眼前，改不改她自己定（不是规则表）。
 * tags: 纠错, 提醒, 不强制
 * created: 2026-11-11 01:15:00
 * changed: 2026-11-11 01:15:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 她（简报里一行）、老板、维护者
 * owner: 框架；原话归老板
 * mutable: 可改；**不许升级成硬规则**（只提醒，不拦）
 * usage: 记一条原话 → 简报里一行；她决定改不改
 * why: 教训不记就重复犯；写成硬规则又变成控制
 * result: 一份"他说过这样不对"的提醒
 */
// 纠错：被老板纠正过一次，下次别再犯。
//
// 不是规则表：只记"他上次说这样不对"，下次进她眼前，她自己决定改不改。
import fs from 'node:fs'
import path from 'node:path'
import { runtimeDir, ensureRuntime } from './runtime.js'

function file(role) { return path.join(runtimeDir(role), 'corrections.jsonl') }

/**
 * 记一次纠正。
 * @param {{what:string, was?:string, should?:string, now?:number}} c
 */
export function noteCorrection(role, { what = '', was = '', should = '', now = Date.now() } = {}) {
  const w = String(what || '').trim()
  if (!w) throw new Error('他纠正你什么？写一句')
  ensureRuntime(role)
  const row = { at: new Date(now).toISOString(), what: w.slice(0, 200), was: String(was || '').slice(0, 200), should: String(should || '').slice(0, 200) }
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.appendFileSync(file(role), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}

export function listCorrections(role, { limit = 8 } = {}) {
  let lines = []
  try { lines = fs.readFileSync(file(role), 'utf8').split(/\r?\n/) } catch { return [] }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return rows.slice(-Math.max(1, Number(limit) || 8))
}

/** 注入：他上次纠正过什么。 */
export function correctionLine(role) {
  const rows = listCorrections(role, { limit: 5 })
  if (!rows.length) return ''
  return `## 他纠正过你的\n${rows.map((r) => `- ${r.what}${r.should ? `（应该：${r.should}）` : ''}`).join('\n')}\n记着就行；改不改、怎么改，你自己判断。`
}
