/* 标签
 * id: lib-turn-capture
 * kind: module
 * summary: 逐轮抄录的兼容入口；实现在 memory-core/runtime/capture.js。
 * tags: 逐轮, 抄录, 兼容入口, 单一实现
 * created: 2026-11-12 01:20:00
 * changed: 2026-11-12 23:56:01
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份，采集搬 core）
 * audience: dayu/index.js、测试
 * owner: 框架；改实现去 memory-core/runtime/capture.js
 * mutable: 可改；这里只留转发
 * usage: export const X = c.X
 * why: 旧路径不能断；采集只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
import * as c from '../memory-core/runtime/capture.js'

export const createTurnCapture = c.createTurnCapture
export const TURN_MARKS = c.TURN_MARKS
export const renderTurn = c.renderTurn
export const hhmmss = c.hhmmss
export const boundRoleOf = c.boundRoleOf
export const splitParagraphs = c.splitParagraphs
export const splitSentences = c.splitSentences
export const splitThinkSentences = c.splitThinkSentences
export const thinkScore = c.thinkScore
export const digestThinks = c.digestThinks
export const toolPurpose = c.toolPurpose
