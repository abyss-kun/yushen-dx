/* 标签
 * id: lib-raw-layout
 * kind: module
 * summary: 本源归档目录规则的兼容入口；实现在 memory-core/runtime/archive.js。
 * tags: 归档, 兼容入口, 单一实现
 * created: 2026-11-12 21:35:00
 * changed: 2026-11-12 23:10:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：核心一份）
 * audience: raw-archive-plan、恢复器
 * owner: 框架；改实现去 memory-core/runtime/archive.js
 * mutable: 可改；这里只留转发
 * usage: export { ARCHIVE_ROOT, ARCHIVE_INDEX, STAGING, TRASH, monthKey, archiveDir, archiveFile, archiveSessionFile, archiveIndexFile } from '../memory-core/runtime/archive.js'
 * why: 旧路径不能断
 * result: 老 import 照常，实际逻辑在 core
 */
export * from '../memory-core/runtime/archive.js'
