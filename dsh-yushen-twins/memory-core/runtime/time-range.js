/* 标签
 * id: memory-core-time-range
 * kind: module
 * summary: 把「昨晚8点」「上周三」「11月14号晚上」这类自然语言时间落成时间窗，供检索按 at 过滤。
 * tags: 时间, 检索, 时间窗, 自然语言, 查询
 * created: 2026-11-15 20:30:00
 * changed: 2026-11-15 20:30:00
 * author: 大鱼·子会话（本班）
 * authority: 老板（2026-11-15：补上自然语言时间查询）
 * audience: query.js、以后的检索入口
 * owner: 框架；只解析，不读写任何数据
 * mutable: 可改；改口径必须同时改 scripts/test-time-range.mjs
 * usage: parseTimeRange(text, { now, timeZone }) → { from, to, label, rest } | null
 * why: 她问「昨晚8点说了什么」时，旧检索把整句当关键词，时间词反而缩不了范围
 * result: 时间短语 → 半开区间 [from, to)；from/to 是带时区偏移的 ISO 字符串，rest 是去掉时间词后剩下的关键词
 */

// 口径（2026-11-15 补自然语言时间查询）：
//   ① 一切本地钟点都按参数里给的 timeZone 算（默认 Asia/Shanghai），不读机器时区，
//      这样测试里能钉死 now，也不会因为跑在别的机器上就换了一天；
//   ② 区间用半开 [from, to)：from 含、to 不含，所以「昨天」到「今天 00:00」为止不会把今天算进去；
//   ③ 只有钟点（8点 / 晚上8点）：按前后各 30 分钟，也就是 19:30–20:30；
//   ④ 只有一个日子（昨天 / 上周三 / 11月14号）：整天；
//   ⑤ 日子 + 时段（11月14号晚上）：按时段，晚上 = 18:00–24:00；
//   ⑥ 没有时间词返回 null，绝不猜。

const DEFAULT_TIME_ZONE = 'Asia/Shanghai'

const pad = (n) => String(n).padStart(2, '0')

function validZone(timeZone) {
  if (!timeZone) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone }); return true } catch { return false }
}

const FORMATTERS = new Map()
function formatterFor(timeZone) {
  let f = FORMATTERS.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
    FORMATTERS.set(timeZone, f)
  }
  return f
}

