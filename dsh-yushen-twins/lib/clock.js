/* 标签
 * id: lib-clock
 * kind: module
 * summary: 时间真源的兼容入口；实现在 memory-core/runtime/time.js。
 * tags: 兼容入口, 单一实现
 * created: 2026-11-02 16:06:00
 * changed: 2026-11-12 23:40:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份，壳只转发）
 * audience: 本体与脚本
 * owner: 框架；改实现去 memory-core/runtime/time.js
 * mutable: 可改；这里只留转发
 * usage: export const X = m.X
 * why: 旧路径不能断；实现只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
import * as m from '../memory-core/runtime/time.js'

export const zone = m.zone
export const now = m.now
export const nowMs = m.nowMs
export const localISO = m.localISO
export const today = m.today
export const dayKey = m.dayKey
export const todayIn = m.todayIn
export const fmt = m.fmt
export const fmtFull = m.fmtFull
