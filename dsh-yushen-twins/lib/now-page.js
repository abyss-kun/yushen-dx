/* 标签
 * id: lib-now-page
 * kind: module
 * summary: 一页“现在”：手上在做什么、答应谁什么、最近三条决定、家里有什么、一行心情。
 * tags: 注入, 现在, 议程, 承诺, 决定
 * created: 2026-11-21 19:4x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：一页现在，换会话第一句就能接上）
 * audience: 注入
 * owner: 框架；只读，不写任何账
 * usage: buildNowPage(role,{maxChars}) → 一页现在（≤320 字）
 * why: 换会话/隔几天回来，先要看到“现在”，不是从检索里猜
 * result: ≤320 字；没数据就写“没有”，不编；读不到不报错
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
  } catch { return '答应：读不到承诺账' }
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

/** 一页“现在”。总长≤320 字，按行截断。task 命中定义话题时不再重复“决定”（长期决定块会出）。 */
export function buildNowPage(role = 'dayu', { maxChars = 320, task = '' } = {}) {
  const defTopic = /图书馆|记忆|插件|软件|档案|项目|定义|重复造轮子/.test(String(task || ''))
  const lines = [
    '## 现在（一页，别忘）',
    `- ${agendaLine(role)}`,
    `- ${promiseLine()}`,
    ...(defTopic ? [] : [`- ${decideLine()}`]),
    `- ${homeLine()}`,
    `- ${moodLineSafe(role)}`,
  ]
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, Math.max(0, maxChars - 1))}…`
  return out
}
