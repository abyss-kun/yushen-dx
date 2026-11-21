/* 标签
 * id: lib-borrow
 * kind: module
 * summary: 借阅账——"她去图书馆查了书"才算借；每轮摊在桌上的注入不算。给醒来那段报"最近借了几本、几本用上了"。
 * tags: 图书馆, 借阅, 检索, 醒来段, 度量
 * created: 2026-11-11 01:05:00
 * changed: 2026-11-11 19:28:39
 * author: 大鱼·子代理（闭环 P3+P4）
 * authority: 主人（2026-11-11：「注入不算借阅，检索才算」+「醒来要能看见借了几本」）
 * why: 以前只有"检索日志"这一份原始记录，没人把它叫成借阅，也没人回答"她最近真的去查了没有、查到的东西用上了没有"
 * result: borrowStats(role) 出数（几次/几本/用上几条）；noteUsed 回填 used；**只读，不改检索日志的写入格式**
 * mutable: 可改（借阅口径别放宽：注入不算借、只有 recall-log 里的检索才算）
 * audience: 她（醒来那段）、面板、新装的角色
 * owner: 框架；口径（什么算借阅）要老板点头才能改
 * usage: borrowStats(role,{sinceMs}) → {count,used,hits,lastAt}；noteUsed(role,{query,usedBy})
 * off: 不接进醒来段就等于不用它（数据仍在 recall-log 里，随时能查）
 */
// 改｜2026-11-11 01:10｜大鱼·子代理（闭环收口）｜授权：主人（2026-11-11 闭环任务：心跳下沉 / 借阅账 / 说明格式）｜lib/borrow.js:1-90｜补记：逻辑改动随 c0aee4e 提交，内容见文件头 changed 与标签块；本班只补留痕、未改逻辑｜为什么：改了逻辑却没贴「改」行，check-trace 一直红，全量回归卡在最后一步｜验证：node scripts/check-trace.mjs 退出 0（补后复跑）；随后跑 scripts/regression.mjs 确认全绿｜可改：可改
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// 为什么要有这个文件（2026-11-11 老板定的口径）：
//   · 每轮被注入 3 条记忆，那不是"她去借书"，是"书摊在桌上"——**不能算借阅**；
//   · 只有她真的去查（`yushen_memory` 那条路 / 脚本 recall）才算借，记在 recall-log；
//   · 借了有没有用上，由 `used` 字段回答（空 = 还没核对，不等于没用）。
// 所以本模块只做两件事：把 recall-log 读成"借阅统计"、把"用上了"回填进那一行。
import { readRecallLog, markUsed, isUsedFeedback } from './recall-log.js'
// 口径只有一份：isUsedFeedback 在 lib/recall-log.js（2026-11-11 19:4x 挪过去，避免借阅账和检索统计各判各的）。
export { isUsedFeedback }

/** 今天零点（本地；和 soft-limit / freetime 一个口径，不写死 +8）。 */
export function dayStartOf(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** recall-log 的 at 是本地时间字符串 "YYYY-MM-DD HH:mm:ss"，得先换成 ISO 才 parse 得动。 */
function parseAt(v) {
  const t = Date.parse(String(v || '').replace(' ', 'T'))
  return Number.isFinite(t) ? t : 0
}

/**
 * 借阅统计（只读）。
 * @param {string} role
 * @param {{sinceMs?:number, now?:number}} [opts] sinceMs 不传 = 今天零点
 * @returns {{count:number, used:number, misleading:number, hits:number, lastAt:string, items:Array}}
 */
// 改｜2026-11-11 18:4x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接 §二 图书馆定稿：用一次记一次反馈，默认无关，可标有用/误导）｜lib/borrow.js:57-70｜used 计数改成「真的用上了才算」：'误导/无关/没用/没帮上' 不算，单独出 misleading｜为什么：以前只要 used 有字就算用上——标成「误导」也被算进「N 条用上了」，醒来那段就会报虚的好消息；口径不改，这条数就没法拿来判断检索准不准｜验证：node scripts/test-borrow.mjs 5 条全过（新增「误导不算用上」）；node scripts/regression.mjs 293 通过 / 0 失败｜可改：可改；否定词只许在这里加，别在调用方各自判
// 2026-11-11 19:4x：否定词与判据挪到 lib/recall-log.js（isUsedFeedback），这里只引用，避免两处各判一个口径。
export function borrowStats(role = '', { sinceMs = null, now = Date.now() } = {}) {
  const from = Number.isFinite(Number(sinceMs)) && Number(sinceMs) > 0 ? Number(sinceMs) : dayStartOf(now)
  let rows = []
  try {
    rows = readRecallLog({ limit: 5000 }).filter((r) => {
      const t = parseAt(r?.at)
      if (!Number.isFinite(t) || t < from) return false
      return !role || String(r.who || '') === String(role)
    })
  } catch { rows = [] }
  const used = rows.filter((r) => isUsedFeedback(r?.used)).length
  const misleading = rows.filter((r) => /^误导/.test(String(r?.used || '').trim())).length
  const hits = rows.reduce((a, r) => a + (Number(r.hits) || 0), 0)
  return {
    count: rows.length,
    used,
    misleading,
    hits,
    lastAt: rows.length ? String(rows[rows.length - 1].at || '') : '',
    items: rows.slice(-5),
  }
}

/**
 * 把"这条查到的用上了"回填进 recall-log 那一行（**只加 used 字段，不改别的**）。
 * 定位：最后一条 who + query 对得上的行（query 为空就按 who 找最后一条）。
 * @returns {{ok:boolean, at?:string, reason?:string}}
 */
export function noteUsed(role = '', { query = '', usedBy = '是', now = Date.now() } = {}) {
  let rows = []
  try { rows = readRecallLog({ limit: 5000 }) } catch { return { ok: false, reason: '读不到检索日志' } }
  const q = String(query || '').trim()
  let target = null
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i]
    if (role && String(r.who || '') !== String(role)) continue
    if (q && String(r.query || '').trim() !== q) continue
    target = r
    break
  }
  if (!target?.at) return { ok: false, reason: '没有对得上的那一条' }
  try {
    const r = markUsed({ at: target.at, used: String(usedBy || '是').slice(0, 20) })
    return r?.ok ? { ok: true, at: target.at } : { ok: false, reason: r?.reason || '没写成' }
  } catch (e) { return { ok: false, reason: String(e?.message || e) } }
}
