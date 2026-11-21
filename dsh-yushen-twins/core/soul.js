// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: core-soul
 * kind: module
 * summary: 魂与派活的只读视图：persona/宪章/派活单/概况；读不到就返回 null，不编。
 * tags: 魂, 宪章, 派活, 只读, 核心
 * created: 2026-11-11 00:45:00
 * changed: 2026-11-11 00:45:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: CLI、新宿主、维护者；她自己不直接调（注入走 lib/soul.js）
 * owner: 框架；人格内容归角色本人（persona 是她的字），读取逻辑归框架
 * mutable: 可改读取逻辑；**不许在这里写文件**（只读视图，写入口在别处）
 * usage: soul() / charter() / jobs() / openJobs() / profile() —— 全是读，没有副作用
 * why: 别的宿主/命令行要一眼看她是谁、宪章第几版、还压着几单，不该各拼一套
 * result: 五个只读函数；读不到返回 null/空数组，绝不造数据
 */
// core · 魂与派活（只读文件，不依赖宿主）

import { readJson } from './store.js'

/** 她是谁：persona.json；没有就返回 null，不编。 */
export function soul() {
  return readJson('soul/persona.json', null)
}

/** 宪章：版本、身份、权限。 */
export function charter() {
  return readJson('charter.json', null)
}

/** 派活单：new → old。 */
export function jobs() {
  const list = readJson('dispatch.json', [])
  return Array.isArray(list) ? list : []
}

export function openJobs() {
  return jobs().filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
}

/** 她的概况：给 CLI/新宿主看的一眼。 */
export function profile() {
  const s = soul()
  const c = charter()
  return {
    name: s?.owner?.callName || s?.name || '大鱼',
    soulVersion: s?.version || '',
    charterVersion: c?.version || '',
    jobs: jobs().length,
    open: openJobs().length,
  }
}
