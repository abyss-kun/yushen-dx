// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜lib/now-page.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: lib-now-page
 * kind: module
 * summary: 一页“现在”：手上在做什么、别处谁还在做、答应谁什么、最近三条决定、家里有什么、一行心情。
 * tags: 注入, 现在, 议程, 承诺, 决定, worklog
 * created: 2026-11-21 19:4x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：一页现在，换会话第一句就能接上；2026-11-24：看不见别的会话在做什么）
 * audience: 注入
 * owner: 框架；只读，不写任何账
 * usage: buildNowPage(role,{maxChars,task,sessionId}) → 一页现在（≤320 字）
 * why: 换会话/隔几天回来，先要看到“现在”，不是从检索里猜；也要看见别处正在做的临时活
 * result: ≤320 字；没数据就写“没有”，不编；读不到不报错（新装机先说“没有欠着的”）
 * mutable: 可改；只读，不写任何账
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readDefinitions } from './definitions.js'
import { moodOf, moodWord } from './mood.js'
import { readAgenda } from './agenda.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

function agendaLine(role) {
  try {
    const items = readAgenda(role).items || []
    const routine = /^(每天|每日|日常)/
    const doing = items.filter((i) => i.state === 'doing')
      .map((i) => String(i.what || '').trim())
      .filter((w) => w && !routine.test(w))
    const blocked = items.filter((i) => i.state === 'blocked').map((i) => String(i.what || '').trim()).filter(Boolean)
    if (doing.length) return `手上：${doing.slice(0, 2).join('；')}`
    if (blocked.length) return `手上：卡在 ${blocked[0]}`
    if (items.some((i) => i.state === 'doing')) return '手上：没有在做的（日常照旧）'
    return '手上：没有在做的'
  } catch { return '手上：读不到议程' }
}

function promiseLine() {
  try {
    const rows = fs.readFileSync(path.join(DATA, 'relations', 'promises.jsonl'), 'utf8')
      .split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
      .filter((r) => String(r.status || '') === 'open')
    if (!rows.length) return '答应：没有欠着的'
    const last = rows.slice(-2).map((r) => String(r.what || '').replace(/\s+/g, ' ').slice(0, 36))
    return `答应：${last.join('；')}`
  } catch {
    // 2026-11-24 老板：新装机不该被“读不到承诺账”吓一跳——还没记账就是没欠着。
    return '答应：没有欠着的'
  }
}

function decideLine() {
  try {
    const rows = readDefinitions({ limit: 3 })
    if (!rows.length) return '决定：还没有记下的'
    return `决定：${rows.map((r) => String(r.text || '').replace(/\s+/g, ' ').slice(0, 40)).join('；')}`
  } catch { return '决定：读不到' }
}

function homeLine() {
  try {
    const cap = readJson(path.join(DATA, 'capmap.json'), null)
    const n = Array.isArray(cap?.items) ? cap.items.length : 0
    return n ? `家里：${n} 条，见 家里有什么.md` : '家里：清单还没生成'
  } catch { return '家里：读不到清单' }
}

function moodLineSafe(role) {
  try {
    const v = moodOf(role)
    return `心情：${moodWord(v)}`
  } catch { return '心情：读不到' }
}

const WORKLOG = path.join(DATA, 'worklog.jsonl')
const ELSEWHERE_WINDOW_MS = 6 * 60 * 60 * 1000

/**
 * 别处：别的会话最近在做、还没写进议程的临时活。
 * 2026-11-24 老板：换会话就看不到别人正在做什么，只能等写进议程才知道。
 * 源：~/.dsh/dayu/worklog.jsonl（一行一条，kind='change'）最后 80 行；6 小时内、不是本会话、最新一条。
 * 没有就返回空串（这一行整行不出现）——不编“暂无”。
 */
function elsewhereLine(sessionId = '', now = Date.now()) {
  try {
    const me = String(sessionId || '')
    // 不知道“我是谁”就不显示别人的事：宁可少一行，不把本会话自己当成“别处”。
    if (!me) return ''
    const lines = fs.readFileSync(WORKLOG, 'utf8').split(/\r?\n/).filter(Boolean).slice(-80)
    let what = ''
    let at = 0
    for (const line of lines) {
      let row = null
      try { row = JSON.parse(line) } catch { continue }
      if (!row || String(row.kind || '') !== 'change') continue
      if (String(row.session || '') === me) continue
      const text = String(row.what || '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      const t = Date.parse(String(row.at || ''))
      if (!Number.isFinite(t)) continue
      const age = now - t
      if (age < 0 || age > ELSEWHERE_WINDOW_MS) continue
      // 文件是按时间追加的，最后一条命中即最新；仍然比较一次时间，防乱序。
      if (t >= at) { at = t; what = text }
    }
    if (!what) return ''
    const mins = Math.max(0, Math.round((now - at) / 60000))
    return `别处：${what.slice(0, 40)}（${mins} 分钟前）`
  } catch { return '' }
}

/** 一页“现在”。总长≤320 字，按行截断。task 命中定义话题时不再重复“决定”（长期决定块会出）。 */
export function buildNowPage(role = 'dayu', { maxChars = 320, task = '', sessionId = '' } = {}) {
  const defTopic = /图书馆|记忆|插件|软件|档案|项目|定义|重复造轮子/.test(String(task || ''))
  const elsewhere = elsewhereLine(sessionId)
  const lines = [
    '## 现在（一页，别忘）',
    `- ${agendaLine(role)}`,
    ...(elsewhere ? [`- ${elsewhere}`] : []),
    `- ${promiseLine()}`,
    ...(defTopic ? [] : [`- ${decideLine()}`]),
    `- ${homeLine()}`,
    `- ${moodLineSafe(role)}`,
  ]
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, Math.max(0, maxChars - 1))}…`
  return out
}
