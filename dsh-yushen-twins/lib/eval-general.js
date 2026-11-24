// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜lib/eval-general.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: lib-eval-general
 * kind: module
 * summary: 出厂用的通用记忆评测题库：10 道通用题（人物/时间/承诺/决定/改口/情绪/多跳）+ 纯判分 + 20 条合成记忆。
 * tags: 评测, 记忆, 检索, 出厂, 通用, 合成数据
 * created: 2026-11-24 21:2x
 * author: 大鱼·本班（子会话）
 * authority: 老板（2026-11-24：做一个「出厂用」的通用记忆评测，不贴我们自己的历史）
 * audience: 出厂验收、维护、以后换版本对比
 * owner: 框架；只读检索，不写记忆
 * usage: QUESTIONS / REQUIRED_KINDS / judgeHits(hits, expected, {k}) / seedEvents({now}) / seedCards({now})
 * why: lib/eval-own.js 的 10 题问的全是自家术语（图书馆、弱使用、鱼神），只能量「自家那份数据」，
 *      换个家、换个案例就全红，没法当出厂评测。这里换成任何一座记忆库都可能被问到的通用题，
 *      并且数据是当场合成的，不依赖任何真实记忆。
 * result: 配合 scripts/eval-general.mjs（临时家 + 20 条合成记忆 + 2 张卡）量 hit@1 / hit@3。
 *         本文件故意**不 import memory-core**：memory-core/runtime/recall-use.js 在 import 时就把
 *         DSH_HOME 读死了，谁先 import 谁决定了它写哪个家——脚本必须先设好临时家再动态 import。
 * mutable: 可改；题目只增不删（删要记原因），改题会让历史数字不可比
 */

/** 七类必须覆盖的考法（测试会查：别改着改着把某一类改没了）。 */
export const REQUIRED_KINDS = Object.freeze(['人物', '时间', '承诺', '决定', '改口', '情绪', '多跳'])

/**
 * 10 道通用题。q 是问法，expected 是答案里该出现的词（命中任一个算对）。
 * 规矩：只用任何人都可能经历的事（搬家/换工作/房租/答应过的日期/心情），
 *      不出现我们自己的术语——不然又变成「自家评测」。
 */
export const QUESTIONS = Object.freeze([
  { id: 'q01', kind: '人物', q: '谁要搬家？', expected: ['阿川'] },
  { id: 'q02', kind: '人物', q: '谁换了新工作？', expected: ['林窈'] },
  { id: 'q03', kind: '时间', q: '阿川原来定哪天搬家？', expected: ['周三'] },
  { id: 'q04', kind: '时间', q: '押金什么时候结？', expected: ['当天'] },
  { id: 'q05', kind: '承诺', q: '答应林窈什么时候把大纲给她？', expected: ['周五'] },
  { id: 'q06', kind: '承诺', q: '答应阿川搬家那天几点到？', expected: ['八点'] },
  { id: 'q07', kind: '决定', q: '今年还接外包活吗？', expected: ['不再'] },
  { id: 'q08', kind: '改口', q: '房租最后涨了吗？', expected: ['先不涨', '不涨'] },
  { id: 'q09', kind: '情绪', q: '跟家里通完电话以后心情怎么样？', expected: ['低落'] },
  { id: 'q10', kind: '多跳', q: '林窈说她的新老板什么样？', expected: ['姓陈', '挺严'] },
])

/** 自家术语：题目里出现这些词就不算「通用」了（lib/eval-own.js 那 10 题的教训）。 */
export const SELF_WORDS = Object.freeze([
  '图书馆', '弱使用', '鱼神', '派活单', '顶游', '上游', '冷档', '宪章', '出厂包', '重叠包',
  '大鱼', '小鱼', '照着干', '四层记忆',
])

const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase()

/** 一条 hit 可能是字符串，也可能是 searchMemory 给的 {text, ...}。取不出正文就当空。 */
function hitText(h) {
  if (typeof h === 'string') return h
  if (h && typeof h === 'object' && typeof h.text === 'string') return h.text
  return ''
}

/**
 * 纯判分：前 k 条里有没有 expected 里的任一词。
 * @param {Array<string|{text?:string}>} hits 检索结果（按相关度排好序）
 * @param {string[]|string} expected 期望关键词（任一命中算对）
 * @param {{k?:number}} [opts] k 默认 3
 * @returns {{hit:boolean, rank:number, expectedIndex:number}} rank 从 0 起，没命中为 -1
 */
export function judgeHits(hits, expected, { k = 3 } = {}) {
  const want = (Array.isArray(expected) ? expected : [expected]).map(norm).filter(Boolean)
  if (!want.length) return { hit: false, rank: -1, expectedIndex: -1 }
  const n = Math.max(0, Number(k) || 0)
  const list = Array.isArray(hits) ? hits.slice(0, n) : []
  for (let i = 0; i < list.length; i += 1) {
    const body = norm(hitText(list[i]))
    if (!body) continue
    for (let j = 0; j < want.length; j += 1) {
      if (body.includes(want[j])) return { hit: true, rank: i, expectedIndex: j }
    }
  }
  return { hit: false, rank: -1, expectedIndex: -1 }
}

/** 本地时间的「几天前的 hh:mm」，返回 ISO 串。d>=1 保证一定在过去（今天几点跑都不出未来事件）。 */
function atLocal(nowMs, daysAgo, hh, mm = 0) {
  const d = new Date(Number(nowMs) || Date.now())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}

