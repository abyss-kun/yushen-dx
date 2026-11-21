/* 标签
 * id: memory-core-refine-judge
 * kind: module
 * summary: 精提炼的判据与落库：模型输出能不能写进在用、写成什么形状。
 * tags: 精提炼, 判据, 去重, 在用, 单一实现
 * created: 2026-11-13 00:50:00
 * changed: 2026-11-16 20:55:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：继续完善记忆架构；judge 收进 core）
 * audience: refine 脚本、未来 dsh-memory
 * owner: 框架；判据是老板定的，别放宽
 * mutable: 可改；红线：head/detail/fromRef/kind/去重
 * usage: judge(raw,row,seen) / buildInUseRow(r,j,model,fb,verdict,episodeId)
 * why: judge 埋在脚本里，出厂版和本体各一份就会漂
 * result: 判据和落库形状只有一份
 */
import crypto from 'node:crypto'
import { KINDS } from './middle.js'
import { LOGGY } from './filter.js'
import { roleFromRef } from './role.js'

const NEAR_DUP = 0.6
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const clipDetail = (s, n = 120) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const head = t.slice(0, n)
  const cut = head.match(/^[\s\S]*[。；！？]/)
  if (cut && cut[0].length >= n * 0.6) return cut[0].trim()
  return `${t.slice(0, n - 1).replace(/[，、；：]$/, '')}…`
}
const headGrams = (s) => {
  const t = String(s || '').replace(/\s+/g, '')
  const set = new Set()
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2))
  return set
}
const headJac = (a, ga, b, gb) => {
  if (!ga || !gb || !ga.size || !gb.size) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter += 1
  return inter / (ga.size + gb.size - inter)
}
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const normAt = (s) => {
  const t = String(s || '').trim()
  const m = t.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?::\d{2})?$/)
  return m ? `${m[1]}T${m[2]}` : t
}
const nowISO = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  const tz = -d.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const abs = Math.abs(tz)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
}

export function judge(raw, row, { seenRefs = new Set(), seenHeads = new Set(), seenHeadSets = [] } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { bad: true, why: '不是对象' }
  if (raw.skip === true) return { skip: true, why: clip(raw.why || '模型判断没有信息量', 40) }
  const fromRef = String(row?.id || '')
  if (!fromRef) return { bad: true, why: '来源指不回去（没有 fromRef）' }
  const kindRaw = String(raw.kind || '').trim()
  if (/^skip$/i.test(kindRaw)) return { skip: true, why: clip(raw.why || '模型判 skip（kind=skip）', 40) }
  if (!KINDS.includes(kindRaw)) return { bad: true, why: `kind 不在三类里（${clip(kindRaw || '空', 10)}）` }
  const headRaw = String(raw.head || raw.title || '').replace(/\s+/g, ' ').trim()
  if (!headRaw) return { bad: true, why: 'head 空' }
  if (headRaw.length < 4) return { bad: true, why: `head 太短（${headRaw.length} 字）` }
  const head = clip(headRaw, 40)
  const detail = clipDetail(raw.detail || '', 120)
  if (detail.length < 10) return { bad: true, why: `detail 太短（${detail.length} 字）` }
  // 短时状态/运行时信封：不是长期记忆，跳过；否则旧队列会把“当前无生效指令”也写成卡。
  if (/^(运行时上下文|系统提示|system-reminder|当前时间|当前角色|工作区指令基线|当前无生效指令|本次会话|会话状态)/i.test(`${headRaw} ${detail}`)) {
    return { skip: true, why: '短时状态/运行时信封（不是长期记忆）' }
  }
  if (LOGGY.test(`${headRaw} ${detail}`)) {
    return { skip: true, why: '系统日志/作业流水（结论里带着 exit code/作业流水，不进在用）' }
  }
  let kind = kindRaw
  let reKind = ''
  if (kind === '知识') {
    const external = /(《[^》]+》|文档|论文|官方|https?:\/\/|报错|命令|API|书上|别人说)/i
    const cited = external.test(`${headRaw} ${detail}`)
    const ownWords = Boolean(row && row.preKind && row.preKind !== '知识'
      && !/^(别人说的|书上)$/.test(String(row.sourceLevel || '')))
    if (ownWords || !cited) {
      const shape = /(下次|以后|遇到|别再|不要再|先.{0,8}再)/i
      const to = shape.test(`${headRaw} ${detail}`) ? '经验' : '记忆'
      reKind = `知识→${to}（${ownWords ? '自己的话' : '没写出处'}）`
      kind = to
    }
  }
  if (kind === '经验') {
    const shape = /(下次|以后|遇到|别再|不要再|先.{0,8}再)/i
    if (!shape.test(String(headRaw || '') + String(detail || ''))) {
      return { bad: true, why: '经验没写成「下次要…」的形状' }
    }
  }
  if (seenRefs.has(fromRef)) return { bad: true, why: '重复：同一 fromRef 已存在' }
  if (seenHeads.has(head)) return { skip: true, dup: true, why: '已有同一条结论（全等）' }
  if (seenHeadSets.length) {
    const g = headGrams(head)
    let best = 0
    let bestHead = ''
    for (const x of seenHeadSets) {
      const s = headJac(head, g, x.head, x.g)
      if (s > best) { best = s; bestHead = x.head }
    }
    if (best >= NEAR_DUP) {
      return { skip: true, dup: true, why: `近似重复（${best.toFixed(2)}）已有「${clip(bestHead, 22)}」` }
    }
  }
  const conf = String(raw.confidence || '').includes('确定') ? '确定' : '推测'
  const tags = [...new Set((Array.isArray(raw.tags) ? raw.tags : []).map((t) => clip(t, 12)).filter(Boolean))].slice(0, 4)
  const people = [...new Set((Array.isArray(raw.people) ? raw.people : []).map((t) => clip(t, 12)).filter(Boolean))].slice(0, 4)
  return {
    ok: true,
    kind,
    ...(reKind ? { reKind } : {}),
    head,
    detail,
    tags,
    confidence: conf,
    people,
    appliesTo: clip(raw.appliesTo || '', 60),
    importance: ['高', '中', '水'].includes(String(raw.importance || '')) ? String(raw.importance) : '中',
    subject: clip(String(raw.subject || '').replace(/\s+/g, ' ').trim(), 10),
    stance: clip(String(raw.stance || '').replace(/\s+/g, ' ').trim(), 20),
  }
}

