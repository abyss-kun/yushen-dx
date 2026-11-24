// 改｜2026-11-24 23:50｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/bodies.js:1｜本轮整理提交：该文件在本轮之前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-bodies
 * kind: module
 * summary: 分身登记：哪条会话是哪个角色的分身、从哪个通道来、什么时候；投递时自动记，加载卡时认凭据。
 * tags: 分身, 会话登记, 自动记录, 凭据
 * created: 2026-11-11 01:05:00
 * changed: 2026-11-13 22:45:00
 * author: 大鱼·工作台（凭据：老板 2026-11-13「加载了大鱼或谁，就给这个会话备注上是谁」）
 * authority: 老板（2026-11-11：说明要有格式；2026-11-13：凭据按卡认）
 * audience: 她、宿主适配层、面板、维护者
 * owner: 框架；登记口径（什么算一个分身）要老板点头
 * mutable: 可改；**投递时自动登记**不许改成"谁记得谁写"
 * usage: registerBody(投递记一笔) / claimBody(认凭据) / claimOf(会话→角色) / roleFromCardText(卡→角色)
 * why: 反复在"提过但没登记"上栽跟头——靠人记就会漏；而认人又只认 residence 那一条身体
 * result: 一份自动登记的分身表 + 一张会话凭据（加载了谁的卡，这条会话就是谁）
 */
// 分身登记：哪条会话是哪个角色的分身、从哪个通道来的、什么时候。
//
// 为什么要有：这些天反复在"提过但没登记"上栽跟头。登记不能靠谁记得写，
// 每次投递（工作台说一句、QQ 桥转过来、群聊回一句）都自动记一笔。
//
// 2026-11-13 补：老板定了——「加载了大鱼或谁，就给这个会话备注上是谁」。
// 于是这里多两个读口：claimBody（写凭据）与 claimOf（查这条会话认的是谁）。
// 认人顺序在 store.mjs / transcript.js：先 residence 当前身体，再这张凭据；都查不到就是空（不猜）。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { listCharacters } from './characters.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const FILE = path.join(HOME, 'dayu', 'bodies.json')
const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch { return false }
}

/** 记一具分身（幂等：同一条会话只更新时间和通道）。投递时自动调，不改凭据。 */
export function registerBody({ role = '', sessionId = '', channel = '', now = Date.now() } = {}) {
  const r = String(role || '').trim()
  const sid = String(sessionId || '').trim()
  if (!r || !sid) return null
  const doc = readJson(FILE, { version: 1, roles: {} })
  const row = doc.roles[r] && typeof doc.roles[r] === 'object' ? doc.roles[r] : {}
  const prev = row[sid] || {}
  row[sid] = {
    channel: String(channel || prev.channel || '未知').slice(0, 20),
    firstAt: prev.firstAt || new Date(now).toISOString(),
    lastAt: new Date(now).toISOString(),
    count: (Number(prev.count) || 0) + 1,
  }
  doc.roles[r] = row
  writeJson(FILE, doc)
  return row[sid]
}

/**
 * 认凭据：把一条会话认成某个角色的分身（加载角色卡 / 老板点名时写）。
 * 已经认过别人就不覆盖——返回 { ok:false, reason:'claimed-as', role }，让调用方记下来，不是默默改。
 * @returns {{ok:boolean, role?:string, sessionId?:string, reason?:string, row?:object}}
 */
export function claimBody({ role = '', sessionId = '', source = '', evidence = '', channel = '加载卡', now = Date.now() } = {}) {
  const r = String(role || '').trim()
  const sid = String(sessionId || '').trim()
  if (!r || !sid) return { ok: false, reason: 'missing-role-or-session' }
  if (!ID_RE.test(r)) return { ok: false, reason: 'bad-role' }
  const doc = readJson(FILE, { version: 1, roles: {} })
  for (const [other, row] of Object.entries(doc.roles || {})) {
    if (other !== r && row && row[sid]) return { ok: false, reason: 'claimed-as', role: other, sessionId: sid }
  }
  const row = doc.roles[r] && typeof doc.roles[r] === 'object' ? doc.roles[r] : {}
  const prev = row[sid] || {}
  row[sid] = {
    ...prev,
    channel: String(channel || prev.channel || '加载卡').slice(0, 20),
    firstAt: prev.firstAt || new Date(now).toISOString(),
    lastAt: new Date(now).toISOString(),
    count: (Number(prev.count) || 0) + 1,
    source: String(source || prev.source || '').slice(0, 40),
    evidence: String(evidence || prev.evidence || '').slice(0, 300),
  }
  doc.roles[r] = row
  const ok = writeJson(FILE, doc)
  return ok ? { ok: true, role: r, sessionId: sid, row: row[sid] } : { ok: false, reason: 'write-failed' }
}

/** 这条会话认的是谁；没有凭据返回 ''（不猜）。 */
export function claimOf(sessionId, { home = HOME } = {}) {
  const sid = String(sessionId || '').trim()
  if (!sid) return ''
  const doc = readJson(path.join(home, 'dayu', 'bodies.json'), null)
  for (const [role, row] of Object.entries(doc?.roles || {})) {
    if (row && row[sid]) return role
  }
  return ''
}

/**
 * 从一段「注入进上下文的说明/卡」里认出是谁的卡；认不出返回 ''。
 * 认法只读名册（名字/小名），不认正文自称：卡头 `# 角色卡：大鱼（阿鲲）`、
 * 或注入头 `## 你是谁（大鱼 · 本体卡）`。
 */
export function roleFromCardText(text) {
  const s = String(text || '')
  const names = new Set()
  const m1 = s.match(/# 角色卡：\s*([^\n（(]+)/)
  if (m1) names.add(m1[1].trim())
  const m2 = s.match(/## 你是谁（([^）\n]+?)本体卡/)
  if (m2) names.add(m2[1].trim().split(/[·・|｜:：]/)[0].trim())
  if (!names.size) return ''
  let list = []
  try { list = listCharacters() } catch { return '' }
  for (const c of list) {
    const keys = [c.name, c.alias].filter(Boolean).map((x) => String(x).trim())
    for (const n of names) if (keys.includes(n)) return c.id
  }
  return ''
}
