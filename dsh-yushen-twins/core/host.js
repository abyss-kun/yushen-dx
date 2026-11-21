// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: core-host
 * kind: module
 * summary: 宿主契约：一个宿主只需实现 send/registerTool/onEvent/read/write（serve、auth 可选）；文件宿主兜底。
 * tags: 宿主, 契约, 适配器, 核心
 * created: 2026-11-11 00:45:00
 * changed: 2026-11-11 00:50:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 写适配器的人（DSH/CLI/别家宿主）、维护者
 * owner: 框架；改契约等于让所有适配器跟着改，要老板点头
 * mutable: 可改；**五个必实现的方法只许加不许减**（减了适配器就悄悄失效）
 * usage: attach(host) → 返回她；createFileHost(name) → 没有会话的文件宿主（CLI/测试兜底）
 * why: 换宿主不该重写她；契约固定，适配器各写各的
 * result: attach 校验五个方法，缺一个直接抛；current 只存一个宿主，不做多宿主切换
 */
// core · 她只需要的六样能力（宿主契约）
// 一个宿主 = 实现 send / registerTool / onEvent / read / write（serve、auth 可选）。

import { read as fileRead, write as fileWrite } from './store.js'

let current = null

/** 文件宿主：没有会话、没有工具，只保证她的数据能读写；CLI、测试用它兜底。 */
export function createFileHost(name = 'file') {
  return {
    name,
    async send() { throw new Error(`${name} 宿主没有会话，发不出去`) },
    registerTool() { /* 文件宿主不注册工具 */ },
    onEvent() { /* 文件宿主没有事件流 */ },
    read: fileRead,
    write: fileWrite,
    serve() { /* 没有网页 */ },
    auth() { return true },
  }
}

/** 接一个宿主；返回她。 */
export function attach(host) {
  if (!host || typeof host !== 'object') throw new Error('attach 需要宿主对象')
  for (const key of ['send', 'registerTool', 'onEvent', 'read', 'write']) {
    if (typeof host[key] !== 'function') throw new Error(`宿主缺少 ${key}()，不满足契约`)
  }
  current = host
  return { name: host.name || 'unknown', host }
}

export function host() {
  if (!current) throw new Error('还没有接入宿主：先 attach(host)')
  return current
}

export function isAttached() {
  return current !== null
}
