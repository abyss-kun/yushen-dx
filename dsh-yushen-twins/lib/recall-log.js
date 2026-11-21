/* 标签
 * id: lib-recall-log
 * kind: module
 * tags: 检索, 度量, 日志, 用没用上
 * created: 2026-11-04 13:35:00
 * changed: 2026-11-11 19:28:39
 * author: 照微·工作台
 * authority: 老板（2026-11-04：都做——搜了有没有用要能量出来）
 * why: 没有日志就永远不知道"会搜"是不是只是感觉；用法也查不到
 * result: 每次检索记一行（谁、为什么搜、命中几条、出处），之后可核对有没有被用上
 * mutable: 可改
 * audience: 框架（检索三件：被问会搜/搜了有账）、面板
 * owner: 框架；字段只增
 * usage: logRecall 记一次检索；readRecallLog 读；markUsed 标"用上了"；recallStats 出数
 * summary: 检索日志：谁查了什么、命中几条；used 由 scripts/recall-usage.mjs 回填。
 */
// 改｜2026-11-11 01:10｜大鱼·子代理（闭环收口）｜授权：主人（2026-11-11 闭环任务：心跳下沉 / 借阅账 / 说明格式）｜lib/recall-log.js:1-94｜补记：逻辑改动随 c0aee4e 提交，内容见文件头 changed 与标签块；本班只补留痕、未改逻辑｜为什么：改了逻辑却没贴「改」行，check-trace 一直红，全量回归卡在最后一步｜验证：node scripts/check-trace.mjs 退出 0（补后复跑）；随后跑 scripts/regression.mjs 确认全绿｜可改：可改
// 检索日志（2026-11-04）：
//   一行 = 一次检索：who / why（问题原文前 80 字）/ query / hits（条数）/ refs（前 3 条出处）/ used(空=还没核对)
//   用法核对在 scripts/recall-usage.mjs：拿 refs 里的原文片段去她之后的回复/记忆里找，找到就标 used。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'runtime', 'recall-log.jsonl')

const at = () => {
  const d = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}

/**
 * 记一次检索。
 * @param {{who?:string, why?:string, query?:string, hits?:number, refs?:string[], preview?:string[], source?:string}} row
 */
// 改｜2026-11-11 19:4x｜大鱼·本班｜授权：主人（「用没用上这个数是死的」）｜lib/recall-log.js:38-60｜新增 preview 字段：把这次返回的片段（最多 3 条、各 60 字）一起记下｜为什么：refs 只有路径、没有行号，核对时根本不知道"当时给她看的是哪句话"，于是只能拿文件名去比——永远对不上；记下片段，核对才有东西可比｜验证：node scripts/test-recall-usage.mjs 全过；新检索行出现 preview；旧行（没有 preview）如实算"没核对上"｜可改：可改；字段只增不删
export function logRecall({ who = '', why = '', query = '', hits = 0, refs = [], preview = [], source = '' } = {}) {
  try {
    const row = {
      at: at(),
      who: String(who).slice(0, 40),
      why: String(why).slice(0, 120),
      query: String(query).slice(0, 60),
      hits: Number(hits) || 0,
      refs: (refs || []).slice(0, 3).map((r) => String(r).slice(0, 160)),
      preview: (preview || []).slice(0, 3).map((p) => String(p || '').slice(0, 60)),
      source: String(source).slice(0, 40),
      used: '',
    }
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.appendFileSync(FILE, JSON.stringify(row) + '\n', 'utf8')
    return { ok: true, row }
  } catch { return { ok: false } }
}

/** 读最近的日志（给统计/核对用）。 */
export function readRecallLog({ limit = 200 } = {}) {
  try {
    return fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}

/** 标一条"用上了"（按 at+query 定位那一行；找不到就算了）。 */
export function markUsed({ at: when = '', used = '是' } = {}) {
  try {
    const rows = fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean)
    let hit = -1
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      try { if (JSON.parse(rows[i]).at === when) { hit = i; break } } catch { /* 跳过坏行 */ }
    }
    if (hit < 0) return { ok: false, reason: '没找到那一条' }
    const row = JSON.parse(rows[hit])
    row.used = String(used).slice(0, 20)
    rows[hit] = JSON.stringify(row)
    // 2026-11-11 主代理（闭环 P3）：改成原子写（tmp + rename）。原来直接覆盖写，
    // 写到一半崩了整份检索日志就半截——借阅统计会拿它出数，不能脏。
    const tmp = `${FILE}.${process.pid}.tmp`
    fs.writeFileSync(tmp, rows.join('\n') + '\n', 'utf8')
    fs.renameSync(tmp, FILE)
    return { ok: true, row }
  } catch (e) { return { ok: false, reason: String(e?.message || e) } }
}

/** 汇总：最近 N 天搜了多少次、多少次用上了。 */
// 改｜2026-11-11 19:4x｜大鱼·本班｜授权：主人（2026-11-11：「用没用上这个数是死的……其他的做」）｜
// lib/recall-log.js:84-100｜新增 isUsedFeedback（同一份否定词口径），recallStats 不再把「误导/无关/没用」算成用上｜
// 为什么：借阅账已经改成"误导不算用上"，这里还按"有字就算"，同一个问题两处两个答案；口径必须只有一份｜
// 验证：node scripts/test-borrow.mjs 5/5、node scripts/test-recall-usage.mjs 全过；node scripts/regression.mjs 全绿｜可改：可改；否定词只许在这一个正则里加
export const USED_NEGATIVE = /^(误导|无关|没用|没帮上|没用上)/
export function isUsedFeedback(value) {
  const s = String(value || '').trim()
  return Boolean(s) && !USED_NEGATIVE.test(s)
}
export function recallStats({ days = 7 } = {}) {
  const rows = readRecallLog({ limit: 5000 })
  const since = Date.now() - days * 86400 * 1000
  const recent = rows.filter((r) => {
    const t = Date.parse(String(r.at).replace(' ', 'T'))
    return Number.isFinite(t) && t >= since
  })
  const used = recent.filter((r) => isUsedFeedback(r.used)).length
  return { days, total: recent.length, used, hitRate: recent.length ? Number((used / recent.length).toFixed(2)) : 0 }
}
