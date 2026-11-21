/* 标签
 * id: lib-role-of
 * kind: module
 * summary: 谁记的：把「会话 id」翻译成「哪个角色」（2026-11-03 老板：标签要齐——年月日时分秒、谁、为什么）
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: roleForSession / roleFromRef（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-13 00:35:50
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 谁记的：把「会话 id」翻译成「哪个角色」（2026-11-03 老板：标签要齐——年月日时分秒、谁、为什么）。
// 之前手抄本里 2,523 条 role=unknown，根因有两个：
//   ① 写入口把 session 截成 8 位（"session-"），根本对不上号；
//   ② 写入口压根没带 role。
// 这里只做一件小事：给一个会话 id，查它属于大鱼/小鱼/照微；查不到就返回空串（**不猜**）。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = dataRoot(HOME)
const ROLES = new Set(['dayu', 'xiaoyu', 'dragon'])

/** 会话 id → 角色（dayu/xiaoyu/dragon）；查不到返回 ''。 */
export function roleForSession(sid) {
  const id = String(sid || '').trim()
  if (!id) return ''
  if (ROLES.has(id)) return id
  // 1) 派活账本：sessionId + role（最准，派活时记的）
  try {
    const list = JSON.parse(fs.readFileSync(path.join(DATA, 'dispatch.json'), 'utf8'))
    const rows = (Array.isArray(list) ? list : []).filter((t) => String(t?.sessionId || '') === id && ROLES.has(String(t?.role || '')))
    rows.sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')))
    if (rows[0]) return rows[0].role
  } catch { /* 没账本就往下走 */ }
  // 2) 会话标题/登记表里有没有写角色（有些会话名带「大鱼·…」）
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(DATA, 'sessions.json'), 'utf8'))
    const rows = Array.isArray(reg) ? reg : Object.values(reg || {})
    const hit = rows.find((r) => String(r?.id || r?.sessionId || '') === id && ROLES.has(String(r?.role || '')))
    if (hit) return hit.role
  } catch { /* 没有 */ }
  return ''
}

/** 角色 → 中文名（写 who 用） */
export const ROLE_NAME = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }

/**
 * ref 里的角色前缀：`dayu/live/2026/11W45/QQ/xxx.md:11` → dayu。
 * 记忆链的 ref 全是这种形状（角色/live/…），比 session 稳；查不到返回 ''。
 */
export function roleFromRef(ref) {
  const m = String(ref || '').match(/^([a-z]+)\//)
  return m && ROLES.has(m[1]) ? m[1] : ''
}
