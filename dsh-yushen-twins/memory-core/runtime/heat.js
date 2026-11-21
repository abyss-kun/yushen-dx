/* 标签
 * id: memory-core-heat
 * kind: module
 * summary: 读时热度：用上过的卡按半衰期衰减；只读 feedback，不写卡。
 * tags: 热度, 降温, 反馈, 排序
 * created: 2026-11-15 13:15:00
 * changed: 2026-11-15 13:10:26
 * author: 大鱼·本班
 * authority: 老板（2026-11-15：检索用了权重升，随时间降低）
 * audience: query、cards、以后页面
 * owner: 框架；只读
 * mutable: 可改；别把“出场”当用上
 * usage: heatMap({now,halfLifeDays})
 * why: feedback 只有累计次数，没有时间衰减
 * result: 最近常被用上的卡热度高，久不用的自然沉
 */
import { readFeedback } from './feedback.js'

export function heatMap({ now = Date.now(), halfLifeDays = 30, limit = 5000 } = {}) {
  const out = new Map()
  const half = Math.max(1, Number(halfLifeDays) || 30)
  for (const r of readFeedback({ limit })) {
    if (!/用上/.test(String(r.used || '')) || /没用|未用/.test(String(r.used || ''))) continue
    const at = Date.parse(r.at || '') || now
    const decay = Math.pow(0.5, Math.max(0, now - at) / (half * 86400000))
    for (const k of [r.turnId, r.ref]) {
      if (!k) continue
      out.set(String(k), (out.get(String(k)) || 0) + decay)
    }
  }
  return out
}
