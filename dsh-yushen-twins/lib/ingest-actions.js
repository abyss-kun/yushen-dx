/* 标签
 * id: lib-ingest-actions
 * kind: module
 * summary: 经历层：她做过什么（工具调用、成没成、多久）；同一工具同入参同结果只留一行。
 * audience: 框架（工具流水）、她（翻自己干过什么）
 * owner: 框架；去重 key 别改
 * mutable: 可改（只加来源；不许把工具结果整段写进去）
 * defaults: 去重 key = sha1(工具|入参摘要|结果摘要)；id 不带日期
 * usage: instrumentTool 挂到工具上；ingestAction 写一条；contextOf/channelOfCwd 补上下文
 * off: 不挂 instrumentTool 就不记；宿主工具那条另有关闭点
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 22:40｜大鱼·子会话（工作台）｜授权：主人（本次任务书：她干过的活要进经历层）｜lib/ingest-actions.js:1-150｜新增：ingestAction（工具调用 → 手抄本/经历 + 待提炼指针，去重 key=sha1(tool|args摘要|结果摘要)）与 instrumentTool（插件里所有 registerTool 的唯一入口，执行完顺手记一条；失败只回调 log，不挡主流程）｜为什么：以前只有 worklog.jsonl 的一行摘要和 runtime/<role>/tools/tools.jsonl 的分发器流水，工具调用本身没有「做了什么、成没成、花了多久」的完整一行，经历层等于空的｜验证：node --check lib/ingest-actions.js；node scripts/test-ingest-actions.mjs（真执行一个假工具，断言手抄本那一行的 kind/tool/ref/去重/失败也记）；node scripts/regression.mjs 不新增红｜可改：可改（去重 key 的三段口径别动；要加字段只加不删）
//
// 经历层：她「做过什么」，不是「说过什么」。
//
// 为什么单独一层：对话进手抄本只记得她说了什么；她跑过哪些工具、成没成、多久，
// 以前只散在 worklog（人手写摘要）和分发器流水里，对不上号。
//
// 去重 key（任务书定的）：sha1(tool | args摘要 | 结果摘要)。
//   · 摘要走浅层短串（见 ingest-store.summarize），不深序列化几十万字的工具结果；
//   · 同一轮里同一个工具同样的入参同样的结果，只留一行（重试、预览、双重调用都不刷屏）；
//   · id 不带日期：跨天各写各的那一天，当天的重复才算重复。
import { clip, layerFileOf, sha, stamp, summarize, writeRows } from './ingest-store.js'
import { keywords } from './library-chain.js'
import { roleForSession, ROLE_NAME } from './role-of.js'

export const LAYER = '经历'

/**
 * 记一条工具调用。
 * 返回 { ok, id, file, added }；任何异常都吞掉（她的主流程比这条记录重要）。
 */
export function ingestAction({ who = '她', at, tool, args, result, ok = true, durationMs = 0, session = '', channel = '' } = {}) {
  try {
    const name = clip(tool, 60)
    if (!name) return { ok: false, reason: '没有工具名' }
    const argsSum = summarize(args)
    const resultSum = summarize(result)
    const { at: iso, day } = stamp(at)
    const id = 'a-' + sha(`${name}|${argsSum}|${resultSum}`)
    const sessionId = clip(session, 80)
    // 2026-11-03 老板：标签要齐——谁记的、为什么。以前这里既没 role 也没 why，
    // 手抄本里 2,523 条只能标 unknown。会话能翻出角色就写角色，翻不出就空着（不猜）。
    const role = roleForSession(sessionId)
    const row = {
      id,
      kind: LAYER,
      layer: LAYER,
      role,
      why: '她调了工具（干活流水）',
      event: false,
      type: 'action',
      at: iso,
      day,
      channel: clip(channel, 20) || '本机',
      who: clip(who, 12) || ROLE_NAME[role] || '她',
      tool: name,
      // 2026-11-02 23:35 主人改口径：手抄本不存原文全文，只留 head + 关键词 + 标签 + ref。
      // 这里 args/result 是**浅层摘要**（summarize 出来的短串，不是工具入参/输出的全文），
      // 去重 key 也要它们，所以留着；正文一个字都不抄。
      args: argsSum,
      result: resultSum,
      ok: ok !== false,
      durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
      session: sessionId,
      // 出处：有会话就指回会话（她说/做的那一轮），没有就指向工具本身，不编假路径。
      ref: sessionId ? `session:${sessionId}` : `tool:${name}`,
      head: clip(`${name} ${argsSum}`, 60),
      keywords: keywords(`${name} ${argsSum} ${resultSum}`),
      tags: [LAYER, name],
      sourceLevel: '她做的',
      importance: '普通',
      confidence: '确定',
      coarse: true,
      chars: argsSum.length + resultSum.length,
    }
    const w = writeRows({ layer: LAYER, day, rows: [row] })
    return { ...w, id, day, row }
  } catch (e) {
    return { ok: false, reason: clip(e?.message || e, 120) }
  }
}

/** 从宿主给的 exec 里取会话 id 和工作目录（拿不到就空串，不抛）。 */
export function contextOf(exec) {
  try {
    const session = exec?.agent?.session
    const id = String(session?.header?.id || session?.id || '')
    const cwd = String(session?.meta?.cwd ?? session?.header?.cwd ?? '')
    return { session: id, cwd }
  } catch {
    return { session: '', cwd: '' }
  }
}

/** 工作目录 → 通道（和 live-transcript 的 placeOf 一个口径，只认能认出来的）。 */
export function channelOfCwd(cwd) {
  const s = String(cwd || '')
  if (/qq-bridge/i.test(s)) return 'QQ'
  if (/bili/i.test(s)) return 'B站'
  if (/mobile|手机/i.test(s)) return '手机'
  return '本机'
}

/**
 * 把工具定义包一层：执行完（成功/失败都算）记一条经历。
 * 原地改 def.execute，返回同一个 def——index.js 的 registerTool 只调这一下。
 *
 * 三件事不许做：
 *   ① 不许改返回值、不许吞异常（try 里原样 return，catch 里原样 throw）；
 *   ② 记不下来只回调 log，不影响调用方；
 *   ③ 分发器 yushen_tools 自己不记——它只是转手，再记一条会把同一次调用记成两条。
 */
export function instrumentTool(def, { log = () => {}, skip = new Set(['yushen_tools']) } = {}) {
  if (!def?.name || typeof def.execute !== 'function' || def.__ingested) return def
  const original = def.execute
  const name = String(def.name)
  def.execute = async function executeWithIngest(args, exec) {
    const t0 = Date.now()
    let ok = true
    let result
    try {
      result = await original.call(this, args, exec)
      return result
    } catch (e) {
      ok = false
      result = e
      throw e
    } finally {
      if (!skip.has(name)) {
        try {
          const { session, cwd } = contextOf(exec)
          const res = ingestAction({
            who: '她',
            at: new Date(),
            tool: name,
            args,
            result,
            ok,
            durationMs: Date.now() - t0,
            session,
            channel: channelOfCwd(cwd),
          })
          // 写不进去也要留一行日志：不然「经历层是空的」和「这条没记上」看起来一样。
          if (!res?.ok) log(`经历层没记上 ${name}：${String(res?.reason || res?.err || '未知')}`)
        } catch (e) {
          try { log(`经历层没记上 ${name}：${String(e?.message || e).slice(0, 120)}`) } catch { /* 日志都写不了就算了 */ }
        }
      }
    }
  }
  def.__ingested = true
  return def
}
