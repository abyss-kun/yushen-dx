// 改｜2026-11-24 23:50｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜lib/relations.js:1｜本轮整理提交：该文件在本轮之前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
/* 标签
 * id: lib-relations
 * kind: module
 * summary: 关系账：谁常来、谁欠她一句；桥的 people 只读，她自己补的五个字段写进自己家。
 * audience: 她（人物卡）、外接平台（读同一个文件）、新角色
 * owner: 桥的 people 归桥；她自己补的那份归她（setPersonField 只增不改）
 * mutable: 可改（桥那份永远只读；写桥目录会直接抛错）
 * defaults: 字段：habits / toMe / toOthers / relation / myView（各 ≤80 字）
 * usage: loadPeople/relationsSummary 摘要；setPersonField(role,{who,field,value}) 写她那五个字段；readPersonFields 读回
 * off: 不想要就把 relations/<role>.jsonl 留着不用；桥那份照旧只读
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 关系账：谁常来、谁欠她一句、谁上次让她不痛快。
//
// 数据在桥的 people 文件里（本地只读）；这里只做摘要，不改人家。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { qqBridgeState } from './paths.js'
import { localISO } from './clock.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const BRIDGE_STATE = () => process.env.QQ_BRIDGE_STATE || qqBridgeState()
const ROLE_FILE = { dayu: 'people-大肥鱼.json', xiaoyu: 'people-小肥鱼.json', dragon: 'people-小肥鱼.json' }

function fileFor(role) { return path.join(BRIDGE_STATE(), ROLE_FILE[role] || ROLE_FILE.dayu) }

// ── 她自己的补充字段（2026-11-10 老板：外接平台要有图可看）──
//
// 桥那份 people-*.json 是**别人的账，只读**。老板要的「习惯 / 对谁怎么样 / 对我怎么样 /
// 我们关系怎么样 / 我怎么看她」，桥不写，也不该由我们去改桥的文件。
// 所以另开一份：~/.dsh/dayu/relations/<角色>.jsonl，只增不改（append-only），
// 每行 {at, who, field, value, source}；读的时候按 who+field 取最新一条盖到桥的数据上。
export const PERSON_FIELDS = Object.freeze(['habits', 'toOthers', 'toMe', 'relation', 'myView', 'note', 'caughtMe', 'iOwe', 'keepsake'])
export const PERSON_FIELD_MAX = 80
const KNOWN_ROLES = Object.freeze(Object.keys(ROLE_FILE))
// 防止有人把"她自己的补充"写进桥的文件（那是别人的账，误写就是把桥的数据弄脏）
function personFile(role) {
  const r = String(role || '')
  if (!KNOWN_ROLES.includes(r)) throw new Error(`未知角色：${r}（只允许 ${KNOWN_ROLES.join(' / ')}）`)
  return path.join(homeDir(), 'dayu', 'relations', `${r}.jsonl`)
}
function homeDir() { return process.env.DSH_HOME || path.join(os.homedir(), '.dsh') }
function isInside(child, parent) {
  const a = path.resolve(child)
  const b = path.resolve(parent)
  return a === b || a.startsWith(b + path.sep)
}
function assertNotBridge(file) {
  if (isInside(file, BRIDGE_STATE())) {
    throw new Error(`拒绝写桥的文件（${file}）：那是别人的账，桥那份只读；她自己的补充写 ~/.dsh/dayu/relations/<角色>.jsonl`)
  }
}
function oneField(value) {
  if (Array.isArray(value)) return value.map((x) => String(x || '').trim()).filter(Boolean).join('、').slice(0, PERSON_FIELD_MAX)
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, PERSON_FIELD_MAX)
}

export function readPersonFields(role) {
  const file = personFile(role)
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  return text.split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l) } catch { return null } })
    .filter((r) => r && typeof r === 'object' && r.who && PERSON_FIELDS.includes(r.field))
}

/** 她写的补充：谁 → { field: value }（同 who+field 取最后写入的那条）。 */
function overridesFor(role) {
  const out = new Map()
  for (const row of readPersonFields(role)) {
    const who = String(row.who)
    const bucket = out.get(who) || {}
    bucket[String(row.field)] = oneField(row.value)
    out.set(who, bucket)
  }
  return out
}

