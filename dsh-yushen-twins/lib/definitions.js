// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜lib/definitions.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: lib-definitions-shell
 * kind: module
 * summary: 转发壳：长期决定（定义类）的真身在 memory-core/generic/definitions.js。
 * tags: 定义, 长期决定, 转发壳, 搬家, 记忆
 * created: 2026-11-21 00:1x
 * changed: 2026-11-24 21:26:02
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：核心那两个本来就通用的模块搬进 memory-core/generic/，lib 留薄壳转发）
 * why: 让以后独立记忆包能直接 import 核心，而不是复制一份；现有 import 一行都不改
 *        （lib/soul.js、lib/now-page.js、dayu/m1.js 继续 ./definitions.js）。
 * result: 本文件不含任何逻辑；逻辑、常量、注释都原样在 memory-core/generic/definitions.js。
 * moved: 2026-11-24——真身 → memory-core/generic/definitions.js（改逻辑去那边，别改这里）
 * mutable: 可改（但只许改转发目标；把逻辑搬回来 = 两份源码，不许）
 * audience: 框架内部（lib/soul.js、lib/now-page.js、dayu/m1.js 的 import）、以后独立记忆包
 * owner: 框架；改逻辑去 memory-core/generic/definitions.js
 * usage: addDefinition({text,source,quote}) / readDefinitions({limit}) / buildDefinitionsBlock(task) / definitionConflict(a,b)
 */
// 2026-11-24 搬到 memory-core/generic/，此文件只做转发，改逻辑去 memory-core/generic/definitions.js
//
// 为什么把名字再点一遍：回归「全模块命名导入都能解析」是拿正则按**文本**找 `export … 名字` 的，
// 只写一句星号导出它看不见（soul.js / now-page.js / m1.js 都按名字导入了它们）。
// 所以下面那行必须写成一整行（点名导出）；再下面那句星号导出是兜底：真身以后多导出什么，这边不用跟着改。
export { readDefinitions, definitionConflict, addDefinition, buildDefinitionsBlock } from '../memory-core/generic/definitions.js'
export * from '../memory-core/generic/definitions.js'
