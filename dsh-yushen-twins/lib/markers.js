/* 标签
 * id: lib-marker-rules
 * kind: module
 * summary: 标记清单的兼容入口；实现在 memory-core/runtime/markers.js。
 * tags: 标记, 兼容入口, 单一实现
 * created: 2026-11-12 21:20:00
 * changed: 2026-11-12 23:10:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份）
 * audience: marker-coverage、测试
 * owner: 框架；改实现去 memory-core/runtime/markers.js
 * mutable: 可改；这里只留转发
 * usage: export { MARKERS, missingMarkers } from '../memory-core/runtime/markers.js'
 * why: 旧路径不能断
 * result: 老 import 照常，实际逻辑在 core
 */
export * from '../memory-core/runtime/markers.js'
