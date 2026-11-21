/* 标签
 * id: lib-heartbeat-signals
 * kind: module
 * summary: 本地痛觉——把「哪里痛、现在要不要叫」算成结构化的信号；不调模型、不写盘，怎么办留给唤醒后的模型判断。
 * tags: 心跳, 痛觉, 唤醒, 冷却, 合并, 纯函数
 * created: 2026-11-16 20:55:00
 * changed: 2026-11-16 21:34:00
 * author: 大鱼·心跳班
 * authority: 大小鱼（2026-11-16：心跳痛觉信号包只做本地判断）
 * audience: 心跳（freeTimeOnce）、唤醒、以后的面板/复盘
 * owner: 框架；分级建议和冷却口径要大小鱼点头才能改
 * mutable: 可改；判据只增不减；**不许在这里调模型、读文件、写盘**
 * usage: buildPainSignals({waits,agendaDue,loops,summaryPending,failures,ownerAsks,now,quietMs,lastWakeAt}) → {level,signals,shouldWake,coalesce}
 * why: 以前 freeTimeOnce 里四路判断（wait/agenda/loop/summary）各写各的，谁急谁不急没人算；要不要叫也散在各处
 * result: 一遍算出 level 0-3 的信号 + 一个 shouldWake + 一条合并摘要；调用方拿它决定叫不叫，叫醒后模型再判断怎么办
 * off: 不接就没有痛觉——心跳照旧按兜底间隔叫；本模块不装也不影响别的
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
//
// ── 这个文件是「痛觉」，不是「判决」 ───────────────────────────────────
// 它只回答两件事：哪里痛（signals）、现在要不要叫她（shouldWake）。
// 它**不回答**怎么办：补不补、告不告诉老板、要不要先睡一觉——那些等唤醒了、
// 模型看到注入的简报之后自己判断。所以这里不调模型、不生成话术、不替她做决定。
//
// 分级口径（老板 2026-11-16 给的）：
//   3 = 主人直接找 / 不可逆：过了这个点就补不回来，现在就叫，宁可多叫一次
//   2 = 到期 / 未闭合 / 冲突：得她本人定，醒了再看怎么办
//   1 = 分身汇报 / 普通事件：醒着顺手说一句就行
//   0 = 后台动静：不叫她，留着看
//
// 纯函数：不 import 任何东西（没有 fs、没有网络、没有模型），同一输入永远同一输出。
// 冷却/合并窗口不用 here 存状态——由调用方把 quietMs / lastWakeAt 传进来。

export const DEFAULT_QUIET_MS = 30 * 60 * 1000
export const LEVEL_NAMES = Object.freeze(['后台', '普通', '要紧', '不可逆'])

const KIND_LABEL = Object.freeze({
  'owner-direct': '主人直接找',
  'wait-due': '约的时间到了',
  'agenda-due': '自己排的到点了',
  'open-loop': '没闭合的事',
  'summary-pending': '总结核对没对上',
  conflict: '冲突',
  'subagent-report': '分身汇报',
  failure: '失败/报错',
  background: '后台动静',
})

const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
const str = (v, n = 120) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n)
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const flag = (v) => v === true || v === 1 || v === 'true' || v === '1' || v === 'yes'

function refsOf(x = {}) {
  const out = []
  const take = (v) => {
    if (v == null) return
    if (Array.isArray(v)) { v.forEach(take); return }
    const s = str(v, 80)
    if (s && !out.includes(s)) out.push(s)
  }
  take(x.refs)
  take(x.id)
  take(x.dedupeKey)
  take(x.ref)
  take(x.sessionId)
  return out
}

function isOwnerDirect(x = {}) {
  if (flag(x.direct) || flag(x.fromOwner) || flag(x.ownerDirect) || flag(x.ownerAsk)) return true
  const kind = str(x.kind).toLowerCase()
  return ['owner', 'owner-direct', 'owner_direct', '主人', '主人直接找', '老板'].includes(kind)
}

function isIrreversible(x = {}) {
  if (flag(x.irreversible) || flag(x.cannotUndo) || flag(x.fatal)) return true
  const sev = str(x.severity).toLowerCase()
  if (['irreversible', 'fatal', 'critical', '不可逆'].includes(sev)) return true
  return ['irreversible', 'fatal', '不可逆'].includes(str(x.kind).toLowerCase())
}

function isConflict(x = {}) {
  if (flag(x.conflict)) return true
  const sev = str(x.severity).toLowerCase()
  if (['conflict', '冲突'].includes(sev)) return true
  return ['conflict', '冲突'].includes(str(x.kind).toLowerCase())
}

function isBackground(x = {}) {
  if (flag(x.background) || flag(x.quiet)) return true
  const sev = str(x.severity).toLowerCase()
  if (['background', 'debug', '后台'].includes(sev)) return true
  return ['background', '后台'].includes(str(x.kind).toLowerCase())
}

function isReport(x = {}) {
  if (flag(x.report) || flag(x.fromSubagent)) return true
  const sev = str(x.severity).toLowerCase()
  if (['report', '汇报'].includes(sev)) return true
  return ['subagent-report', 'report', '汇报', '分身汇报'].includes(str(x.kind).toLowerCase())
}

/** 一条信号。level 压到 0-3；what 空就用类名兜底（宁可难看，也别空着）。 */
function makeSignal(kind, level, what, refs, reason) {
  const lv = Math.max(0, Math.min(3, Math.round(num(level))))
  return {
    kind,
    level: lv,
    what: str(what, 90) || KIND_LABEL[kind] || kind,
    refs: (Array.isArray(refs) ? refs : []).filter(Boolean),
    reason: str(reason, 140),
  }
}

