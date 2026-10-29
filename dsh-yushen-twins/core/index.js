// core · 宿主无关的她
// 这里不 import 任何 DSH 代码；DSH 插件只做接线（见 宿主契约.md）。

export const CORE_VERSION = '0.1.0'
export { attach, host, isAttached, createFileHost } from './host.js'
export * as store from './store.js'
export * as ledger from './ledger.js'
export * as soul from './soul.js'
