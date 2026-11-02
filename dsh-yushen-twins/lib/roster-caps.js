// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 名册能力表（2026-10-31 老板定：出厂要能只用一条鱼，以后还能加第二、第三、第四个）。
//
// 一条原则：**一切按名册推导，不按包里有什么**。
//   · 不适用 ≠ 删能力 —— 是"不注入、不显示、入口不出现"；以后加了人，功能自己回来。
//   · 所有人都在问同一张表，不要各处再写死 ['dayu','xiaoyu','dragon']。
//
// 用法：
//   import { rosterCaps } from './roster-caps.js'
//   const caps = rosterCaps(characterIds())
//   if (caps.peerChat) { ... 姐妹群聊入口 ... }
//
// 纯函数：不读文件、不联网，给测试直接喂名册。

/**
 * @param {string[]} roster 在册角色 id（1..N，N 不设上限）
 * @returns {{
 *   roster: string[], count: number, solo: boolean, multi: boolean,
 *   peerChat: boolean, peerDispatch: boolean, rotation: boolean, peerTabs: boolean,
 *   review: 'solo'|'duo'|'council', reviewLabel: string,
 *   roleChapters: 'self-only'|'all', canAddRole: boolean,
 * }}
 */
export function rosterCaps(roster = []) {
  const ids = [...new Set((Array.isArray(roster) ? roster : []).map((x) => String(x || '').trim()).filter(Boolean))]
  const n = ids.length
  const multi = n > 1
  // 会审形态随人数降级，不是消失：单人也要有"提议→自己查→老板点头"这条路，否则机制缺条腿。
  const review = n >= 3 ? 'council' : (n === 2 ? 'duo' : 'solo')
  const reviewLabel = review === 'council'
    ? '会审（各查一次，不一致公审）'
    : review === 'duo' ? '双人复审（一人查，一人判）' : '单人：提议 → 自查证据 → 老板点头'
  return {
    roster: ids,
    count: n,
    solo: n === 1,
    multi,
    peerChat: multi,      // 姐妹群聊 / 串门 / 关系账
    peerDispatch: multi,  // 把活派给另一个角色
    rotation: multi,      // 错峰、轮值、轮班（只有一个人时没有"轮"）
    peerTabs: multi,      // 其他角色的页签 / 鱼窝槽位 / 脚印
    review,
    reviewLabel,
    roleChapters: 'self-only', // 岗位章永远只发在场者的；多人的另发各自那份
    canAddRole: true,          // 加人永远允许（界面「+」），不设上限
  }
}

/** 空名册直接 `rosterCaps([])` 就行：count=0，不把人当成三个。 */

