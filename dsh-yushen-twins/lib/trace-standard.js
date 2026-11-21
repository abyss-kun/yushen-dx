/* 标签
 * id: lib-trace-standard
 * kind: module
 * summary: 改动留痕的单一真源
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: parseTrace / commentBlocks / inspectTraceText（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 14:50｜大鱼·子会话（工作台）｜授权：主人（本次任务书：把「有案可稽」落成可自动检查的规矩）｜lib/trace-standard.js:1-130｜新增：六要素的单一真源（FIELDS / parseTrace / inspectTraceText / RULE_SINCE），文档与检查脚本共用这一份｜为什么：留痕格式以前只写在 docs/改动留痕.md 里，没人能机器查；脚本各抄一份正则，迟早漂成两种格式｜验证：node scripts/check-trace.mjs --files lib/trace-standard.js 退出 0；scripts/regression.mjs 里断言 FIELDS≥6、parseTrace 能认出缺项｜可改：字段只增不删；加字段要同时改 docs/改动留痕.md 与 scripts/regression.mjs 的断言
//
// 改动留痕的单一真源。
//
// 为什么要有这份（2026-11-02 老板立）：「有案可稽」不能只是文档里的一句话——
// 文档讲人话，这里出机器判据，scripts/check-trace.mjs 只负责找文件、报缺项。
// 谁要改格式，先改这里，再改文档与回归；不许在脚本里另抄一份正则。
//
// 一行留痕长这样（贴在被改的那段代码上方，或文件头）：
//   改｜2026-11-02 14:50｜大鱼·子会话｜授权：主人（本次任务书）｜lib/x.js:12-18｜做了什么｜为什么：…｜验证：…｜可改：…
//
// 六要素：谁 by / 何时 at / 何地 where / 何因 why / 谁要求 auth / 怎么验 evidence。
// 两条附注：改了什么 what、以后还能不能改 mutable（建议写，缺了不算漏）。

/** 一行的开头。grep 认它，解析也认它。 */
export const TRACE_MARK = '改｜'

/**
 * 规矩生效时刻（2026-11-02 老板立）。
 * 检查脚本只判「这一刻之后还动过」的文件；之前的提交不追溯——
 * 给没留痕的老改动补六要素，只能编「谁/为什么/怎么验」，那是假账，不如不补。
 */
export const RULE_SINCE = '2026-11-02T14:50:00+08:00'
export const RULE_SINCE_MS = Date.parse(RULE_SINCE)

/** 日期（可带时分秒）。 */
const DATE_RE = /20\d{2}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?/
/** 位置：文件:行（可带行段）。 */
const WHERE_RE = /([A-Za-z0-9_@./\\-]+\.(?:js|mjs|cjs|ts|tsx|json|jsonl|md|ya?ml|ps1|sh|html?|css|py))[：:](\d+)(?:-(\d+))?/
/** 带标签的段：授权：… / 为什么：… / 验证：… / 可改：… */
const LABELED_RE = /^(?:授权|谁要求|为什么|何因|原因|验证|怎么验|怎么验证|证据|可改|改了什么|做了什么)[：:]/

/** 键、人话标签、是否必填、写给谁看、校验用的正则。 */
export const FIELDS = Object.freeze([
  Object.freeze({ key: 'by', label: '谁', required: true, hint: '角色·通道，例如「大鱼·工作台」', pattern: /^[^｜\n：:]{2,60}$/, test: (v) => Boolean(v) && v !== '?' && v.length >= 2 }),
  Object.freeze({ key: 'at', label: '何时', required: true, hint: '日期，最好带时分：2026-11-02 14:50', pattern: DATE_RE, test: (v) => DATE_RE.test(v) }),
  Object.freeze({ key: 'where', label: '何地', required: true, hint: '文件:行，例如 lib/x.js:12-18', pattern: WHERE_RE, test: (v) => WHERE_RE.test(v) }),
  Object.freeze({ key: 'why', label: '何因', required: true, hint: '为什么：不改会怎样', pattern: /为什么[：:]\s*\S/, test: (v) => v.length >= 4 }),
  Object.freeze({ key: 'auth', label: '谁要求', required: true, hint: '授权：主人 / 自己 / 某员工（说清哪一次）', pattern: /授权[：:]\s*\S/, test: (v) => v.length >= 2 }),
  Object.freeze({ key: 'evidence', label: '怎么验', required: true, hint: '验证：跑过什么、结果如何', pattern: /(?:验证|怎么验|证据)[：:]\s*\S/, test: (v) => v.length >= 4 }),
  Object.freeze({ key: 'what', label: '改了什么', required: false, hint: '一句话说清动了哪段', pattern: /^[^｜\n：:]{2,120}$/, test: (v) => v.length >= 2 }),
  Object.freeze({ key: 'mutable', label: '以后还能不能改', required: false, hint: '可改：可改 / 需老板点头 / 不可改', pattern: /可改[：:]\s*\S/, test: (v) => v.length >= 1 }),
])

/** 真正一条不能少的六项。 */
export const REQUIRED_FIELDS = Object.freeze(FIELDS.filter((f) => f.required))

