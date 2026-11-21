/* 标签
 * id: lib-transition-filter
 * kind: module
 * summary: 投影 → 待提炼的过渡筛选：本地判 keep/why/kind/worth，不调模型；标记不删源。
 * tags: 筛选, 过渡, 待提炼, 本地规则, 零模型
 * created: 2026-11-12 20:45:00
 * changed: 2026-11-12 21:18:06
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：过渡筛选要做通，投影到待提炼中间要筛）
 * audience: 她、提炼脚本、维护者
 * owner: 框架；规则可调，但“标记不删源”不许破
 * mutable: 可改；改规则要跑 test-transition-filter.mjs
 * usage: classifyEntry({text,who}) → {keep,why,kind,worth}；library-chain/live-transcript 调
 * why: 以前所有轮次都进待提炼，噪声堆在队列里；筛选应发生在投影落地时
 * result: 无用条目不进队列，手抄本仍留索引，投影/本源不动
 */
// 投影 → 待提炼 的过渡筛选：本地规则，不调模型。
// 这套规则原来在 scripts/refine.mjs（preJudge/NOISE/PATHY/LOGGY），2026-11-12 搬到 lib 里共用，
// **不是另造一套**：投影落地和精提炼前用的是同一份判据。
// 只决定“这一条要不要进队列”；手抄本仍然记，投影仍然全，标记不删源。
const PATHY = /(^|[^A-Za-z])[A-Za-z]:[\\/]|(\/[A-Za-z0-9_.-]+\/){2,}/
export const LOGGY = /(exit code|background job|pwsh-[0-9a-f]{6}|退出码|job_output|已收尾|status: completed)/i
export const FILTER_VERSION = '2026-11-12.1'
const NOISE = [
  /兜底定时器/,
  /前台手册：主人说的每一句都归你判断/,
  /^#\s*管家任务手册/m,
  /你是大鱼（大管家），软件的话事人/,
  /^#\s*大鱼任务手册/m,
  /自动叫醒|定时唤醒|心跳简报/,
]
const EXTERNAL = /(《[^》]+》|书上|文档|资料|据|报错|https?:\/\/|官方|论文|API 文档|别人说|他说过)/i
const LESSON = /(下次|以后|不要再|别再|教训|踩坑|应该先|必须先)/i
const LINK_ONLY = /^(?:https?:\/\/\S+|\[[^\]]+\]\(\S+\))\s*$/i

export function isNoise(text) {
  const t = String(text || '')
  return NOISE.some((re) => re.test(t))
}

/**
 * 原 refine.mjs 里的 preJudge：规则搬到这里，两处共用；不是另造一套。
 * 返回 {kind, confident} 或 {kind:'', skip}，保持老调用方的形状。
 */
export function preJudge(row = {}) {
  const text = String(row.body || '') + ' ' + String(row.head || '')
  const c = classifyEntry({ text, who: row.who || '' })
  if (!c.keep) {
    const why = c.why === '配置/路径类' ? '配置/路径类（不进在用）'
      : c.why === '系统日志/流水' ? '系统日志/作业流水（不进在用）'
        : c.why
    return { kind: '', skip: why }
  }
  return { kind: c.kind, confident: c.worth === '高' || !/他说|她说|据|可能|大概/.test(text) }
}

/**
 * 一条投影段落 → 要不要进待提炼。
 * @returns {{keep:boolean, why:string, kind:string, worth:string}}
 */
export function classifyEntry({ text = '', who = '' } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const isUser = /老板|主人|你|对方|他/.test(String(who || ''))
  if (!t) return { keep: false, why: '空', kind: '', worth: '低' }
  if (isNoise(t)) return { keep: false, why: '自动叫醒/简报', kind: '', worth: '低' }
  if (PATHY.test(t)) return { keep: false, why: '配置/路径类', kind: '', worth: '低' }
  if (LOGGY.test(t)) return { keep: false, why: '系统日志/流水', kind: '', worth: '低' }
  if (LINK_ONLY.test(t)) return { keep: false, why: '只有链接', kind: '', worth: '低' }
  if (EXTERNAL.test(t)) return { keep: true, why: '外部知识', kind: '知识', worth: LESSON.test(t) ? '高' : '中' }
  if (LESSON.test(t)) return { keep: true, why: '可复用经验', kind: '经验', worth: '高' }
  if (!isUser && t.length < 20 && !/[你您]/.test(t)) return { keep: false, why: '太短', kind: '', worth: '低' }
  return { keep: true, why: '普通记忆', kind: '记忆', worth: /决定|答应|承诺|定了|以后|从现在/.test(t) ? '高' : '中' }
}
