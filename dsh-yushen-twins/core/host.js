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
