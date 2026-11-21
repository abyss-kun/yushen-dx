/* 标签
 * id: lib-transition-filter
 * kind: module
 * summary: 过渡筛选的兼容入口；实现在 memory-core/runtime/filter.js，本体和插件共用一份。
 * tags: 筛选, 兼容入口, 单一实现
 * created: 2026-11-12 21:00:00
 * changed: 2026-11-12 23:10:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份，别再两边写）
 * audience: library-chain、live-transcript、refine
 * owner: 框架；改实现去 memory-core/runtime/filter.js
 * mutable: 可改；这里只留转发
 * usage: export { LOGGY, FILTER_VERSION, isNoise, preJudge, classifyEntry } from '../memory-core/runtime/filter.js'
 * why: 旧路径不能断；新核心只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
export * from '../memory-core/runtime/filter.js'
