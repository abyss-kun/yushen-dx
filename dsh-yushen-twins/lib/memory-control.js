/* 标签
 * id: lib-memory-control
 * kind: module
 * summary: 记忆开关的兼容入口；实现在 memory-core/runtime/control.js。
 * tags: 记忆, 后台, 开关, 兼容入口, 单一实现
 * created: 2026-11-12 21:45:00
 * changed: 2026-11-12 23:10:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份，别再两边写）
 * audience: turn-capture、dsh-memory
 * owner: 框架；改实现去 memory-core/runtime/control.js
 * mutable: 可改；这里只留转发
 * usage: export { CONTROL_FILE, DEFAULTS, memoryPaths, readControl, writeControl, effectiveFor, shouldSaveSource, statusOf } from '../memory-core/runtime/control.js'
 * why: 旧路径不能断；配置只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
export * from '../memory-core/runtime/control.js'
