// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: core-index
 * kind: module
 * summary: 核心出口：把 host/store/ledger/soul 四个模块汇总导出一处，别人只 import 这里。
 * tags: 出口, 核心, 汇总
 * created: 2026-11-11 00:45:00
 * changed: 2026-11-11 00:50:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 别的仓库/宿主要接"她"时（只 import 这个入口）、维护者
 * owner: 框架；加一个导出等于扩大核心面，要老板点头
 * mutable: 可改（只许加导出；减了就是破坏兼容）
 * usage: import { attach, store, ledger, soul, dispatch } from '../core/index.js'
 * why: 谁都不该按文件路径 import 内部模块——一改目录结构全断
 * result: 一个稳定出口 + CORE_VERSION；再往下加能力先加这里的导出
 */
// core · 宿主无关的她
// 这里不 import 任何 DSH 代码；DSH 插件只做接线（见 宿主契约.md）。

export const CORE_VERSION = '0.1.0'
export { attach, host, isAttached, createFileHost } from './host.js'
export * as store from './store.js'
export * as ledger from './ledger.js'
export * as soul from './soul.js'
export * as dispatch from './dispatch.js'
