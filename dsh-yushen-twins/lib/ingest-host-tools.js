/* 标签
 * id: lib-ingest-host-tools
 * kind: module
 * summary: 经历层第四条来源：宿主内置工具按轮汇总（一轮一行），细节回原文查。
 * audience: 框架（宿主工具）、她（翻自己干过什么）
 * owner: 框架；按轮不按条的口径别改
 * mutable: 可改（只加异常阈值）
 * defaults: 跳过 yushen_/dayu_/m1_ 前缀（她自己那套另有记录）
 * usage: attachHostTools 挂 turn/end 收口；createHostToolRecorder 造记录器；ABNORMAL_MS 判"这轮偏慢"
 * off: 不 attach 就不记；SKIP_PREFIXES 可以调
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 22:50｜大鱼·子会话（工作台）｜授权：主人（本次任务书：宿主工具按「轮」汇总成一条经历，A 方案）｜lib/ingest-host-tools.js:1-254｜新增：createHostToolRecorder / attachHostTools（订阅 session/event 的 tool/call+tool/result，按 sessionId+turn 在内存里攒「用了哪些工具、各几次、成败、总耗时」，turn/end 时收口写成 手抄本/经历 的一行；插件自己的工具 yushen_/dayu_/m1_ 跳过）｜为什么：read/write/edit/pwsh/web_fetch/subagent 这些宿主内置工具不走 registerTool，ingest-actions 的 instrumentTool 包不到它们，经历层等于漏掉了今天 4484 次调用的大头；按条记一天 4000 多行会灌爆，所以一轮一条（实测约 15 次调用/轮 → 约 300 行/天）｜验证：node --check lib/ingest-host-tools.js；node scripts/test-ingest-host-tools.mjs 6/6；回放真会话日志 69 次调用的一轮 → 1 行；node scripts/regression.mjs 通过 222 失败 0｜可改：可改（聚合 key = sessionId|turn 与「插件工具前缀跳过」这两条别动；要加字段只加不删）
//
// 经历层第四条来源：宿主内置工具（按轮汇总）。
//
// 为什么按「轮」而不是按「条」：
//   今天这类调用约 4258 次/天。按条记 = 一天 4258 行，手抄本当天就被工具流水灌满，
//   而「今天她调了 4000 次工具」这件事本身没有信息量——有信息量的是「这一轮她干了什么、成没成、多久」。
//   所以：一轮最多一行；细节回原文查（ref 指回 session:<id>:turn:<n>）。
//
// 收口时机（任务书给的三选一）：**② turn/end**。
//   确认过：宿主真的会发 turn/start / turn/end（见 dev 记录与 ~/.dsh/sessions 的会话日志），
//   且本插件根入口 index.js:186 早就在同一个事件总线里处理 turn/end 了——这条路是通的。
//   选它的理由：①「下一轮第一个 tool/call」在「最后一轮」永远等不到收口，得靠定时器兜底；
//   ③ 定时器要么拖长延迟、要么多一个不停跑的 timer，进程退出时还会丢掉整段；turn/end 是
//   宿主自己说「这轮完了」，最准、零延迟、零定时器。漏收口的兜底也留了（见 flushOlder）：
//   下一轮的 turn/start 或第一条 tool/call 到来时，把上一条没收口的轮先写掉。
//
// 进程退出会丢什么：只丢**正在跑的那一轮**（它还没 turn/end）。已经在 turn/end 收口过的都在盘上。
// 这一点是有意接受的：为一条「一轮汇总」去加 exit 钩子，等于在宿主进程上挂副作用，不值。
//
// 三条不许：
//   ① 不许抛（写不进去只 log，绝不挡对话）；
//   ② 不许重复记（插件自己的工具由 ingest-actions 记，这里按前缀跳过）；
//   ③ 不许空写（一轮 0 次工具调用 → 不写）。
import { clip, sha, stamp, writeRows } from './ingest-store.js'
import { channelOfCwd } from './ingest-actions.js'
import { keywords } from './library-chain.js'
import { roleForSession, ROLE_NAME } from './role-of.js'

export const LAYER = '经历'
// 超过这个耗时算「异常轮」（进手抄本），其余只进待提炼
export const ABNORMAL_MS = Number(process.env.YUSHEN_ABNORMAL_MS ?? 120000)
/** 这些前缀是插件自己的工具：已由 lib/ingest-actions.js 的 instrumentTool 记过，再记一次就是两条。 */
export const SKIP_PREFIXES = Object.freeze(['yushen_', 'dayu_', 'm1_'])
export const isPluginTool = (name = '') => SKIP_PREFIXES.some((p) => String(name).startsWith(p))

const MAX_TURNS_PER_SESSION = 8 // 只防漏收口时内存无限长；正常情况下 turn/end 就清掉了
const HEAD_MAX = 60

/** 事件时间：宿主给的 ms 优先（和 tool/call 的时间同源，算耗时才不飘），否则用本地钟。 */
const timeOf = (event, now) => {
  const t = Number(event?.time)
  return Number.isFinite(t) && t > 0 ? t : now().getTime()
}