/**
 * 写一条她自己的补充字段（只增不改）。
 * @returns {{ok:boolean, role:string, who:string, field:string, value:string, file:string, at:string}}
 */
export function setPersonField(role, { who = '', field = '', value = '', source = '', file = '', at = '' } = {}) {
  const r = String(role || '')
  const target = file || personFile(r)
  assertNotBridge(target)
  const f = String(field || '').trim()
  if (!PERSON_FIELDS.includes(f)) throw new Error(`字段不认识：${f}（只允许 ${PERSON_FIELDS.join(' / ')}）`)
  const w = oneField(who)
  if (!w) throw new Error('写谁的？who 不能为空')
  const v = oneField(value)
  if (!v) throw new Error('写什么？value 不能为空')
  const when = at || localISO()
  const row = { at: when, who: w, field: f, value: v, source: String(source || '').slice(0, 80) }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, JSON.stringify(row) + '\n', 'utf8')
  return { ok: true, role: r, who: w, field: f, value: v, file: target, at: when }
}

/** 容错读：文件可能是 {people:{...}} / 数组 / 键值表。 */
export function loadPeople(role) {
  let doc = null
  try { doc = JSON.parse(fs.readFileSync(fileFor(role), 'utf8')) } catch { return [] }
  const arr = Array.isArray(doc) ? doc : (doc?.people && Array.isArray(doc.people) ? doc.people : Object.entries(doc || {}).map(([k, v]) => ({ id: k, ...(v && typeof v === 'object' ? v : {}) })))
  const extra = overridesFor(role)
  return arr.filter((x) => x && typeof x === 'object').map((p) => {
    const id = String(p.id || p.uid || p.qq || '')
    const name = String(p.name || p.nick || p.card || p.id || '')
    const own = extra.get(id) || extra.get(name) || {}
    return {
      id,
      name,
      tier: String(p.tier || p.level || ''),
      affinity: Number(p.affinity ?? p.score ?? p.favor ?? 0),
      lastSeen: p.lastSeen || p.lastAt || p.last || '',
      // 旧数据只有 note，照样能读；新字段读不到就空
      note: own.note !== undefined ? own.note : oneField(p.note || p.impression || ''),
      habits: own.habits !== undefined ? own.habits : oneField(p.habits || ''),
      toOthers: own.toOthers !== undefined ? own.toOthers : oneField(p.toOthers || ''),
      toMe: own.toMe !== undefined ? own.toMe : oneField(p.toMe || ''),
      relation: own.relation !== undefined ? own.relation : oneField(p.relation || ''),
      myView: own.myView !== undefined ? own.myView : oneField(p.myView || ''),
      // 2026-11-21：关系簿三件——谁接住过我 / 我欠什么 / 哪句话记到现在。
      caughtMe: own.caughtMe !== undefined ? own.caughtMe : oneField(p.caughtMe || ''),
      iOwe: own.iOwe !== undefined ? own.iOwe : oneField(p.iOwe || ''),
      keepsake: own.keepsake !== undefined ? own.keepsake : oneField(p.keepsake || ''),
    }
  })
}

/** 摘要：常来的、最近的、她记着的。 */
export function relationsSummary(role, { top = 5 } = {}) {
  const people = loadPeople(role)
  if (!people.length) return { ok: false, reason: '还没有关系数据（桥那边没跑过）', people: [] }
  const byAffinity = [...people].sort((a, b) => b.affinity - a.affinity).slice(0, top)
  const recent = [...people].filter((p) => p.lastSeen).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 3)
  const noted = people.filter((p) => p.note || p.myView).slice(-3)
  return { ok: true, total: people.length, byAffinity, recent, noted }
}

/** 注入：只报事实，不下判断。 */
export function relationsLine(role) {
  const s = relationsSummary(role)
  if (!s.ok) return ''
  const top = s.byAffinity.map((p) => `${p.name}${p.affinity ? `（${p.affinity}）` : ''}`).join('、')
  // 2026-11-10 老板：「我怎么看她」要能看见一条——不然人物档案只有名字和好感，没有"人"。
  const view = s.noted.find((p) => p.myView)
  const viewLine = view ? `\n你怎么看：${view.name}——${view.myView.slice(0, 40)}。` : ''
  return `## 你认识的人\n${s.total} 个。最熟的：${top}。${viewLine}\n谁值得理、谁不值得，你自己看着办。`
}

