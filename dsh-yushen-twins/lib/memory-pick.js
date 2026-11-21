/* 标签
 * id: lib-memory-pick
 * kind: module
 * tags: 记忆, 转发壳, 搬家
 * created: 2026-11-04 18:55:00
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-07 S1 任务书：把 pick 搬进 memory-core/，现有 import 一行都不许改）
 * why: 记忆库拆分第 1 步（docs/方案-记忆库拆分.md §5）——真身搬走，旧地址留转发，
 *      soul.js / brief.js / memory-search.js / eval-memory.mjs / 三个 test-memory-*.mjs 的 import 全都不用动。
 * result: 本文件不含任何逻辑；逻辑、常量、注释都原样在 memory-core/pick.mjs（只改了 aliases.json 的路径）。
 * moved: 2026-11-07 S1——真身 → memory-core/pick.mjs（改逻辑去那边，别改这里）
 * mutable: 可改（但只许改转发目标；把逻辑搬回来 = 两份源码，不许）
 * summary: 转发放射层：真身在 memory-core/pick.mjs（BM25 + 实体图挑注入的那几条）。
 * audience: 框架内部（brief.js 的 import）、新角色
 * owner: 框架；改逻辑去 memory-core/pick.mjs
 * usage: pickForInject(role,{n,cue}) 挑要注入的记忆；其余转发
 * off: 不能关；要换策略改 memory-core/pick.mjs
 */
// 2026-11-07 搬到 memory-core，此文件只做转发，改逻辑去 memory-core/pick.mjs
//
// 为什么把名字再点一遍：回归「全模块命名导入都能解析」是拿正则按**文本**在同一行里找 export 后面的名字的，
// 只写一句星号导出它看不见 —— lib/brief.js 导入了 pickForInject，它会报「memory-pick.js 没导出」。
// 所以下面这行必须写成一整行；再下面那句星号导出是兜底：memory-core/pick.mjs 以后多导出什么，这边不用跟着改。
export { scoreEvent, tokenizeForBM25, tokensWithAliases, bm25Scores, entityIdsOf, graphRelevance, pickForInject } from '../memory-core/pick.mjs'
export * from '../memory-core/pick.mjs'
