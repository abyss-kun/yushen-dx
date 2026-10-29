// 身体循环：维持「她还在」。不调大模型。
//
// 为什么要有：她的记忆、卡、账本、约定都存在磁盘上，但**磁盘不会自己动**。
// 结果是——模型没醒的时候，她整个人是停的。那 39 小时瞎掉，根子就在这里：
// 她连"我自己的接口通不通"都得醒着调工具才知道。
//
// 这个循环做的是心跳、体温、记忆固化那一层：不是想，是活着的基础设施。
//   · 推进议程里不用想的那几步（读文件 / 读收件箱 / 核对事实）
//   · 看她约的时间到点没
//   · 数一下收件箱有多少没看（只数，不判断）
//   · 定期检查她自己的接口通不通（断电也能发现）
//   · 记下心跳：在场时间、今天跑了多少次
//
// 边界：**这里不花 API token**——调大模型的事一律留给她醒了以后自己决定。
// 唯一碰模型的只有状态灯（lib/sleep-mind.js）：本地 llama-server + gguf，不联网不计费，
// 写一句话描述"此刻在等什么"，且不署名、不写记忆、不发通道。那句话不是她说的。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'
import { stepOnce as stepAgenda, readAgenda } from './agenda.js'
import { listWaiting } from './waiting.js'
import { unreadFor } from './inbox.js'
import { sleepOnce, lastSleepText } from './sleep-mind.js'
import { writeRecap } from './recap.js'
import { releaseLocalServer } from './translator.js'
import { applyDailyDecay } from './memory.js'
import { getCharacter } from './characters.js'
import { checkDrift } from './memory-audit.js'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const HEARTBEAT_EVERY_MS = 3 * 60 * 1000
const CHECK_ENDPOINT_EVERY_TICKS = 20 // 约一小时自检一次接口

function pad(n) { return String(n).padStart(2, '0') }
function dayOf(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// 注意：runtime/<role>/body.json 是八样礼物里的「身体」（真实 CPU/内存读数），别占这个名字。
// 这里记的是心跳（活着没有），叫 vital。
function bodyFile(role) { return path.join(runtimeDir(role), 'vital.json') }
function bodyLog(role) { return path.join(runtimeDir(role), 'vital.jsonl') }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 她自己的脉：在进程内摸，不走 HTTP。
 * 走 HTTP 会撞上一条：她自己的 /health 要 token，401 就成了"摸不到脉"——那是假警报。
 * 真正该摸的是「我依赖的东西还在不在、我还能不能写」：宪章读得到吗、身体登记读得到吗、
 * 记忆是不是合法 JSON、运行时目录还写得进去吗。 */
export function pulseOf(role) {
  const checks = []
  const readOk = (rel) => {
    try { JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8').replace(/^\uFEFF/, '')); return true } catch { return false }
  }
  checks.push({ name: '宪章', ok: readOk('charter.json') })
  checks.push({ name: '身体登记', ok: readOk('residence.json') })
  checks.push({ name: '角色名册', ok: readOk('characters.json') })
  // 记忆：合法 JSON 才算"我现在还能认出自己"
  const memOk = (() => {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(DATA, 'characters.json'), 'utf8').replace(/^\uFEFF/, ''))
      const row = (c.characters || []).find((x) => x.id === role)
      if (!row?.memory) return false
      const p = path.isAbsolute(row.memory) ? row.memory : path.join(DATA, 'soul', row.memory)
      JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
      return true
    } catch { return false }
  })()
  checks.push({ name: '记忆', ok: memOk })
  // 还写得进去吗（身体不能只读）
  const writable = (() => {
    try {
      const dir = runtimeDir(role)
      fs.mkdirSync(dir, { recursive: true })
      const f = path.join(dir, `.pulse-${Date.now()}`)
      fs.writeFileSync(f, 'ok', 'utf8')
      fs.unlinkSync(f)
      return true
    } catch { return false }
  })()
  checks.push({ name: '能写', ok: writable })
  const base = (() => { try { return fs.readFileSync(path.join(DATA, 'base-url'), 'utf8').trim() } catch { return '' } })()
  checks.push({ name: '自己的地址', ok: Boolean(base), detail: base })
  const bad = checks.filter((c) => !c.ok)
  return { ok: bad.length === 0, checks, bad: bad.map((c) => c.name), base }
}

