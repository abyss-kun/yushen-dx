/* 标签
 * id: lib-refine-quota
 * kind: module
 * summary: 精提炼的配额闸——积压越深跑得越勤越多，但一天花的钱有上限；纯计算，不碰文件。
 * tags: 精提炼, 配额, 预算, 积压, 冷却
 * created: 2026-11-11 19:3x
 * changed: 2026-11-11 20:05:14
 * author: 大鱼·本班（接手交接 2026-11-11-0255）
 * authority: 主人（2026-11-11：「以前不是有自动提炼吗……其他的做」）
 * why: 自动提炼一直在跑，但固定 40 条/6 小时 ≈ 160 条/天，粗提炼每天新增 300~700 条，越跑越欠（实测 6100+）；配额得跟着积压走
 * result: refineQuota() 给「跑不跑 / 这次多少条 / 为什么跳过」；调用方只管执行，判断可测
 * audience: 维护脚本、面板、维护者
 * owner: 框架；谷时、单轮预算、日预算三道闸不许去掉
 * mutable: 可改（上限只许收紧：limit 不得高于 240、日预算不得高于 2 元）
 * usage: refineQuota({ pending, todayCost, dailyBudget, lastRunMs, now, peak })
 */
// 改｜2026-11-11 19:3x｜大鱼·本班｜授权：主人（2026-11-11：「以前不是有自动提炼吗……其他的做」）｜lib/refine-quota.js:1-70｜新增：精提炼配额（积压越大越多、冷却 3/6 小时、日预算封顶），纯函数可测｜为什么：固定 40 条/6 小时追不上每天 300~700 条的新增，越跑越欠（6100+）｜验证：node scripts/test-refine-quota.mjs 6/6；check-trace 全绿｜可改：可改；上限 240、日预算 2 元是硬顶
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 2026-11-11 老板：「以前不是有自动提炼吗」——有，一直有（maintenance 每小时跑、有积压就调 refine.mjs）。
// 但它每次只挑 40 条、6 小时冷却：一天最多 160 条；而粗提炼每天新增 300~700 条。
// 所以问题不是"没自动"，是"自动得太小气"——按积压给配额，同时把一天的预算钉死。
export const MIN_LIMIT = 40
export const MAX_LIMIT = 240
export const PER_PENDING = 8
export const COOLDOWN_NORMAL_MS = 6 * 3600 * 1000
export const COOLDOWN_BACKLOG_MS = 3 * 3600 * 1000
export const BACKLOG_LINE = 3000
export const DEFAULT_DAILY_BUDGET = 1.5

/**
 * 这一轮要不要跑、跑多少。
 * @param {{pending?:number, todayCost?:number, dailyBudget?:number, lastRunMs?:number, now?:number, peak?:boolean}} opts
 * @returns {{run:boolean, reason:string, limit:number, cooldownMs:number}}
 */
export function refineQuota({ pending = 0, todayCost = 0, dailyBudget = DEFAULT_DAILY_BUDGET, lastRunMs = 0, now = Date.now(), peak = false } = {}) {
  const p = Math.max(0, Number(pending) || 0)
  const cost = Math.max(0, Number(todayCost) || 0)
  const budget = Number.isFinite(Number(dailyBudget)) ? Math.max(0, Number(dailyBudget)) : DEFAULT_DAILY_BUDGET
  const cooldownMs = p > BACKLOG_LINE ? COOLDOWN_BACKLOG_MS : COOLDOWN_NORMAL_MS
  const limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.floor(p / PER_PENDING)))
  if (peak) return { run: false, reason: 'skipped-peak', limit: 0, cooldownMs }
  if (p <= 0) return { run: false, reason: 'skipped-no-pending', limit: 0, cooldownMs }
  if (cost >= budget) return { run: false, reason: 'skipped-budget', limit: 0, cooldownMs }
  const last = Number(lastRunMs) || 0
  if (last > 0 && now - last < cooldownMs) return { run: false, reason: 'not-due', limit: 0, cooldownMs }
  return { run: true, reason: 'due', limit, cooldownMs }
}
