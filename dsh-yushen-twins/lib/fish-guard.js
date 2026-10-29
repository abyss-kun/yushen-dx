// 鱼群保护：同一个群里装了好几只"鱼"时，别集体刷屏。
//
// 来源：读 SurfCore 的 src/fish-guard.js 之后抄的思路（2026-10-28）。
// 它解决的是一个很实际的问题——同一个人装了多个同类插件、或者好几个朋友都装了，
// 群里就会变成一串 bot 互相接话，人类插不上嘴。
//
// 规矩是边界不是路线（§4.6 越线权）：这里只回答"这一轮先别说话"，不替她判断该说什么。
// 被 @ / 被引用 / 老板点名 → 一律放行（那是明确的对话，不算刷屏）。
export const DEFAULT_FISH_GUARD = Object.freeze({
  enabled: true,
  windowMs: 10 * 60 * 1000,
  maxFish: 5,           // 窗口内不同"鱼"发送者 ≥ 5 → 让位
  maxConsecutiveFish: 5, // 连续 5 条都是鱼 → 让位
  ratioMinCount: 8,      // 补充规则：鱼消息 ≥ 8 条…
  ratioMinRatio: 0.6,    // …且占比 ≥ 60% → 让位
})

const FISH_NAME = /(肥鱼|助手|fish)/i

/** 这条消息算不算"鱼"发的（按名字判断；桥那边给 sender 名字）。 */
export function looksLikeFish(msg) {
  if (!msg || msg.isSelf) return false
  const name = String(msg.sender || msg.name || msg.nickname || '')
  return FISH_NAME.test(name)
}

/**
 * 判断这一轮该不该参与。
 * @param {Array} messages 最近消息（带 sender / isSelf / time）
 * @param {{now?:number, config?:object, addressed?:boolean}} opts addressed=被@/被引用/点名
 * @returns {{allow:boolean, reason:string, stats:object}}
 */
export function judgeFishChat(messages = [], { now = Date.now(), config = {}, addressed = false } = {}) {
  const cfg = { ...DEFAULT_FISH_GUARD, ...(config || {}) }
  const list = (Array.isArray(messages) ? messages : []).filter((m) => m && typeof m === 'object')
  const win = list.filter((m) => {
    const t = Number(m.time) || Date.parse(String(m.at || '')) || 0
    return t && now - t <= cfg.windowMs
  })
  const stats = {
    window: win.length,
    fishSenders: new Set(win.filter(looksLikeFish).map((m) => String(m.sender || m.name || ''))).size,
    fishCount: win.filter(looksLikeFish).length,
    ratio: win.length ? Number((win.filter(looksLikeFish).length / win.length).toFixed(2)) : 0,
    consecutiveFish: 0,
  }
  // 从最后往前数：连续多少条都是鱼（碰到真人或她自己就断）
  for (let i = win.length - 1; i >= 0; i -= 1) {
    if (looksLikeFish(win[i])) stats.consecutiveFish += 1
    else break
  }
  if (!cfg.enabled) return { allow: true, reason: '鱼群保护关着', stats }
  if (addressed) return { allow: true, reason: '有人在跟她说（@ / 引用 / 点名），放行', stats }
  if (stats.fishSenders >= cfg.maxFish) return { allow: false, reason: `窗口内已经有 ${stats.fishSenders} 只鱼在说（阈值 ${cfg.maxFish}）`, stats }
  if (stats.consecutiveFish >= cfg.maxConsecutiveFish) return { allow: false, reason: `最近连续 ${stats.consecutiveFish} 条都是鱼在说（阈值 ${cfg.maxConsecutiveFish}）`, stats }
  if (stats.fishCount >= cfg.ratioMinCount && stats.ratio >= cfg.ratioMinRatio) {
    return { allow: false, reason: `窗口内 ${stats.fishCount} 条鱼、占比 ${Math.round(stats.ratio * 100)}%（阈值 ${cfg.ratioMinCount} / ${Math.round(cfg.ratioMinRatio * 100)}%）`, stats }
  }
  return { allow: true, reason: '不算刷屏', stats }
}
