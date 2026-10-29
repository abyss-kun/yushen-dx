// 分析：一条消息进来，先看清它是什么，再决定接不接。
//
// 这不是模型推理，是**可复核的规则分析**：意图、是不是冲她、急不急、有没有越界、要不要认人。
// 结论都带依据（命中了哪条规则），不编"我觉得"。
import { SENSITIVE, needsOwner } from './owner-guard.js'
import { IRREVERSIBLE } from './authority.js'

const ASK = /(？|\?|吗|呢|怎么|为什么|多少|能不能|可不可以|是不是|有没有|帮我|请问)/
const ORDER = /(^|[\s，。！？])(去|给我|把|马上|立刻|必须|赶紧|不许|别|禁止)/
const EMOTION = /(气死|烦死|难受|开心|高兴|难过|无语|离谱|卧槽|操|妈的|呜|哭)/
const ABOUT_HER = /(你|你们|管家|助手|鱼神|管家|助手|鱼姐|鱼宝)/
// 她在这套系统里的名字（桥上的号也叫这个）
const SELF_NAMES = /(超级角色|角色|角色|鱼神|管家|助手)/

// 自动回复不是人说的话：不接、不学、不替它发
const CANNED = [
  /^[【\[（(]?自动回复[】\]）)]?[:：]?/,
  /^(你好|您好)[，,]?我现在有事不在/,
  /^我现在有事不在[，,]?(一会|稍后|回头|请)/,
  /^\[自动回复\]/,
]

export function isCanned(text = '') {
  const t = String(text || '').trim()
  return CANNED.some((re) => re.test(t))
}

/**
 * @param {string} text
 * @param {{from?:string, atMe?:boolean, isOwner?:boolean, now?:number}} ctx
 */
export function analyzeMessage(text, { from = '', atMe = false, isOwner = false } = {}) {
  const t = String(text || '').trim()
  if (isCanned(t)) {
    return {
      text: t.slice(0, 120), from: String(from || ''), intent: 'canned', atHer: false, urgency: 'low',
      risk: '', irreversible: false, needsVerify: false,
      advice: '这不是人说的话（自动回复模板）：不接、不学、不替它发',
      reasons: ['命中自动回复模板'],
    }
  }
  const reasons = []
  const isSelf = SELF_NAMES.test(String(from || ''))
  const mentions = String(t).match(/@[^\s，,]+/g) || []
  const mentionHers = mentions.some((m) => SELF_NAMES.test(m))
  let intent = 'chat'
  if (atMe || mentionHers || AT_ME(t)) { intent = 'at-her'; reasons.push('@她 或点了名') }
  else if (mentions.length) { intent = 'at-other'; reasons.push(`在跟别人说话（${mentions.slice(0, 2).join(' ')}）`) }
  else if (ASK.test(t)) { intent = 'question'; reasons.push('像在问事') }
  else if (ORDER.test(t)) { intent = 'order'; reasons.push('像在下指令') }
  else if (EMOTION.test(t)) { intent = 'emotion'; reasons.push('带情绪') }
  else if (ABOUT_HER.test(t)) { intent = 'about-her'; reasons.push('提到她/她们') }
  else if (t.length <= 3) { intent = 'tiny'; reasons.push('很短（可能是应声）') }
  if (isSelf) reasons.push('这是她自己说的话')

  const boundary = needsOwner(t) || (SENSITIVE.find((s) => s.split('、').some((w) => t.includes(w))) || '')
  const irreversible = IRREVERSIBLE.find((x) => x.split('、').some((w) => t.includes(w))) || ''
  const risk = boundary || irreversible || ''
  if (risk) reasons.push(`越界风险：${risk}`)

  const urgency = atMe || /(急|马上|立刻|现在|快)/.test(t) ? 'high' : (intent === 'question' || intent === 'order' ? 'mid' : 'low')
  const needsVerify = Boolean(risk) && !isOwner
  const advice = isSelf
    ? '这是你自己说的，不用接'
    : needsVerify
      ? '别办：先认人（不是老板本人就没权限）；拿不准就挂"身份待确认"'
      : risk
        ? '是老板也要按级别：不可逆的事要看他在不在电脑前'
        : intent === 'at-her' || intent === 'question'
          ? '值得认真看：她可能想被回应'
          : intent === 'at-other'
            ? '不是冲你：可以不接'
            : '可以先放着，或随口一句'

  return {
    text: t.slice(0, 120),
    from: String(from || ''),
    intent,
    atHer: Boolean(atMe || mentionHers || AT_ME(t)),
    urgency,
    risk: risk || '',
    irreversible: Boolean(irreversible),
    needsVerify,
    advice,
    reasons,
  }
}

function AT_ME(t) { return /@\s*(助手|管家|鱼神|管家|助手)/.test(t) }

/** 一批：先数清楚，再挑出要她注意的。 */
export function analyzeBatch(messages = [], { limit = 5 } = {}) {
  const rows = messages.map((m) => ({ ...m, a: analyzeMessage(m.text, { from: m.name, atMe: m.atMe, isOwner: m.isOwner }) }))
  const counts = rows.reduce((acc, r) => { acc[r.a.intent] = (acc[r.a.intent] || 0) + 1; return acc }, {})
  const flagged = rows.filter((r) => r.a.risk).slice(-limit)
  const worth = rows.filter((r) => !r.a.risk && (r.a.intent === 'at-her' || r.a.intent === 'question')).slice(-limit)
  return { total: rows.length, counts, flagged, worth, rows }
}