/** 某一时刻在指定时区里的年月日时分秒（不是 UTC，也不是本机 Date 字段）。 */
function partsIn(date, timeZone) {
  const out = {}
  for (const p of formatterFor(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = p.value
  }
  return {
    y: Number(out.year),
    mo: Number(out.month),
    d: Number(out.day),
    h: Number(out.hour) % 24,
    mi: Number(out.minute),
    s: Number(out.second),
  }
}

/** 该时刻在指定时区的偏移（分钟，东为正）。 */
function offsetMinutes(date, timeZone) {
  const p = partsIn(date, timeZone)
  const asUTC = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
  return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/** 时区里的墙钟时间 → 绝对毫秒。跨 DST 时按真实偏移再校一次。 */
function wallMs(timeZone, w, h = 0, mi = 0, s = 0) {
  const guess = Date.UTC(w.y, w.mo - 1, w.d, h, mi, s)
  const off1 = offsetMinutes(new Date(guess), timeZone)
  let ms = guess - off1 * 60000
  const off2 = offsetMinutes(new Date(ms), timeZone)
  if (off2 !== off1) ms = guess - off2 * 60000
  return ms
}

/** 绝对毫秒 → 带偏移的 ISO 字符串（如 2026-11-14T19:30:00+08:00）。 */
function isoOfMs(ms, timeZone) {
  const d = new Date(ms)
  const p = partsIn(d, timeZone)
  const off = offsetMinutes(d, timeZone)
  const sign = off < 0 ? '-' : '+'
  const abs = Math.abs(off)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** 日期加减（只动年月日，跟时区无关）。 */
function addDays(w, n) {
  const t = new Date(Date.UTC(w.y, w.mo - 1, w.d) + n * 86400000)
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

/** 0=周日 … 6=周六。 */
function weekdayOf(w) {
  return new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay()
}

function datePartsValid(y, mo, d) {
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return false
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() + 1 === mo && t.getUTCDate() === d
}

// ── 钟点 / 时段 ──────────────────────────────────────────────

const PERIODS = [
  { key: 'dawn', label: '凌晨', start: 0, end: 6, re: /凌晨/ },
  { key: 'morning', label: '上午', start: 6, end: 12, re: /(清晨|早晨|早上|上午)/ },
  { key: 'noon', label: '中午', start: 11, end: 13, re: /中午/ },
  { key: 'afternoon', label: '下午', start: 12, end: 18, re: /下午/ },
  { key: 'dusk', label: '傍晚', start: 17, end: 19, re: /傍晚/ },
  { key: 'evening', label: '晚上', start: 18, end: 24, re: /(晚上|夜里|晚间|夜晚)/ },
]

const CN_DIGIT = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
const CN_HOUR = '零一二两三四五六七八九十'

function numberFromToken(token) {
  if (/^\d+$/.test(token)) return Number(token)
  let n = 0
  let cur = 0
  for (const ch of token) {
    if (ch === '十') { n += (cur || 1) * 10; cur = 0 } else if (CN_DIGIT[ch] !== undefined) cur = CN_DIGIT[ch]
    else return NaN
  }
  return n + cur
}

const RE_CLOCK_COLON = /(\d{1,2})\s*[:：]\s*(\d{2})(?::(\d{2}))?/
const RE_CLOCK_DIGIT = /(\d{1,2})\s*[点时](半|\d{1,2}\s*分?)?/
// 中文数字只在「有时段」或「后面跟着 半/分/左右」时才认，免得把「有一点问题」当成 1 点。
const RE_CLOCK_CN = new RegExp(`([${CN_HOUR}]{1,3})\\s*[点时](半|\\d{1,2}\\s*分?)?`)
const RE_CLOCK_CN_STRICT = new RegExp(`([${CN_HOUR}]{1,3})\\s*[点时](?:半|\\d{1,2}\\s*分?|左右)`)

/** 从 from 起 maxGap 个字符内找第一个匹配；找不到返回 null。 */
function searchNear(text, re, from, maxGap) {
  const m = re.exec(text.slice(from))
  if (!m || m.index > maxGap) return null
  return { token: m, start: from + m.index, end: from + m.index + m[0].length }
}

function clockCandidates(text, from, maxGap, allowCn) {
  const out = []
  const colon = searchNear(text, RE_CLOCK_COLON, from, maxGap)
  if (colon) out.push({ start: colon.start, end: colon.end, h: Number(colon.token[1]), mi: Number(colon.token[2]) })
  const digit = searchNear(text, RE_CLOCK_DIGIT, from, maxGap)
  if (digit) {
    out.push({
      start: digit.start,
      end: digit.end,
      h: Number(digit.token[1]),
      mi: digit.token[2] === '半' ? 30 : Number(String(digit.token[2] || '').replace(/[^\d]/g, '') || 0),
    })
  }
  const cn = searchNear(text, allowCn ? RE_CLOCK_CN : RE_CLOCK_CN_STRICT, from, maxGap)
  if (cn) {
    const h = numberFromToken(cn.token[1])
    if (Number.isFinite(h)) {
      out.push({
        start: cn.start,
        end: cn.end,
        h,
        mi: cn.token[2] === '半' ? 30 : Number(String(cn.token[2] || '').replace(/[^\d]/g, '') || 0),
      })
    }
  }
  out.sort((a, b) => a.start - b.start || b.end - a.end)
  return out[0] || null
}

function periodNear(text, from, maxGap) {
  let best = null
  for (const period of PERIODS) {
    const m = period.re.exec(text.slice(from))
    if (!m || m.index > maxGap) continue
    if (!best || m.index < best.index) {
      best = { period, start: from + m.index, end: from + m.index + m[0].length }
    }
  }
  return best
}

function hourTo24(h, periodKey) {
  switch (periodKey) {
    case 'dawn': return h === 12 ? 0 : h
    case 'morning': return h
    case 'noon': return h >= 1 && h < 11 ? h + 12 : h
    case 'afternoon':
    case 'dusk':
    case 'evening': return h < 12 ? h + 12 : h
    default: return h
  }
}

// ── 剩下的关键词 ────────────────────────────────────────────

const PURE_ASK = /^(在)?(发生(了|过)?(什么|啥)(事|事情)?|干(了)?(什么|啥)|做(了)?(什么|啥)|说(了)?(什么|啥)|干(嘛|啥)(呢)?|怎么(了|样)?了?|有(什么|啥)(事|事情)?|有(什么|啥)吗|都有(什么|啥)|有(哪些|啥))$/

function cleanRest(text) {
  let r = String(text || '')
    .replace(/[，,。.!！?？；;：:、]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  r = r.replace(/^(请问|请|麻烦|帮我|帮忙|我想知道|我想问|想问|查一下|查查|找一下|找找|看看|告诉我|给我|说说|说一下)\s*/, '')
  r = r.replace(/^(我|你|他|她|我们|你们|他们)\s*/, '')
  r = r.replace(/^(请问|帮我|查一下|找一下|看看|告诉我|给我)\s*/, '')
  if (PURE_ASK.test(r)) return ''
  r = r.replace(/^(在|是|有|的|那|这|那个|这个|当时|上)\s*/, '')
  r = r.replace(/\s*(的)?(时候|那会儿|那时候|当时|前后|左右)$/, '')
  if (r.length > 2) r = r.replace(/[呢吗啊呀吧哦嘛]+$/, '')
  return r.trim()
}

// ── 主入口 ──────────────────────────────────────────────────

/**
 * 解析一句话里的自然语言时间。
 * @param {string} text 整句（例如「昨晚8点 弹窗」）
 * @param {{ now?: number|Date|string, timeZone?: string }} [options]
 * @returns {{ from: string, to: string, label: string, rest: string } | null}
 *          from 含、to 不含；没有时间词返回 null。
 */
export function parseTimeRange(text, { now = Date.now(), timeZone = DEFAULT_TIME_ZONE } = {}) {
  const raw = String(text == null ? '' : text)
  if (!raw.trim()) return null
  const tz = validZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE
  const nowDate = new Date(now)
  if (Number.isNaN(nowDate.getTime())) return null
  const todayParts = partsIn(nowDate, tz)
  const today = { y: todayParts.y, mo: todayParts.mo, d: todayParts.d }

  let day = null
  let dayLabel = ''
  let period = null
  let clock = null
  let approx = false
  // 每段匹配单独记下来：rest 只删时间词，不吞掉夹在中间的真正关键词（「昨天会议8点」的「会议」）。
  const segments = []
  let spanEnd = -1

  const mark = (start, end) => {
    const a = Math.max(0, start)
    const b = Math.max(a, end)
    segments.push({ start: a, end: b })
    if (b > spanEnd) spanEnd = b
  }

  // ① 绝对日期：2026-11-14 / 2026年11月14日 / 2026/11/14
  const full = /(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*[日号]?/.exec(raw)
  if (full) {
    const y = Number(full[1])
    const mo = Number(full[2])
    const d = Number(full[3])
    if (!datePartsValid(y, mo, d)) return null
    day = { y, mo, d }
    dayLabel = `${y}-${pad(mo)}-${pad(d)}`
    mark(full.index, full.index + full[0].length)
  }

  // ② 月日：11月14号（默认今年）
  if (!day) {
    const md = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/.exec(raw)
    if (md) {
      const mo = Number(md[1])
      const d = Number(md[2])
      if (!datePartsValid(today.y, mo, d)) return null
      day = { y: today.y, mo, d }
      dayLabel = `${mo}月${d}号`
      mark(md.index, md.index + md[0].length)
    }
  }

  // ③ 相对日子：今天 / 昨天 / 前天 / 明天 / 后天 / 今晚 / 明晚
  if (!day) {
    const rel = /(大后天|后天|明天晚上|明晚|明天|明日|昨天|昨日|今天|今日|今晚|今夜|昨儿晚上|昨晚上|昨天晚上|昨晚|前天|前日)/.exec(raw)
    if (rel) {
      const word = rel[1]
      if (word === '大后天') {
        day = addDays(today, 3)
        dayLabel = '大后天'
      } else if (word === '后天') {
        day = addDays(today, 2)
        dayLabel = '后天'
      } else if (word === '明天' || word === '明日') {
        day = addDays(today, 1)
        dayLabel = '明天'
      } else if (word === '明天晚上' || word === '明晚') {
        day = addDays(today, 1)
        dayLabel = '明晚'
        period = PERIODS.find((p) => p.key === 'evening')
      } else if (word === '今晚' || word === '今夜') {
        day = { ...today }
        dayLabel = '今晚'
        period = PERIODS.find((p) => p.key === 'evening')
      } else if (word === '昨晚' || word === '昨晚上' || word === '昨儿晚上' || word === '昨天晚上') {
        day = addDays(today, -1)
        dayLabel = word.startsWith('昨儿') ? '昨晚' : word === '昨天晚上' ? '昨天' : '昨晚'
        period = PERIODS.find((p) => p.key === 'evening')
      } else if (word === '前天' || word === '前日') {
        day = addDays(today, -2)
        dayLabel = '前天'
      } else if (word === '昨天' || word === '昨日') {
        day = addDays(today, -1)
        dayLabel = '昨天'
      } else {
        day = { ...today }
        dayLabel = '今天'
      }
      mark(rel.index, rel.index + rel[0].length)
    }
  }

  // ④ 星期：上周三 / 本周三 / 下周三 / 这周三 / 周三（默认本周；周一为一周起点）
  if (!day) {
    const wd = /(上上|上|下下|下|本|这)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/.exec(raw)
    if (wd) {
      const prefix = wd[1] || ''
      const weekOffset = prefix === '上上' ? -2 : prefix === '上' ? -1 : prefix === '下下' ? 2 : prefix === '下' ? 1 : 0
      const idx = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }[wd[2]]
      const monday = addDays(today, -((weekdayOf(today) + 6) % 7))
      day = addDays(monday, weekOffset * 7 + ((idx + 6) % 7))
      dayLabel = `${prefix || '本'}周${wd[2]}`
      mark(wd.index, wd.index + wd[0].length)
    }
  }

  // ⑤ 时段：上午 / 下午 / 晚上（跟在日子后面，或自己出现）
  if (!period) {
    const from = spanEnd >= 0 ? spanEnd : 0
    const found = periodNear(raw, from, 3)
    if (found) {
      period = found.period
      mark(found.start, found.end)
    }
  }

  // ⑥ 钟点：8点 / 20:00 / 8点半 / 下午三点
  if (!clock) {
    const from = spanEnd >= 0 ? spanEnd : 0
    const found = clockCandidates(raw, from, 3, Boolean(period))
    if (found) {
      clock = found
      mark(found.start, found.end)
      if (/^(左右|前后)/.test(raw.slice(found.end, found.end + 2))) {
        approx = true
        mark(found.end, found.end + 2)
      }
      if (/差不多$/.test(raw.slice(Math.max(0, found.start - 3), found.start))) {
        mark(found.start - 3, found.start)
      }
    }
  }

  if (!day && !period && !clock) return null

  const workDay = day || { ...today }
  if (!dayLabel) dayLabel = '今天'

  let fromMs
  let toMs
  let timeLabel = ''
  if (clock) {
    const h0 = clock.h
    const mi = clock.mi
    if (!Number.isFinite(h0) || h0 < 0 || h0 > 23 || !Number.isFinite(mi) || mi < 0 || mi > 59) return null
    const h = period ? hourTo24(h0, period.key) : h0
    if (h < 0 || h > 23) return null
    const center = wallMs(tz, workDay, h, mi, 0)
    fromMs = center - 30 * 60000
    toMs = center + 30 * 60000
    timeLabel = `${pad(h)}:${pad(mi)}${approx ? '左右' : ''}`
  } else if (period) {
    fromMs = wallMs(tz, workDay, period.start, 0, 0)
    toMs = period.end >= 24
      ? wallMs(tz, addDays(workDay, 1), 0, 0, 0)
      : wallMs(tz, workDay, period.end, 0, 0)
    // 「昨晚」本身已经含了晚上，label 不再重复一遍。
    timeLabel = /^(昨晚|今晚|明晚)$/.test(dayLabel) ? '' : period.label
  } else {
    fromMs = wallMs(tz, workDay, 0, 0, 0)
    toMs = wallMs(tz, addDays(workDay, 1), 0, 0, 0)
    timeLabel = ''
  }

  const short = (ms) => {
    const p = partsIn(new Date(ms), tz)
    return `${pad(p.mo)}-${pad(p.d)} ${pad(p.h)}:${pad(p.mi)}`
  }
  const label = `${dayLabel}${timeLabel ? ` ${timeLabel}` : ''}（${short(fromMs)}–${short(toMs)}）`

  const restText = (() => {
    let rest = ''
    let cursor = 0
    for (const seg of [...segments].sort((a, b) => a.start - b.start)) {
      if (seg.start > cursor) rest += raw.slice(cursor, seg.start)
      if (seg.end > cursor) cursor = seg.end
    }
    rest += raw.slice(cursor)
    return rest
  })()
  return {
    from: isoOfMs(fromMs, tz),
    to: isoOfMs(toMs, tz),
    label,
    rest: cleanRest(restText),
  }
}
