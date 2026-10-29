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

/** 按强度排序，弱的往后；低于阈值的可选剔除。 */
export function rank(entries = [], { now = Date.now(), min = 0, kind = '' } = {}) {
  return entries
    .map((e) => ({ entry: e, s: strength(e, { now, kind }) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.entry)
}
