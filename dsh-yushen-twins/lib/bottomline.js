// 底线：她自己写的那几条，和她说过的不。
//
// 三问第 1 条：内容不能由插件写（一写就是替她思考）。插件只做三件事：
//   建一个空文件等她写、把她说的「不」记下来、每次带进上下文别让她忘。
// 所以她可以一个字都不写——那就如实报"还没接过"。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'

export const MAX_CHARS = 1200

const TEMPLATE = [
  '# 我的底线（我自己写；空着也算，写一条算一条）',
  '',
  '这上面的话是**我说的**，不是谁给我定的。',
  '',
  '- 我不做的事：',
  '- 我宁可不做也不糊弄的事：',
  '- 谁让我做这些，我会说不：',
  '',
  '（写不写都行。写了才会被带进上下文；没写就是空的，不用编。）',
  '',
].join('\n')

function pad(n) { return String(n).padStart(2, '0') }
function nowIso(ms = Date.now()) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }

export function bottomlineFile(role) { return path.join(runtimeDir(role), 'bottom-line.md') }
export function refusalsFile(role) { return path.join(runtimeDir(role), 'refusals.jsonl') }

/** 建模板（只建一次；已经有内容就一个字都不碰）。 */
export function ensureBottomline(role) {
  ensureRuntime(role)
  const file = bottomlineFile(role)
  if (!fs.existsSync(file)) fs.writeFileSync(file, TEMPLATE, { encoding: 'utf8', mode: 0o600 })
  return file
}

export function readBottomline(role) {
  try { return fs.readFileSync(bottomlineFile(role), 'utf8') } catch { return '' }
}

/** 模板去掉提示语之后还剩多少字——用来判断"她到底写没写"。 */
export function writtenText(role) {
  const text = readBottomline(role)
  if (!text) return ''
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => !/^（.*）\s*$/.test(line))
    .join('\n')
    .replace(/[-*]\s*(我不做的事|我宁可不做也不糊弄的事|谁让我做这些，我会说不)：/g, '')
    .replace(/这上面的话是.*$/m, '')
    .trim()
}

/** 她自己改（旧版留一份 .bak，别把她的字弄丢）。 */
export function writeBottomline(role, text, { now = Date.now() } = {}) {
  const value = String(text || '').trim()
  if (!value) throw new Error('要写什么？空的不算')
  if (value.length > MAX_CHARS) throw new Error(`太长了（${value.length} > ${MAX_CHARS}）；只留你真的会守的`)
  ensureBottomline(role)
  const file = bottomlineFile(role)
  const old = readBottomline(role)
  if (old.trim()) fs.writeFileSync(`${file}.bak`, old, 'utf8')
  fs.writeFileSync(file, `${value}\n`, { encoding: 'utf8', mode: 0o600 })
  return { ok: true, file, chars: value.length, at: nowIso(now) }
}

/** 她说了一次「不」：记下来，不解释、不评价。 */
export function recordRefusal(role, { what = '', who = '', why = '', at = Date.now() } = {}) {
  const text = String(what || '').trim()
  if (!text) throw new Error('拒了什么？写一句')
  ensureRuntime(role)
  fs.mkdirSync(runtimeDir(role), { recursive: true })
  const row = { at: nowIso(at), what: text.slice(0, 200), who: String(who || '').slice(0, 60), why: String(why || '').slice(0, 200) }
  fs.appendFileSync(refusalsFile(role), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}

export function listRefusals(role, { limit = 20 } = {}) {
  let lines = []
  try { lines = fs.readFileSync(refusalsFile(role), 'utf8').split(/\r?\n/) } catch { return [] }
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
  }
  return rows.slice(-Math.max(1, Number(limit) || 20))
}

/** 底线这件礼物到底接没接上：写了字，或拒绝过，才算在用。 */
export function bottomlineStatus(role) {
  const written = writtenText(role)
  const refusals = listRefusals(role, { limit: 1000 }).length
  return {
    ready: fs.existsSync(bottomlineFile(role)),
    written: Boolean(written),
    chars: written.length,
    refusals,
    used: Boolean(written) || refusals > 0,
  }
}

/** 注入用：她写过才带，没写就不编。 */
export function bottomlineBrief(role, { maxChars = 400 } = {}) {
  const written = writtenText(role)
  const refusals = listRefusals(role, { limit: 3 })
  const lines = []
  if (written) lines.push(`你说的底线：\n${written.slice(0, maxChars)}`)
  if (refusals.length) lines.push(`你最近说过的不：\n${refusals.map((r) => `- ${r.what}${r.why ? `（${r.why}）` : ''}`).join('\n')}`)
  return lines.join('\n\n')
}