/** 卡片模态：先按文字粗分，后续模型/她可以改；不确定就 fact。 */
function inferModality(text) {
  const s = String(text || '')
  if (/如果|假如|假设|设想|要是/.test(s)) return 'hypothesis'
  if (/听说|据说|转述|传言/.test(s)) return 'rumor'
  if (/答应|承诺|说好|约好/.test(s)) return 'promise'
  if (/打算|计划|准备|明天|后天|下次|回头|稍后|改天/.test(s)) return 'plan'
  if (/故事|编的|虚构/.test(s)) return 'story'
  return 'fact'
}

/**
 * 落库形状。第 5 个参数 verdict 来自 scoreFeedback（纯本地判断，没传就是老行为）：
 *   action === 'review' → 卡上带 feedbackReview:true / feedbackWhy，表示“写进来了，但反馈存疑，
 *   别当正常通过的卡算”；其它 action（keep / 无反馈 / drop）一律不加字段。
 * drop 正常不会走到这里（refine 在写卡前就跳过了），这里也不替它做删除。
 * 第 6 个参数 episodeId 由调用方按 row.role + row.turnId 查事件段索引得到；查不到传空/不传，
 * 卡上就留空——不拿时间或标题硬编一个段。
 */
export function buildInUseRow(r, j, modelUsed = '', fb = null, verdict = null, episodeId = '') {
  const useCount = Number(fb?.used) || 0
  const tier = Number(fb?.bad) > 0 ? '下游' : (Number(fb?.good) >= 2 || useCount >= 3 ? '上游' : '中游')
  const modality = inferModality(`${j.head || ''} ${j.detail || ''}`)
  const review = String(verdict?.action || '') === 'review'
  return {
    id: `r-${sha(`${j.kind}|${r.id}|${j.head}`)}`,
    kind: j.kind,
    head: j.head,
    detail: j.detail,
    tags: j.tags,
    confidence: j.confidence,
    people: j.people,
    modality,
    speaker: String(r.who || '').slice(0, 20),
    speakerRole: String(r.role || '').slice(0, 20),
    status: 'active',
    supersedes: [],
    // same_event 只认显式 id；绝不用“标题像”自动合并（2026-11-15 决定）。
    sameEventKey: String(j.sameEventKey || r.sameEventKey || ''),
    validUntil: String(j.validUntil || r.validUntil || ''),
    ...(j.appliesTo ? { appliesTo: j.appliesTo } : {}),
    text: j.head,
    keywords: j.tags,
    at: normAt(r.at),
    day: r.day,
    channel: r.channel,
    who: r.who,
    turnId: String(r.turnId || ''),
    // 事件段 ↔ 卡：只写调用方查到的段 id；没有就空，不硬编。
    episodeId: String(episodeId || ''),
    sessionId: String(r.sessionId || ''),
    turn: Number(r.turn) || 0,
    role: String(r.role || roleFromRef(r.ref) || 'unknown'),
    // 经验/卡默认归作者角色；共享要显式改 visibility/sharedWith，不自动串角色。
    authorRole: String(r.role || roleFromRef(r.ref) || 'unknown'),
    visibility: 'role_private',
    sharedWith: [],
    source: '精提炼',
    fromRef: r.id,
    ref: r.ref,
    rawRef: r.rawRef || '',
    threadId: String(r.sessionId || (String(r.turnId || '').includes('#') ? String(r.turnId).split('#')[0] : '')),
    eventKey: String(r.turnId || r.id || ''),
    topicKey: String(j.subject || r.subject || (j.tags || [])[0] || r.topic || ''),
    links: [],
    fp: r.fp || '',
    filterVersion: r.filterVersion || '',
    model: modelUsed,
    importance: j.importance,
    ...(j.reKind ? { reKind: j.reKind } : {}),
    ...(j.subject ? { subject: j.subject } : {}),
    ...(j.stance ? { stance: j.stance } : {}),
    // 反馈 review：卡照写，但留痕——以后统计/巡检能把它跟“正常通过”分开。
    ...(review ? {
      feedbackReview: true,
      feedbackWhy: String(verdict?.why || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    } : {}),
    status: 'active',
    tier,
    useCount,
    lastUsed: String(fb?.lastAt || normAt(r.at)),
    createdAt: nowISO(),
  }
}
