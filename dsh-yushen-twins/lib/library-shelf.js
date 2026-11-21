/* 标签
 * id: lib-library-shelf
 * kind: module
 * summary: 闭架库的兼容入口；实现在 memory-core/runtime/shelf.js。
 * tags: 兼容入口, 单一实现
 * created: 2026-11-02 16:06:00
 * changed: 2026-11-12 23:42:50
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份，壳只转发）
 * audience: 本体与脚本
 * owner: 框架；改实现去 memory-core/runtime/shelf.js
 * mutable: 可改；这里只留转发
 * usage: export const X = m.X
 * why: 旧路径不能断；实现只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
import * as m from '../memory-core/runtime/shelf.js'

export const DATA = m.DATA
export const LIB = m.LIB
export const OPEN_LAYER = m.OPEN_LAYER
export const CLOSED_LAYER = m.CLOSED_LAYER
export const DEFAULT_DAYS = m.DEFAULT_DAYS
export const monthOf = m.monthOf
export const timeOfRow = m.timeOfRow
export const inspectFile = m.inspectFile
export const openFiles = m.openFiles
export const planDemotion = m.planDemotion
export function demoteStale(...a) { return m.demoteStale(...a) }
export const closedFiles = m.closedFiles
export function revive(...a) { return m.revive(...a) }
export const shelfStats = m.shelfStats
export const closedLookup = m.closedLookup
export function demoteDaily(...a) { return m.demoteDaily(...a) }