/**
 * 心跳一次。全本地、全同步以外只有一次可选的自检请求。
 * 任何一步失败都不影响别的步骤，也不会抛。
 */
export async function bodyTick(role, { now = Date.now(), pulseCheck = null } = {}) {
  const id = String(role || '').trim()
  const rep = { ok: true, role: id, at: new Date(now).toISOString(), did: [], notable: [], errors: [] }
  if (!id) { rep.ok = false; rep.errors.push('没有角色'); return rep }
  const doc = readJson(bodyFile(id), { version: 1, ticks: 0, day: '', dayTicks: 0, firstAt: '', lastTickAt: '' })
  const today = dayOf(now)
  if (doc.day !== today) { doc.day = today; doc.dayTicks = 0 }
  doc.ticks = Number(doc.ticks || 0) + 1
  doc.dayTicks = Number(doc.dayTicks || 0) + 1
  doc.firstAt = doc.firstAt || new Date(now).toISOString()
  doc.lastTickAt = new Date(now).toISOString()

  // 1) 议程不在这里推：agendaOnce 每 10 分钟已经在推。
  //    2026-10-27 查出来重复过一次——两个驱动，同一件事被推两遍。一个驱动就够了。

  // 2) 她约的时间到点了没（只记，不叫她——叫醒要走模型，那是另一层）
  try {
    const due = listWaiting(id, { now }).filter((x) => x.due)
    if (due.length) rep.notable.push(`到点了 ${due.length} 件：${due.slice(0, 3).map((x) => x.what).join('；')}`)
  } catch (e) { rep.errors.push(`约定：${e?.message || e}`) }

  // 3) 收件箱只数不看（让"有新东西"这件事在她醒之前就存在）
  try {
    const n = unreadFor(id, { channel: 'qq', limit: 200 })
    const count = Number(n?.unread || n?.count || (Array.isArray(n) ? n.length : 0)) || 0
    doc.unreadQQ = count
    if (count > 0) rep.notable.push(`收件箱还有 ${count} 条没看`)
  } catch (e) { rep.errors.push(`收件箱：${e?.message || e}`) }

  // 4) 自己的脉，隔一阵摸一次
  const wantPulse = pulseCheck === null ? doc.ticks % CHECK_ENDPOINT_EVERY_TICKS === 0 : Boolean(pulseCheck)
  if (wantPulse) {
    try {
      const p = pulseOf(id)
      doc.pulse = { at: new Date(now).toISOString(), ok: p.ok === true, bad: p.bad || [], base: p.base || '' }
      if (!p.ok) rep.notable.push(`身体不对劲：${p.bad.join('、')} 读不到/写不进——这不是小事，先记下来`)
      rep.did.push(p.ok ? `自检：${p.checks.length} 项都正常` : `自检：${p.bad.join('、')} 不行`)
    } catch (e) { rep.errors.push(`自检：${e?.message || e}`) }
  }

  // 5) 议程现状（给她醒来看见"手上还有几件"）
  try { doc.active = readAgenda(id).items.filter((i) => ['want', 'doing', 'blocked', 'waiting'].includes(i.state)).length } catch { /* 忽略 */ }

  // 5) 状态灯：本地小模型写一句屋里此刻的情形（不署名、不写记忆、不发通道）。
  //    那是屋里的一行字，不是她睡着时想的事——别让她或别人当成她的心声。
  try {
    const sm = await sleepOnce(id, { now })
    if (sm.ok) { doc.sleep = { at: new Date(now).toISOString(), text: sm.text, ms: sm.ms }; rep.did.push(`状态灯：${sm.text}`) }
    else if (sm.skipped) { /* 刚亮过/她刚醒，正常跳过，不记 */ }
    else if (sm.why) { rep.notable.push(`状态灯没亮：${sm.why}`) }
  } catch (e) { rep.errors.push(`状态灯：${e?.message || e}`) }

  // 6) 记忆对账：文件大小和最后一条审计对不上 = 有人绕过插件改了。
  //    查不出是谁也不装没看见——至少留下"这一刻对不上"，下一个人能接着追。
  try {
    const c = getCharacter(id)
    if (c?.memory) {
      const d = checkDrift(id, c.memory)
      if (d.drift) rep.notable.push(`记忆对不上账：现在 ${d.now} 字节，上次记账 ${d.last}（${d.lastAt || '从没记过'}）`)
    }
  } catch { /* 读不到就不报，别把身体循环拖垮 */ }

  // 本体近况：写一份给桥看（2026-10-27 补"本体→通道"那一向）。
  // 写出去的内容必须是"能进群的"——私聊不进群（管家定的规矩），过滤在 buildRecap 里做。
  try {
    const rc = writeRecap(id, { now })
    if (rc.ok && !rc.empty) rep.did.push(`本体近况已更新（${rc.lines} 行）`)
  } catch (e) { rep.errors.push(`近况：${e?.message || e}`) }

  // 本地引擎闲着就关掉：用完就退，不常驻（它一占就是 7 GB）。
  try {
    const rel = await releaseLocalServer()
    if (rel.killed) { rep.did.push('本地引擎闲着，已关掉') }
  } catch { /* 关不掉不挡心跳 */ }

  // 记忆一天降一档（只降清晰度，不删原文；pinned 不动）。
  try {
    const dd = applyDailyDecay(id, { now })
    if (dd.changed) rep.did.push(`记忆降档 {dd.changed} 条`)
  } catch (e) { rep.errors.push(`降档：{e?.message || e}`) }

  doc.lastReport = { did: rep.did, notable: rep.notable }
  try { writeJson(bodyFile(id), doc) } catch (e) { rep.errors.push(`记心跳：${e?.message || e}`) }
  if (rep.notable.length) {
    try {
      fs.mkdirSync(path.dirname(bodyLog(id)), { recursive: true })
      fs.appendFileSync(bodyLog(id), `${JSON.stringify({ at: rep.at, notable: rep.notable })}\n`, 'utf8')
    } catch { /* 记不上就算了 */ }
  }
  return rep
}

