// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-decay
 * kind: module
 * summary: 记忆衰减：算"现在还剩多强"，不改原文；承诺永不衰减。
 * tags: 衰减, 半衰期, 不改原文
 * created: 2026-11-11 01:15:00
 * changed: 2026-11-11 01:15:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 记忆层、她、维护者
 * owner: 框架；半衰期数字要老板点头
 * defaults: HALF_LIFE_DAYS 按类型（承诺=永不衰减）
 * off: 不衰减就是所有旧事一样重
 * mutable: 可改数字；**承诺不衰减**不许破
 * usage: strengthOf(event, now) → 0..1 权重；只参与挑选，不改原文
 * why: 会忘才像人；但承诺忘了就不是承诺
 * result: 一个纯计算函数，零副作用
 */
// 记忆衰减：会忘才像人。
//
// 只算"现在还剩多强"，不改原文；承诺（promise）永不衰减。
export const HALF_LIFE_DAYS = Object.freeze({
  promise: Infinity,
  relation: 90,
  fact: 14,
  emotion: 3,
  default: 14,
})

/** 一条记忆现在还剩多少（0..1）。 */
export function strength(entry = {}, { now = Date.now(), kind = '' } = {}) {
  const k = String(kind || entry.kind || 'default')
  const hl = HALF_LIFE_DAYS[k] ?? HALF_LIFE_DAYS.default
  if (!Number.isFinite(hl)) return 1
  const at = Date.parse(entry.at || entry.updatedAt || '')
  if (!Number.isFinite(at)) return 1
  const days = Math.max(0, (now - at) / 86400000)
  return Math.pow(0.5, days / hl)
}