/** 人看的格式（文档里也贴这一行，不另写）。 */
export const FORMAT = '改｜<何时>｜<谁>｜授权：<谁要求>｜<文件:行>｜<改了什么>｜为什么：<何因>｜验证：<怎么验>｜可改：<以后还能不能改>'

/** 把注释记号剥掉：// 、/* 、* 、*\/，多行接成一段。 */
function stripComments(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line
      .replace(/^\s*\/\/\s?/, '')
      .replace(/^\s*\/\*+\s?/, '')
      .replace(/\*\/\s*$/, '')
      .replace(/^\s*\*\s?/, '')
      .trim())
    .filter(Boolean)
    .join('\n')
}

/** 取「标签：值」里的值；没有就返回空串。 */
function pick(text, re) {
  const m = String(text || '').match(re)
  return m ? m[1].trim().replace(/[。；;，,]\s*$/, '') : ''
}

/**
 * 解析一行（或一段）留痕。
 * 返回 { ok, fields, missing, raw }：ok = 六要素齐；missing = 缺哪几个标签。
 * 缺一项也照样把解析到的字段带回来，好让人知道「差在哪」。
 */
export function parseTrace(line = '') {
  const raw = String(line || '')
  const text = stripComments(raw)
  const missingAll = { ok: false, fields: {}, missing: REQUIRED_FIELDS.map((f) => f.label), raw }
  const markAt = text.indexOf(TRACE_MARK)
  if (markAt < 0) return missingAll

  const tail = text.slice(markAt + TRACE_MARK.length)
  const segments = tail.split('｜').map((s) => s.trim()).filter(Boolean)
  const fields = {}

  fields.at = pick(tail, /(20\d{2}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)/)
  const atIdx = segments.findIndex((s) => /^20\d{2}-\d{2}-\d{2}/.test(s))
  fields.by = atIdx >= 0 && segments[atIdx + 1] && !LABELED_RE.test(segments[atIdx + 1])
    ? segments[atIdx + 1].replace(/[。；;]\s*$/, '')
    : ''

  const whereSeg = segments.find((s) => WHERE_RE.test(s))
  const wm = (whereSeg || '').match(WHERE_RE)
  fields.where = wm ? `${wm[1]}:${wm[2]}${wm[3] ? `-${wm[3]}` : ''}` : ''

  fields.auth = pick(tail, /(?:授权|谁要求)[：:]\s*([^｜\n]+)/)
  fields.why = pick(tail, /(?:为什么|何因|原因)[：:]\s*([^｜\n]+)/)
  fields.evidence = pick(tail, /(?:验证|怎么验|怎么验证|证据)[：:]\s*([^｜\n]+)/)
  fields.mutable = pick(tail, /可改[：:]\s*([^｜\n]+)/)

  fields.what = pick(tail, /(?:改了什么|做了什么)[：:]\s*([^｜\n]+)/)
  if (!fields.what) {
    const wi = segments.findIndex((s) => WHERE_RE.test(s))
    if (wi >= 0) {
      const rest = segments.slice(wi + 1).filter((s) => !LABELED_RE.test(s))
      if (rest.length) fields.what = rest[0].replace(/[。；;]\s*$/, '')
    }
  }

  const missing = REQUIRED_FIELDS.filter((f) => !f.test(fields[f.key] || '')).map((f) => f.label)
  return { ok: missing.length === 0, fields, missing, raw }
}

/**
 * 把文件里的注释块切出来（连续的 // 算一块；/* … *\/ 算一块）。
 * 只认注释，不认代码字符串里的「改｜」，免得把日志文案当成留痕。
 */
export function commentBlocks(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const blocks = []
  let cur = []
  let inBlock = false
  const flush = () => { if (cur.length) { blocks.push(cur.join('\n')); cur = [] } }
  for (const line of lines) {
    const t = line.trim()
    if (inBlock) {
      cur.push(t)
      if (t.includes('*/')) { inBlock = false; flush() }
      continue
    }
    if (t.startsWith('/*')) {
      inBlock = true
      cur.push(t)
      if (t.includes('*/')) { inBlock = false; flush() }
      continue
    }
    if (t.startsWith('//')) { cur.push(t); continue }
    flush()
  }
  flush()
  return blocks
}

/**
 * 在一个文件的全文里找留痕：只要有一块注释六要素齐，就算这个文件有留痕。
 * 没有时返回“最接近的一条”的缺项，好告诉人差什么；一条都没有就报全缺。
 */
export function inspectTraceText(text) {
  const blocks = commentBlocks(text).filter((b) => b.includes(TRACE_MARK))
  if (!blocks.length) {
    return { ok: false, fields: {}, missing: REQUIRED_FIELDS.map((f) => f.label), raw: '', candidates: 0 }
  }
  let best = null
  for (const block of blocks) {
    const parsed = parseTrace(block)
    if (parsed.ok) return { ...parsed, candidates: blocks.length }
    if (!best || parsed.missing.length < best.missing.length) best = parsed
  }
  return { ...best, candidates: blocks.length }
}
