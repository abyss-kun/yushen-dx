/* 标签
 * id: memory-core-tier
 * kind: module
 * summary: 浅层里的“游”：顶游/上游/中游/下游/不入流；同一张纸只改位置，不搬家。
 * tags: 浅层, 游, 晋升, 降级, 冷档, 单一实现
 * created: 2026-11-13 14:05:00
 * changed: 2026-11-20 00:07:22
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：浅层里分游，顶游必带、上游晋升、旧的往下走）
 * audience: 查询、注入、精提炼、维护
 * owner: 框架；阈值先这样，跑一段再调
 * mutable: 可改；顶游只能手动钉，不能自动进
 * usage: tierOf(row, feedbackRow?) / tierRank(t)
 * why: 之前只有“在用/闭架”两种，没有使用次数和熟练度
 * result: 同一张纸有位置，不复制；新纸中游，常用上游，长期不用往下
 */
export const TIERS = ['顶游', '上游', '中游', '下游', '不入流']

export const TIER_RANK = { 顶游: 0, 上游: 1, 中游: 2, 下游: 3, 不入流: 4 }

export const TIER_LABEL = {
  顶游: '必带',
  上游: '常用',
  中游: '新的/一般',
  下游: '旧',
  不入流: '冷档',
}

export function normalizeTier(t) {
  const s = String(t || '').trim()
  return TIERS.includes(s) ? s : '中游'
}

/**
 * 一张纸现在在哪一游。
 * - pin=true 只能手动钉，直接顶游；
 * - 明确坏结果 → 下游；
 * - 最近用得多/结果好 → 上游；
 * - 90 天不用 → 下游；180 天 → 不入流；
 * - 其余中游。
 */
// 2026-11-19：错题/任务/人物这三类天生该常看——错题怕再犯、任务要跟、人物是关系底稿。
// 不加这层，新卡全挤在「中游」，分级等于没有。
const KIND_PROMOTE = new Set(['错题', '任务', '人物'])

export function tierOf(row = {}, fb = null, now = Date.now()) {
  if (row.pin === true || row.tier === '顶游') return '顶游'
  const good = Number(fb?.good) || 0
  const bad = Number(fb?.bad) || 0
  const used = Number(fb?.used) || 0
  if (bad > 0) return '下游'
  if (KIND_PROMOTE.has(String(row.kind || '').trim())) return '上游'
  // 2026-11-20：被召回 6 次算弱使用上游（经验/知识卡靠“总被想起”往上走）。
  const recall = Number(fb?.recall) || 0
  if (good >= 2 || used >= 3 || recall >= 6) return '上游'
  const at = Date.parse(String(row.lastUsed || row.at || row.createdAt || ''))
  const days = Number.isFinite(at) ? Math.max(0, (now - at) / 86400e3) : 0
  if (days >= 180) return '不入流'
  if (days >= 90) return '下游'
  return '中游'
}

export function tierRank(t) {
  return TIER_RANK[normalizeTier(t)] ?? 2
}
