// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-actionlog
 * kind: module
 * summary: 动作记录：谁点了什么、请求到没到、成没成；只追加不覆盖，'点了没反应'先翻这里。
 * tags: 动作日志, 排障, 只追加
 * created: 2026-11-11 00:58:00
 * changed: 2026-11-11 00:58:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 维护者、面板排障；她一般不读
 * owner: 框架；日志格式只许加字段
 * mutable: 可改；只许追加，不许改旧行
 * usage: logAction({who,what,ok,...}) → 追加到 actions.jsonl
 * why: 界面点了没反应时，没有一条"到没到后端"的记录，只能倒推
 * result: 一个追加式 jsonl；写失败静默（不能因为记不上而挡动作）
 */
// 动作记录：谁点了什么、请求到没到、成没成。只追加，不覆盖。
// 目的：下次“点了没反应”，先翻这里，不靠倒推。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const FILE = path.join(DATA, 'actions.jsonl')

export function recordAction(row = {}) {
  try {
    fs.mkdirSync(DATA, { recursive: true })
    const line = {
      at: new Date().toISOString(),
      kind: String(row.kind || 'api').slice(0, 40),
      path: String(row.path || '').slice(0, 160),
      method: String(row.method || '').slice(0, 10),
      status: Number(row.status) || 0,
      ms: Number(row.ms) || 0,
      ok: row.ok !== false,
      note: String(row.note || '').slice(0, 200),
    }
    fs.appendFileSync(FILE, JSON.stringify(line) + '\n', 'utf8')
    return line
  } catch { return null }
}

export function listActions(limit = 30) {
  try {
    const lines = fs.readFileSync(FILE, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    return lines.slice(-Math.max(1, Math.min(200, limit))).reverse().map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
