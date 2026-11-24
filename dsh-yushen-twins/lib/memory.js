// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-memory-shell
 * kind: module
 * tags: 记忆, 转发壳, 搬家
 * created: 2026-11-07 22:20:00
 * changed: 2026-11-07 22:20:00
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 S2 任务书：把 store 搬进 memory-core/，现有 import 一行都不许改）
 * why: 记忆库拆分第 2 步（docs/方案-记忆库拆分.md §5）——真身搬走，旧地址留转发，
 *      dayu/index.js / channel-memory.js / body-loop.js / consolidate.js / handoff-merge.js /
 *      initiation.js / mind-tools.js / rewrite.js / sync/merge.mjs / supersede.mjs 的 import 全都不用动。
 * result: 本文件不含任何逻辑；逻辑、常量、注释都原样在 memory-core/store.mjs。
 * moved: 2026-11-07 S2——真身 → memory-core/store.mjs（改逻辑去那边，别改这里）
 * mutable: 可改（但只许改转发目标；把逻辑搬回来 = 两份源码，不许）
 * summary: 转发放射层：真身在 memory-core/store.mjs，这里只把名字再导出一遍（回归按文本认导出）。
 * audience: 框架内部（旧 import 路径）、新角色
 * owner: 框架；改逻辑去 memory-core，别改这里
 * usage: appendEvent/readEvents/applyDailyDecay/bumpRecall 等全部转发到 memory-core/store.mjs
 * off: 不能关（一堆模块经它 import）；要换实现就改 memory-core
 */
// 2026-11-07 搬到 memory-core，此文件只做转发，改逻辑去 memory-core/store.mjs
//
// 为什么把名字再点一遍：回归「全模块命名导入都能解析」是拿正则按**文本**在同一行里找 export 后面的名字的，
// 只写一句星号导出它看不见 —— channel-memory.js 等文件导入了 appendEvent，它会报「memory.js 没导出」。
// 所以下面这行必须写成一整行；再下面那句星号导出是兜底：memory-core/store.mjs 以后多导出什么，这边不用跟着改。
export { MAX_EVENTS, SEQ_FILE, memoryFile, readEvents, archiveDropped, withLock, nextSeq, roleForSession, attributionOf, appendEvent, CLARITY_ORDER, CLARITY_LABEL, MEMORY_CAPACITY_THRESHOLDS, memoryCapacity, applyDailyDecay, bumpRecall, supersede } from '../memory-core/store.mjs'
export * from '../memory-core/store.mjs'
