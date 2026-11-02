// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 谁住在这儿：全插件**唯一**的角色名单入口（2026-11-01 主人：「写死就改……我一视同仁」）。
//
// 以前每个模块各写一份 `['dayu','xiaoyu']`：日记、知识库、任务经验、晋升、事实问答……
// 照微是 10-30 才进来的，于是这些地方她都进不去——不是设计成三等，是**先来后到被写进了代码**。
// 现在统一从名册取：名册里有谁，这些能力就对谁开放。
//
// 名册读不到时（干净装、还没建人）退回出厂的两条鱼，只为让老代码不炸；**别在别处再写一份**。
//
// 2026-11-01 修：原来用 characterIds()，它对**空名册**会退回 SEED（只有 dayu 一个），
// 于是临时家里 roles() = ['dayu']，写日记/派活只要涉及 xiaoyu 就报「未知角色」——
// 我自己的单测（test-task-cycle）就是这么红的。住户判断只认**名册文件**（rosterIds）；
// 名册里一个都没有，才用兜底两条鱼，不让老代码炸。
import { rosterIds } from './characters.js'

export const FALLBACK_ROLES = Object.freeze(['dayu', 'xiaoyu'])

/** 住在这儿的角色 id（顺序即名册顺序）。 */
export function residentRoleIds() {
  try {
    const ids = rosterIds()
    return ids.length ? ids : [...FALLBACK_ROLES]
  } catch { return [...FALLBACK_ROLES] }
}

/** 这个 id 算不算住户。 */
export function isResidentRole(role) {
  const r = typeof role === 'string' ? role : ''
  return residentRoleIds().includes(r)
}