// ── 关系状态（2026-11-02 主人：规则、0 成本；只改状态，不写事件） ──
//
// 和上面那份「桥的 people 文件」是两件事：上面是别人的账（只读），这里是**她自己的好感状态**。
// 数据：~/.dsh/dayu/relations/people.jsonl，一行一个状态版本，只增不删。
// 字段：{who, field, value, at, source, supersededBy}（id 是给 supersededBy 指认用的，多带一个）
// 规矩：旧值不删，标 supersededBy 指向新那条；取「最新」= 没有 supersededBy 的那条。
// 先只做「好感」一项；印象/承诺留 TODO（别扩）。
export const REL_FILE = path.join(HOME, 'dayu', 'relations', 'people.jsonl')
export const REL_DEFAULT = 50
export const REL_MIN = 0
export const REL_MAX = 100
const clampRel = (n) => Math.max(REL_MIN, Math.min(REL_MAX, Math.round(Number(n) || 0)))
const relId = (s) => 'rel-' + crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)

export function relationRows() {
  let text = ''
  try { text = fs.readFileSync(REL_FILE, 'utf8') } catch { return [] }
  return text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

/** 取最新状态：同一 who+field 里没有 supersededBy 的那条；没有就 50（卡里说「刚认识是 50」）。 */
export function relationValue(who = '老板', field = '好感') {
  const rows = relationRows().filter((r) => r.who === who && r.field === field)
  const live = rows.filter((r) => !r.supersededBy)
  const last = live.length ? live[live.length - 1] : rows[rows.length - 1]
  return last ? Number(last.value) : REL_DEFAULT
}

/**
 * 改一次状态：旧那行标 supersededBy（不删），再追加一行新值。
 * delta 走加减，value 走直接设；两者给一个。
 */
export function relationState({ who = '老板', field = '好感', delta = 0, value, at = '', source = '' } = {}) {
  const rows = relationRows()
  const live = rows.filter((r) => r.who === who && r.field === field && !r.supersededBy)
  const prev = live.length ? live[live.length - 1] : null
  const base = prev ? Number(prev.value) || 0 : REL_DEFAULT
  const next = clampRel(value === undefined || value === null ? base + Number(delta || 0) : value)
  const when = at || localISO()
  const id = relId(`${who}|${field}|${when}|${next}|${crypto.randomBytes(3).toString('hex')}`)
  fs.mkdirSync(path.dirname(REL_FILE), { recursive: true })
  if (prev) {
    // 旧值不删：整份重写一遍（文件很小），只给它补一个 supersededBy。
    for (const r of rows) if (r === prev) r.supersededBy = id
    fs.writeFileSync(REL_FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  }
  const row = { id, who, field, value: next, at: when, source: String(source || '').slice(0, 80), supersededBy: '' }
  fs.appendFileSync(REL_FILE, JSON.stringify(row) + '\n', 'utf8')
  return { ok: true, who, field, from: base, value: next, delta: next - base, id, file: REL_FILE }
}

// 规则（0 成本，不用模型）：夸 → +2；怼/骂 → -2。判断只在这几个词面，判不准的部分宁可不动。
const PRAISE = /不错|很好|聪明|厉害|干得好|做得好|真棒|靠谱|辛苦了/
const SCOLD = /笨|蠢|傻|废物|没用|垃圾|差劲|滚开|闭嘴|脑子呢|废物点心/

/**
 * 从一句话推一次状态变化（老板对她说的）。没命中就返回 changed:false，一个字都不写。
 * 只认短句（≤120 字）：任务书、规格里也会出现「不错」，那不是夸她。
 */
export function relationAdjust({ who = '老板', text = '', at = '', source = '' } = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t || t.length > 120) return { ok: true, changed: false, reason: '太长或不说话，不算' }
  if (SCOLD.test(t)) return { ok: true, changed: true, ...relationState({ who, delta: -2, at, source }) }
  if (PRAISE.test(t)) return { ok: true, changed: true, ...relationState({ who, delta: 2, at, source }) }
  return { ok: true, changed: false, reason: '没夸也没怼' }
}

