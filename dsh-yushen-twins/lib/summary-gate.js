// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-summary-gate
 * kind: module
 * summary: 总结核对闸门：拿 checkSummary 的结果决定「要不要为这份总结唤醒一次」，只判断，不改总结、不发消息。
 * tags: 总结, 核对, 闸门, 唤醒, 去重, 只读
 * created: 2026-11-15 22:26:00
 * changed: 2026-11-15 22:26:00
 * author: 大鱼·子会话（总结核对闸门任务）
 * authority: 老板（2026-11-15：只做闸门；不自动改总结、不直接发消息）
 * audience: 以后接唤醒/心跳的那一层；复盘脚本
 * owner: 框架；**只返回判断**——不写文件、不改总结、不发消息、不调模型
 * mutable: 可改阈值默认值与 reason 措辞；返回字段（check/wake/reason/dedupeKey）别乱动
 * usage: checkAndGate(summary, sources, { now, seen = [], minHard = 1 }) → { check, wake, reason, dedupeKey, counts }
 * why: 核对器只报差异，没人拿它决定「这次值不值得叫醒」；也没有去重，同一份总结会被反复叫
 * result: 一个布尔判断 + 一句人话原因 + 去重键；差异清单原样带在 check 里
 * defaults: minHard=1（一条硬项就够）；seen=[]（不传就不去重）
 * off: 没有谁调用它就等于关着；它不挂定时器、不注册工具、不落盘
 */
//
// 一句话：**闸门只回答「要不要叫」**，不回答「总结哪错了」（那是 checkSummary 的事）。
//
// 规则（改之前先看，别偷偷放宽）：
//   · 硬项 = missing + unsupported + contradict 的**条数**（不是类数）。
//   · 硬项 >= minHard 才可能 wake；needs_model（拿不准的）只记录，**不单独唤醒**——
//     本地拿不准就交给人/模型，不能靠猜去吵醒谁。
//   · 没给原文（stats.sourceItems === 0）一律 wake=false：核不了 ≠ 通过，但也不该拿"没核"去叫人。
//   · 总结为空：wake=false（没什么可核的）。
//   · 同一个 summaryHash 已出现在 seen 里：wake=false（reason 写明重复）。
//   · 只有到了"本来该 wake"的时候才查 seen；干净的总结不会被记成"重复已唤醒"。
//
// dedupeKey 就是 check.summaryHash（16 位十六进制）。调用方在**真的叫过人之后**把它塞进
// seen（数组 / Set / [{dedupeKey}] 都认），本模块自己不落盘、不记状态。
//
// 已知边界：
//   · 只按 summaryHash 去重：总结一字不改、原文换了、硬项变了，也不会再叫——调用方要重叫就自己别传这条 seen。
//   · 不判重要性/紧急度：一条 unsupported 的人名和一条 contradict 的"计划当完成"权重一样。
//   · 不跨进程：seen 由调用方保管，多进程共享要去上层做。

import { checkSummary } from './summary-check.js'

/** seen 里认：字符串 / 数字 / Set / [{dedupeKey|summaryHash|key|hash}]。 */
function seenHas(seen, key) {
  if (!seen) return false
  if (seen instanceof Set) return seen.has(key)
  const list = Array.isArray(seen) ? seen : [seen]
  for (const raw of list) {
    if (raw == null) continue
    if (typeof raw === 'string' || typeof raw === 'number') {
      if (String(raw) === key) return true
      continue
    }
    if (typeof raw === 'object') {
      const k = raw.dedupeKey || raw.summaryHash || raw.key || raw.hash
      if (k && String(k) === key) return true
    }
  }
  return false
}

const lenOf = (v) => (Array.isArray(v) ? v.length : 0)

/**
 * 核对一份总结，然后判断要不要为它唤醒一次。**只读、只判断**。
 * @param {string|{text?:string,summary?:string}} summary 总结（原样交给 checkSummary，不会被改）
 * @param {Array|string|object} sources 原文（同 checkSummary；没给 = 核不了）
 * @param {{now?:string|number|Date, seen?:Array|Set, minHard?:number}} [options]
 * @returns {{check:object, wake:boolean, reason:string, dedupeKey:string, counts:object}}
 */
export function checkAndGate(summary, sources, options = {}) {
  const opts = options || {}
  const check = checkSummary(summary, sources, { now: opts.now })

  const counts = {
    missing: lenOf(check.missing),
    unsupported: lenOf(check.unsupported),
    contradict: lenOf(check.contradict),
    needs_model: lenOf(check.needs_model),
  }
  const hard = counts.missing + counts.unsupported + counts.contradict

  // minHard 是"至少几条硬项"：0 及以下等于"什么都叫"，是个坑，压回 1。
  const rawMin = Number(opts.minHard)
  const minHard = Number.isFinite(rawMin) && rawMin > 0 ? Math.floor(rawMin) : 1

  const dedupeKey = String(check.summaryHash || '')
  const out = (wake, reason) => ({ check, wake, reason, dedupeKey, counts })

  // ① 空总结：没什么可核的
  if (check.note === '总结为空，不做核对' || !check.stats || check.stats.summarySentences === 0) {
    return out(false, '总结为空，没什么可核的')
  }

  // ② 没给原文：核不了 ≠ 通过，但也不拿"没核"去叫人
  if (check.note === '没给原文' || !check.stats.sourceItems) {
    return out(false, '没给原文：核不了（≠ 通过），不唤醒；needs_model 只记录')
  }

  // ③ 硬项没到线（needs_model 不单独唤醒）
  if (hard < minHard) {
    const tail = counts.needs_model
      ? `；另有 ${counts.needs_model} 条 needs_model（拿不准，只记录、不单独唤醒）`
      : ''
    return out(false, `硬项 ${hard} 条 < minHard ${minHard}，没到唤醒线${tail}`)
  }

  // ④ 同一份总结已经叫过
  if (seenHas(opts.seen, dedupeKey)) {
    return out(false, `同一个 summaryHash 已经唤醒过（${dedupeKey}），不重复唤醒`)
  }

  return out(
    true,
    `硬项 ${hard} 条到线（missing ${counts.missing} / unsupported ${counts.unsupported} / contradict ${counts.contradict}，minHard ${minHard}）` +
      (counts.needs_model ? `；另有 ${counts.needs_model} 条 needs_model` : ''),
  )
}