/** 事件体：宿主给的是 data（会话日志里也是 data）；有的版本叫 detail，两个都认。 */
const bodyOf = (event) => {
  const d = event?.data ?? event?.detail
  return d && typeof d === 'object' ? d : null
}

/** 一轮的标题行：第12轮：pwsh×3、write×2、read×5，全成，42.0s */
function headOf({ turn, tools, failTotal, durationMs }) {
  const tail = `${failTotal ? `失败${failTotal}次` : '全成'}，${(Math.max(0, durationMs) / 1000).toFixed(1)}s`
  const prefix = `第${turn}轮：`
  let names = ''
  for (const t of tools) {
    const piece = `${names ? '、' : ''}${t.name}×${t.count}`
    if ((prefix + names + piece + '，' + tail).length > HEAD_MAX) break
    names += piece
  }
  return clip(names ? `${prefix}${names}，${tail}` : `${prefix}${tail}`, HEAD_MAX)
}

/**
 * 造一个「按轮汇总」的记录器。
 * 返回 { handle(session, event), flush(sessionId, turn), pending(), reset() }。
 * 全同步、全本地：不读网络、不调模型、不写日志文件以外的任何东西。
 */
export function createHostToolRecorder({ log = () => {}, now = () => new Date() } = {}) {
  /** sessionId → Map<turn, bucket>；桶里 tools: Map<name,{name,count,ok,fail,ms}> */
  const sessions = new Map()

  const statOf = (bucket, name) => {
    let st = bucket.tools.get(name)
    if (!st) { st = { name, count: 0, ok: 0, fail: 0, ms: 0 }; bucket.tools.set(name, st) }
    return st
  }

  const bucketOf = (sid, turn) => {
    let m = sessions.get(sid)
    if (!m) { m = new Map(); sessions.set(sid, m) }
    let b = m.get(turn)
    if (!b) {
      b = { turn, tools: new Map(), calls: new Map(), seen: new Set(), startedAt: 0, endedAt: 0, cwd: '' }
      m.set(turn, b)
      // 漏收口堆到这里说明有轮次从来没 turn/end；把最老的写掉，别让内存和「一轮一条」一起失守。
      while (m.size > MAX_TURNS_PER_SESSION) {
        const oldest = [...m.keys()].sort((a, c) => a - c)[0]
        flush(sid, oldest)
        if (m.has(oldest)) m.delete(oldest) // flush 已经写掉并删了；万一没删，这里强删，绝不死循环
      }
    }
    return b
  }

  /** 把这一轮写掉（先摘出内存再写：写失败也不会重复写、也不会卡住调用方）。 */
  function flush(sid, turn, atMs = 0) {
    const m = sessions.get(sid)
    const b = m?.get(turn)
    if (!b) return null
    m.delete(turn)
    if (!m.size) sessions.delete(sid)
    try {
      return writeTurn({ sid, bucket: b, atMs: atMs || b.endedAt || now().getTime() })
    } catch (e) {
      try { log(`经历层没记上（会话 ${String(sid).slice(0, 8)} 第 ${turn} 轮）：${clip(e?.message || e, 120)}`) } catch { /* 日志都写不了就算了 */ }
      return null
    }
  }

  /** 把同一会话里所有「比当前轮更早、还没收口」的轮先写掉（漏了 turn/end 的兜底）。 */
  function flushOlder(sid, turn) {
    const m = sessions.get(sid)
    if (!m) return
    for (const t of [...m.keys()].sort((a, b) => a - b)) {
      if (t >= turn) break
      flush(sid, t)
    }
  }

  function writeTurn({ sid, bucket, atMs }) {
    // 调了却没等到结果的（被打断 / 进程退出前的最后一条）：算一次失败，不计耗时——不编一个假时长。
    for (const c of bucket.calls.values()) statOf(bucket, c.name).fail += 1
    bucket.calls.clear()

    let total = 0
    let failTotal = 0
    for (const st of bucket.tools.values()) { total += st.count; failTotal += st.fail }
    // 一轮 0 次工具调用 → 不写（这条不是「漏了」，是本来就没有可记的）。
    if (!total) return { ok: true, wrote: false, reason: '这一轮没调宿主工具' }

    const { at, day } = stamp(new Date(Math.max(0, Math.round(Number(atMs) || 0))))
    const durationMs = Math.max(0, Math.round(Number(atMs) || 0) - (Number(bucket.startedAt) || Number(atMs) || 0))
    const tools = [...bucket.tools.values()]
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((t) => ({ name: t.name, count: t.count, ok: t.ok, fail: t.fail, ms: Math.max(0, Math.round(t.ms)) }))

    const role = roleForSession(sid)
    const row = {
      id: 'h-' + sha(`${sid}|${bucket.turn}`),
      kind: LAYER,
      layer: LAYER,
      type: 'turn',
      at,
      day,
      channel: channelOfCwd(bucket.cwd),
      role,
      why: '这一轮的工具流水（干了什么、成没成、多久）',
      who: ROLE_NAME[role] || '她',
      turn: bucket.turn,
      // 2026-11-03：以前这里 slice(0,8) → "session-"，跟任何一张单都对不上号，
      // 手抄本 2,523 条 role 只能标 unknown。这里改成存全 id。
      session: String(sid || ''),
      head: headOf({ turn: bucket.turn, tools, failTotal, durationMs }),
      keywords: keywords(tools.map((t) => t.name).join(' ')),
      tags: [LAYER, '宿主工具'],
      tools,
      ok: failTotal === 0,
      durationMs,
      ref: `session:${sid}:turn:${bucket.turn}`,
      sourceLevel: '她做的',
      confidence: '确定',
      coarse: true,
    }
    // 2026-11-15：新数据统一进中层（手抄本 state=queued），不再写旧「待提炼」指针；
    // 普通轮也归档，避免只靠旧队列才看得见。
    const abnormal = failTotal > 0 || durationMs >= ABNORMAL_MS
    const w = writeRows({ layer: LAYER, day, rows: [row], pending: false, archive: true })
    if (!w?.ok) {
      try { log(`经历层没记上 ${row.id}（第 ${row.turn} 轮）：${clip(w?.err || w?.reason || '写不进去', 120)}`) } catch { /* 忽略 */ }
      return { ok: false, wrote: false, id: row.id, row, reason: w?.err || '写不进去' }
    }
    return { ok: true, wrote: w.added > 0, id: row.id, row, day, added: w.added, abnormal }
  }

  /** 宿主事件入口：只认四种，别的直接过。任何异常都吞掉。 */
  function handle(session, event) {
    try {
      const type = String(event?.type || '')
      if (type !== 'turn/start' && type !== 'turn/end' && type !== 'tool/call' && type !== 'tool/result') return
      const data = bodyOf(event)
      if (!data) return
      const sid = String(session?.header?.id ?? session?.id ?? '')
      const turn = Number(data.turn)
      if (!sid || !Number.isInteger(turn) || turn < 0) return
      const cwd = String(session?.meta?.cwd ?? session?.header?.cwd ?? data?.meta?.cwd ?? '')

      if (type === 'turn/start') {
        flushOlder(sid, turn) // 上一轮要是没收到 turn/end，这里补收口
        return
      }
      if (type === 'tool/call') {
        flushOlder(sid, turn)
        const name = clip(data.name || data.toolName, 40)
        if (!name || isPluginTool(name)) return // 插件自己的工具：ingest-actions 记，这里不重复
        const b = bucketOf(sid, turn)
        if (cwd) b.cwd = cwd
        const t = timeOf(event, now)
        if (!b.startedAt || t < b.startedAt) b.startedAt = t
        const callId = String(data.callId || data.id || '')
        // 同一条 tool/call 被送两次（订阅重入/重放）时只算一次：一轮一条的前提是计数不翻倍。
        if (callId) {
          if (b.seen.has(callId)) return
          b.seen.add(callId)
        }
        statOf(b, name).count += 1
        if (callId) b.calls.set(callId, { name, t0: t })
        return
      }
      if (type === 'tool/result') {
        const m = sessions.get(sid)
        const b = m?.get(turn)
        if (!b) return // 这一轮已经收口了（或根本没调工具）——迟到/多余的 result 不补记
        if (cwd) b.cwd = cwd
        const callId = String(data.message?.toolCallId || data.toolCallId || data.message?.source?.callId || '')
        const c = callId ? b.calls.get(callId) : null
        if (!c) return // 插件工具的结果、或配不上对的：不记
        b.calls.delete(callId)
        const st = statOf(b, c.name)
        const bad = data.message?.isError === true || data.isError === true || Boolean(data.error)
        if (bad) st.fail += 1
        else st.ok += 1
        const t = timeOf(event, now)
        if (Number.isFinite(c.t0)) st.ms += Math.max(0, t - c.t0)
        return
      }
      // turn/end：收口——这一轮最多一条
      const m = sessions.get(sid)
      const b = m?.get(turn)
      if (!b) return
      b.endedAt = timeOf(event, now)
      if (cwd) b.cwd = cwd
      flush(sid, turn, b.endedAt)
    } catch { /* 记录失败不挡对话 */ }
  }

  return {
    handle,
    flush,
    pending: () => [...sessions.entries()].map(([sid, m]) => ({ session: sid, turns: [...m.keys()] })),
    reset: () => sessions.clear(),
  }
}

/**
 * 把记录器挂到宿主的会话事件总线上。
 * 只注册一次；注册本身失败只 log，不影响插件别的分支。
 * global: true —— 和 dayu/index.js 现有那条 session/event 订阅一个口径：所有会话都要看。
 */
export function attachHostTools(ctx, { log = () => {} } = {}) {
  if (!ctx || typeof ctx.on !== 'function') return null
  const recorder = createHostToolRecorder({ log })
  const register = () => ctx.on('session/event', (session, event) => { recorder.handle(session, event) }, { global: true })
  try {
    if (typeof ctx.effect === 'function') ctx.effect(register)
    else register()
  } catch (e) {
    try { log(`宿主工具经历层没挂上：${clip(e?.message || e, 120)}`) } catch { /* 忽略 */ }
    return null
  }
  return recorder
}