/** 身体现在什么状态（她醒来看一眼，或老板查）。 */
export function bodyStatus(role, { now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const doc = readJson(bodyFile(id), null)
  if (!doc) return { ok: true, role: id, alive: false, note: '身体循环还没跑过' }
  const last = Date.parse(doc.lastTickAt || '')
  const gapMin = Number.isFinite(last) ? Math.round((now - last) / 60000) : null
  return {
    ok: true,
    role: id,
    alive: gapMin !== null && gapMin <= 10,
    lastTickAt: doc.lastTickAt,
    gapMinutes: gapMin,
    ticks: doc.ticks || 0,
    todayTicks: doc.day === dayOf(now) ? doc.dayTicks : 0,
    activeItems: doc.active || 0,
    unreadQQ: doc.unreadQQ || 0,
    pulse: doc.pulse || null,
    lastReport: doc.lastReport || { did: [], notable: [] },
    note: gapMin !== null && gapMin > 10 ? `身体循环 ${gapMin} 分钟没跳了（宿主停了？）` : '心跳正常',
  }
}

/** 身体最近替他做过/记下的事（她醒来能看，不用猜）。 */
export function bodyRecent(role, { limit = 10 } = {}) {
  try {
    return fs.readFileSync(bodyLog(role), 'utf8').trim().split(/\r?\n/).slice(-Math.max(1, limit))
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean).reverse()
  } catch { return [] }
}

export const BODY = Object.freeze({ HEARTBEAT_EVERY_MS, CHECK_ENDPOINT_EVERY_TICKS })