function failureLevel(f) {
  if (isIrreversible(f) || isOwnerDirect(f)) return 3
  if (isConflict(f)) return 2
  if (isBackground(f)) return 0
  if (isReport(f)) return 1
  const sev = str(f.severity).toLowerCase()
  if (/^(3|crisis|critical|fatal|不可逆)$/.test(sev)) return 3
  if (/^(2|warn|warning|conflict|冲突)$/.test(sev)) return 2
  if (/^(0|debug|background|后台)$/.test(sev)) return 0
  return 1
}

function failureKind(f) {
  if (isConflict(f)) return 'conflict'
  if (isBackground(f)) return 'background'
  if (isReport(f)) return 'subagent-report'
  return 'failure'
}

function failureWhat(f) {
  return f.what || f.title || f.text || f.name || (isConflict(f) ? '两件事对不上' : '有件事没成')
}

function failureReason(kind, level, f) {
  if (level === 3) return '不可逆 / 已经坏了：现在就叫，叫人比省一次唤醒便宜'
  if (kind === 'conflict') return '冲突：两边的说法对不上，得她本人定信谁'
  if (kind === 'background') return '后台动静：不叫她，留着看就行'
  if (kind === 'subagent-report') return '分身汇报：她醒着顺手说一句，不用为这个单独叫'
  return '普通事件：记一笔，值得说就说一句'
}

/** 合并：同 kind + 同 refs 视为同一件事（重试/重复入参），只留一条。 */
function mergeSignals(raw) {
  const byKey = new Map()
  for (const s of raw) {
    const key = `${s.kind}|${[...s.refs].sort().join(',')}`
    const prev = byKey.get(key)
    if (!prev) { byKey.set(key, { ...s, refs: [...s.refs], _n: 1 }); continue }
    prev._n += 1
    if (s.level > prev.level) { prev.level = s.level; prev.what = s.what; prev.reason = s.reason }
    for (const r of s.refs) if (!prev.refs.includes(r)) prev.refs.push(r)
  }
  return [...byKey.values()].map(({ _n, ...s }) => (_n > 1 ? { ...s, reason: `${s.reason}；同类 ${_n} 条` } : s))
}

/** 一条摘要：按 kind 归堆，最多一行。没有 level>=1 的信号就没什么可说的。 */
function buildCoalesce(signals) {
  const rows = signals.filter((s) => s.level >= 1)
  if (!rows.length) return null
  const groups = new Map()
  for (const s of rows) {
    const g = groups.get(s.kind) || { kind: s.kind, level: s.level, whats: [] }
    g.level = Math.max(g.level, s.level)
    g.whats.push(s.what)
    groups.set(s.kind, g)
  }
  const list = [...groups.values()].sort((a, b) => b.level - a.level || a.kind.localeCompare(b.kind))
  const chunks = list.map((g) => {
    const shown = g.whats.slice(0, 2).join('、')
    return `${KIND_LABEL[g.kind] || g.kind} ${g.whats.length} 件：${shown}${g.whats.length > 2 ? '…' : ''}`
  })
  const level = rows.reduce((m, s) => Math.max(m, s.level), 0)
  return {
    level,
    count: rows.length,
    kinds: list.map((g) => g.kind),
    refs: [...new Set(rows.flatMap((s) => s.refs))].slice(0, 12),
    // 「最多 1 条摘要」：整句就这一行，叫醒时直接贴进简报也不会刷屏。
    text: `感官 ${level}（${rows.length} 条）：${chunks.join('；')}`,
  }
}

/**
 * 本地痛觉：哪里痛、要不要现在叫。
 *
 * @param {object} [input]
 * @param {Array} [input.waits]          listWaiting(role) 的原样输出（只看 due 的）
 * @param {Array} [input.agendaDue]      dueItems(role) 的原样输出
 * @param {Array} [input.loops]          listLoops(role,{status:'open'}) 的原样输出
 * @param {Array} [input.summaryPending] listPending(role) 的原样输出
 * @param {Array} [input.failures]       失败/事故/冲突——识别字段 kind/severity/conflict/irreversible/report/background
 * @param {Array} [input.ownerAsks]      主人直接找（QQ 私聊点名、电话）：不猜，传进来就是 3
 * @param {number} [input.now]           时间基准（测试用）
 * @param {number} [input.quietMs]       冷却窗口，默认 30 分钟；<=0 表示不冷却
 * @param {number} [input.lastWakeAt]    上次叫醒的毫秒时间戳；0/不传=没叫过
 * @returns {{level:number, signals:Array<{kind:string,level:number,what:string,refs:string[],reason:string}>, shouldWake:boolean, coalesce:null|{level:number,count:number,kinds:string[],refs:string[],text:string}}}
 */
