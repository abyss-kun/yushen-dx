// 改｜2026-11-24 23:50｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/live-transcript.js:1｜本轮整理提交：该文件在本轮之前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
/* 标签
 * id: lib-live-transcript
 * kind: module
 * summary: 投影落盘的兼容入口；实现在 memory-core/runtime/projection.js。
 * tags: 投影, 落盘, 兼容入口, 单一实现
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-12 23:37:55
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份，投影落盘搬进 core）
 * audience: turn-capture、测试
 * owner: 框架；改实现去 memory-core/runtime/projection.js
 * mutable: 可改；这里只留转发
 * usage: export const X = p.X
 * why: 旧路径不能断；投影落盘只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
import * as p from '../memory-core/runtime/projection.js'

export const liveFileFor = p.liveFileFor
export const appendTurn = p.appendTurn
export const appendTurnBlock = p.appendTurnBlock
export const turnBlockState = p.turnBlockState