// 20 条合成记忆：跨 3 天（3 天前 / 2 天前 / 昨天），含人物、承诺、决定、改口、时间、情绪。
// 文本里不写「今天/昨天」这类会过期的说法——数据可以随时重跑，措辞不能跟着日历烂。
const RAW_EVENTS = [
  // ── 3 天前 ──
  { d: 3, hh: 9, mm: 30, who: '阿川', text: '阿川说他下周三要搬家，问我们那天能不能过去帮忙。' },
  { d: 3, hh: 10, mm: 20, who: '林窈', text: '林窈换了新工作，去一家做咖啡豆生意的公司上班。' },
  { d: 3, hh: 11, mm: 0, kind: 'promise', tier: 'important', text: '我答应帮阿川搬家，顺便把小推车借给他用。' },
  { d: 3, hh: 14, mm: 0, who: '老周', text: '老周说房租从下个月起涨两百，先口头通知一声。' },
  { d: 3, hh: 20, mm: 30, kind: 'feeling', valence: -0.6, intensity: 0.7, text: '晚上跟家里通了个电话，聊得不顺，心里有点低落。' },
  { d: 3, hh: 21, mm: 10, kind: 'decision', tier: 'important', text: '决定今年不再接新的外包活，先把手上的小册子写完。' },
  { d: 3, hh: 21, mm: 40, who: '阿川', text: '阿川说他姐姐在学日语，已经考了两次。' },
  // ── 2 天前 ──
  { d: 2, hh: 9, mm: 40, who: '林窈', text: '林窈改口，咖啡豆那家公司不去了，改去一家做书店活动的公司。' },
  { d: 2, hh: 10, mm: 30, kind: 'promise', tier: 'important', who: '林窈', text: '答应林窈周五之前把小册子的大纲发给她看。' },
  { d: 2, hh: 13, mm: 20, who: '老周', tier: 'important', text: '老周改口，房租先不涨了，等明年三月再说。' },
  { d: 2, hh: 15, mm: 0, who: '阿川', text: '阿川打电话来说搬家推迟到月底，具体日子再定。' },
  { d: 2, hh: 19, mm: 30, kind: 'feeling', valence: 0.6, intensity: 0.6, text: '大纲写完了一半，心情不错，晚上多做了一个菜。' },
  { d: 2, hh: 20, mm: 0, who: '老周', kind: 'decision', text: '和老周说好，押金在搬走当天结清。' },
  { d: 2, hh: 21, mm: 0, who: '阿川', text: '阿川说他姐姐第三次日语考过了，替他高兴。' },
  // ── 昨天 ──
  { d: 1, hh: 9, mm: 10, who: '阿川', text: '阿川发消息说搬家那天他表哥也来帮忙。' },
  { d: 1, hh: 9, mm: 30, kind: 'promise', tier: 'important', who: '阿川', text: '答应阿川搬家那天早上八点到，别迟到。' },
  { d: 1, hh: 12, mm: 0, kind: 'decision', tier: 'important', who: '阿川', text: '决定把小推车直接送给阿川，不拿回来了。' },
  { d: 1, hh: 16, mm: 40, who: '林窈', text: '林窈说她新公司的老板姓陈，人挺严。' },
  { d: 1, hh: 20, mm: 20, kind: 'feeling', valence: 0.5, intensity: 0.5, text: '有点累，但把大纲发过去了，心里踏实。' },
  { d: 1, hh: 21, mm: 0, who: '老周', text: '老周提醒下个月一号交房租，别再拖。' },
]

/**
 * 造 20 条合成记忆（纯函数：给同一个 now，出同一份数据）。
 * 字段照 memory-core/pick.mjs 读的形状：events:[{id,at,text,kind,tier,who?,valence?,intensity?}]。
 */
export function seedEvents({ now = Date.now() } = {}) {
  return RAW_EVENTS.map((e, i) => {
    const ev = {
      id: `ge-${String(i + 1).padStart(2, '0')}`,
      at: atLocal(now, e.d, e.hh, e.mm),
      text: e.text,
      kind: e.kind || 'event',
      tier: e.tier || 'normal',
    }
    if (e.who) ev.who = e.who
    if (Number.isFinite(e.valence)) ev.valence = e.valence
    if (Number.isFinite(e.intensity)) ev.intensity = e.intensity
    return ev
  })
}

/**
 * 2 张合成卡片：只为验证「卡片也在检索范围内」（走 lib/recall-now.js 的第 ①b 段）。
 * 内容故意不碰 10 道题的任何答案词——不然卡片抢了事件的位置，量出来的就不是事件的召回。
 */
export function seedCards({ now = Date.now() } = {}) {
  return [
    {
      id: 'gc-01',
      role: 'dayu',
      status: 'active',
      head: '阿川的姐姐在准备日语考试',
      detail: '前两次没过，第三次过了；阿川每次都特意说一声。',
      tags: ['人物', '考试'],
      tier: 'normal',
      at: atLocal(now, 1, 18, 0),
    },
    {
      id: 'gc-02',
      role: 'dayu',
      status: 'active',
      head: '老周家的水管漏过一次',
      detail: '叫了物业来换一截软管，现在不漏了。',
      tags: ['家常'],
      tier: 'normal',
      at: atLocal(now, 2, 18, 30),
    },
  ]
}