export function buildPainSignals(input = {}) {
  const src = input && typeof input === 'object' ? input : {}
  const nowRaw = Number(src.now)
  const now = Number.isFinite(nowRaw) ? nowRaw : Date.now()
  const quietRaw = Number(src.quietMs)
  const quietMs = Number.isFinite(quietRaw) ? Math.max(0, quietRaw) : DEFAULT_QUIET_MS
  const lastWakeAt = Math.max(0, Number(src.lastWakeAt) || 0)

  const raw = []

  // 3 级：主人直接找。别人可以等，他等不了——这一条不问别的，直接最高。
  for (const x of asList(src.ownerAsks)) {
    if (!x || x.done === true || x.handled === true) continue
    raw.push(makeSignal('owner-direct', 3, x.what || x.text || x.title || '主人直接开口',
      refsOf(x), '主人直接找你（不是猜的）：先回他，别的事往后排'))
  }

  // 2 级：她约的时间到了（wait 有 until；没写 until 的「等他自己回」不算到期，不进痛觉）。
  for (const w of asList(src.waits)) {
    if (!w || w.done === true || w.finishedAt) continue
    const until = num(w.until)
    const due = w.due === true || (until > 0 && until <= now)
    if (!due) continue
    const lv = isIrreversible(w) || isOwnerDirect(w) ? 3 : 2
    const late = until > 0 && now > until ? Math.round((now - until) / 3600000) : 0
    raw.push(makeSignal('wait-due', lv, w.what || '约的时间到了', refsOf(w),
      late > 0 ? `约的时间过了 ${late} 小时，还没结` : '她自己约的点到了；做不做她定'))
  }

  // 2 级：她自己排的议程到点（已经提醒过的不重算）。
  for (const a of asList(src.agendaDue)) {
    if (!a) continue
    if (['done', 'dropped'].includes(str(a.state).toLowerCase())) continue
    const dueAt = num(a.dueAtMs)
    if (dueAt > 0 && num(a.dueNotifiedAtMs) >= dueAt) continue
    if (dueAt > 0 && dueAt > now) continue
    const lv = isIrreversible(a) || isOwnerDirect(a) ? 3 : 2
    raw.push(makeSignal('agenda-due', lv, a.what || a.text || '自己排的事到点', refsOf(a),
      '她自己排的时间到了；做完不结会再叫一次'))
  }

  // 2 级：说了要做、还没闭合（提过一次的不再痛，别每轮催）。
  for (const l of asList(src.loops)) {
    if (!l) continue
    const status = str(l.status || 'open').toLowerCase()
    if (status && status !== 'open') continue
    if (l.notifiedAt || l.closedAt || l.droppedAt) continue
    const lv = isIrreversible(l) || isOwnerDirect(l) ? 3 : 2
    raw.push(makeSignal('open-loop', lv, l.what || '有件事没闭合', refsOf(l),
      l.overdue ? '说了要做，过点了还没闭合' : '说了要做，还没闭合（做/不做/改期都行）'))
  }

  // 2 级：总结核对闸门说「该叫一次」——没对上的东西没闭合，不催，只报。
  for (const s of asList(src.summaryPending)) {
    if (!s || s.notifiedAt) continue
    const why = Array.isArray(s.reasons)
      ? s.reasons.map((x) => str(x, 60)).filter(Boolean).slice(0, 2).join('；')
      : str(s.reason || s.why, 60)
    const lv = isOwnerDirect(s) ? 3 : 2
    raw.push(makeSignal('summary-pending', lv,
      `总结核对有一处对不上${why ? `：${why}` : ''}`, refsOf(s),
      '核对闸门说该叫一次；补不补她定'))
  }

  // 失败/冲突/分身汇报：按字段分级，不按「有人报了」就一律叫。
  for (const f of asList(src.failures)) {
    if (!f || f.handled === true || f.done === true) continue
    const kind = failureKind(f)
    const lv = failureLevel(f)
    raw.push(makeSignal(kind, lv, failureWhat(f), refsOf(f), failureReason(kind, lv, f)))
  }

  const signals = mergeSignals(raw).sort((a, b) => b.level - a.level
    || a.kind.localeCompare(b.kind)
    || a.what.localeCompare(b.what))

  const level = signals.reduce((m, s) => Math.max(m, s.level), 0)
  const hot = signals.some((s) => s.level >= 2)
  const warm = signals.some((s) => s.level === 1)
  const cooling = quietMs > 0 && lastWakeAt > 0 && now - lastWakeAt < quietMs
  // 口径：>=2 直接叫（到期/未闭合/冲突不压冷却——漏一次比多叫一次贵）；
  // 只有 1 级看冷却；0 级永远不叫。
  const shouldWake = hot || (warm && !cooling)

  return { level, signals, shouldWake, coalesce: buildCoalesce(signals) }
}
