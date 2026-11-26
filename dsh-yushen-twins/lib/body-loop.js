/* 标签
 * id: lib-body-loop
 * kind: module
 * summary: 身体循环：心跳、摸脉、议程本地一步、状态灯、记忆降档——不调大模型，只维持"她还在"。
 * audience: 她（通过 vital.json/面板）、新角色、维护脚本
 * owner: 框架；间隔与阈值改之前先问老板
 * mutable: 可改（这里不花 token；想加调模型的活，先想清楚谁付钱）
 * defaults: 心跳 30 分钟一拍（跟自省同拍）；判活 40 分钟
 * usage: bodyTick(role) 跑一跳；bodyStatus(role) 给她/面板看；pulseOf(role) 摸自己的脉
 * off: 关掉 freeTime/自省即停；状态灯另有关 sleepLight（默认关）
 */

// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-10 19:44｜大鱼·子会话（② 心跳日志）｜授权：老板（本次任务书：修两处会露在面板上的噪音）｜lib/body-loop.js:181-187,207-222｜改了：① 记忆降档那行从普通字符串修成模板串（`{dd.changed}`→`${dd.changed}`，catch 里那句同样缺 $）；② 「活着」判据 10 分钟→40 分钟（实际 30 分钟一跳，10 分钟会一天里三分之二时间假报「没心跳」）｜为什么：面板和 vital.jsonl 会原样露出这两处——一行打出花括号、一条假警报｜验证：node --check lib/body-loop.js；node scripts/test-heartbeat-journal.mjs（含降档记账与做旧审计两段）｜可改：可改（40 分钟这条跟着心跳节奏走；节奏再变就一起改）
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
// 边界：**这里不花 API token，也完全不调模型**——调大模型的事一律留给她醒了以后自己决定。
// 状态灯（lib/sleep-mind.js）2026-11-10 起改成规则拼的：不叫本地引擎，只把已知事实压成一句话，
// 不署名、不写记忆、不发通道。那句话不是她说的。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeDir, ensureRuntime } from './runtime.js'
import { stepOnce as stepAgenda, readAgenda } from './agenda.js'
import { listWaiting } from './waiting.js'
import { unreadFor } from './inbox.js'
import { readGroup } from './groups.js'
import { postMessage } from './groups.js'
import { sleepOnce, lastSleepText } from './sleep-mind.js'
import { writeRecap } from './recap.js'
import { releaseLocalServer } from './translator.js'
import { applyDailyDecay } from './memory.js'
// 改｜2026-11-11 19:0x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接 §二 图书馆定稿：降级通道一个月接上）｜lib/body-loop.js:41,210-220｜心跳里接一天一次的闭架降级（demoteDaily），搬了就写进 did｜为什么：定稿要求"一个月不用→闭架"自己发生；插件里没有日任务调度，心跳是现成的日节拍；不接上这条就永远等不到人手动跑｜验证：node scripts/test-library-closed.mjs 9/9；node scripts/regression.mjs 全绿；真家今天没有超过 30 天的条目，首次心跳为空操作｜可改：可改；一天一次与"只搬不删"不许破
import { demoteDaily } from './library-shelf.js'
import { getCharacter } from './characters.js'
import { device as deviceKind } from './platform.js'
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
  // 2026-11-04 手机端：安卓宿主没有 webServer 服务，她本来就没有 HTTP 地址——这不是故障。
  const mobileHost = (() => { try { return deviceKind() === 'phone' } catch { return false } })()
  checks.push({ name: '自己的地址', ok: mobileHost ? true : Boolean(base), detail: mobileHost ? '手机宿主没有 HTTP 服务（不适用）' : base })
  const bad = checks.filter((c) => !c.ok)
  return { ok: bad.length === 0, checks, bad: bad.map((c) => c.name), base }
}

/**
 * 心跳一次。全本地、全同步以外只有一次可选的自检请求。
 * 任何一步失败都不影响别的步骤，也不会抛。
 */
/** 兄弟角色最近动没动（心跳用；只读 vital.json，不写别人）。 */
export function siblingNotices(role, { now = Date.now(), staleMs = 2 * 3600 * 1000 } = {}) {
  const out = []
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DATA, 'characters.json'), 'utf8').replace(/^\uFEFF/, ''))
    for (const x of (c.characters || [])) {
      const id = String(x?.id || '')
      if (!id || id === role) continue
      let v = null
      try { v = readJson(path.join(runtimeDir(id), 'vital.json'), null) } catch { v = null }
      const t = Date.parse(String(v?.lastTickAt || ''))
      if (!Number.isFinite(t) || now - t > staleMs) out.push({ role: id, stale: true, lastTickAt: v?.lastTickAt || '' })
    }
  } catch { /* 名册读不到就不报 */ }
  return out
}

/** 我现在在做什么/卡在哪，一句话（没在做就空）。 */
export function statusText(role) {
  try {
    const items = readAgenda(role).items || []
    const blocked = items.find((i) => i.state === 'blocked' && i.what)
    if (blocked) return `我卡在：${String(blocked.what).slice(0, 100)}`
    const doing = items.find((i) => i.state === 'doing' && i.what)
    if (doing) return `我在做：${String(doing.what).slice(0, 100)}`
    return ''
  } catch { return '' }
}

/**
 * 主动把自己的状态播报给兄弟：只发内部群（kind=say，不算“要回复”），
 * 默认 6 小时一次、且状态变了才发；不叫醒任何人、不刷屏。
 */
export function maybeBroadcastStatus(role, doc = null, { now = Date.now(), gapMs = 6 * 3600 * 1000 } = {}) {
  const d = doc || readJson(bodyFile(role), {})
  const text = statusText(role)
  if (!text) return { posted: false, text: '' }
  const last = Date.parse(String(d.lastStatusAt || ''))
  if (Number.isFinite(last) && now - last < gapMs) return { posted: false, text }
  if (String(d.lastStatusText || '') === text) return { posted: false, text }
  const r = postMessage({ from: role, to: 'all', kind: 'say', text, channel: 'all' })
  if (!r?.ok) return { posted: false, text }
  d.lastStatusAt = new Date(now).toISOString()
  d.lastStatusText = text
  if (!doc) writeJson(bodyFile(role), d)
  return { posted: true, text }
}

/** 内部群有没有兄弟找我、还没回（心跳用；只读，不写群）。 */
export function groupNotices(role, { now = Date.now(), windowMs = 3 * 24 * 3600 * 1000 } = {}) {
  try {
    const g = readGroup({ role, level: 'low' })
    const pend = Array.isArray(g?.pending) ? g.pending : []
    const fresh = pend.filter((m) => {
      const t = Date.parse(String(m?.at || ''))
      return Number.isFinite(t) && now - t < windowMs
    })
    const from = [...new Set(fresh.map((m) => String(m?.from || m?.sender || '有人')))].slice(0, 3)
    return { count: fresh.length, from, text: fresh.length ? `内部群有 ${fresh.length} 条没回：${from.join('、')} 找你` : '' }
  } catch { return { count: 0, from: [], text: '' } }
}

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

  // 3b) 内部群：兄弟有没有找我、还没回。这一步让心跳也能主动发现，
  //     不用等到“对方发消息那一下”才知道（2026-11-26 老板：心跳实时互通）。
  try {
    const gn = groupNotices(id, { now })
    doc.groupPending = gn.count
    if (gn.text) rep.notable.push(gn.text)
  } catch (e) { rep.errors.push(`内部群：${e?.message || e}`) }

  // 3c) 兄弟角色最近动没动：谁很久没心跳了，我能看见（不是替它做，是知道它可能卡了）。
  try {
    const sib = siblingNotices(id, { now })
    doc.siblings = sib
    if (sib.length) rep.notable.push(`兄弟很久没动：${sib.map((x) => x.role).join('、')}`)
  } catch (e) { rep.errors.push(`兄弟：${e?.message || e}`) }

  // 3d) 自己的状态：在做什么/卡在哪，变了才播报到内部群（6 小时一次，不叫醒人）。
  try {
    const sb = maybeBroadcastStatus(id, doc, { now })
    if (sb.posted) rep.did.push(`状态已播报：${sb.text}`)
  } catch (e) { rep.errors.push(`状态播报：${e?.message || e}`) }

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

  // 5) 本地引擎闲着就关掉：用完就退，不常驻（它一占就是 7 GB）。
  //    2026-11-10：挪到点灯之前——原来点灯先 touchLocalUse()，这里再判「最近 10 分钟用过」，
  //    永远判成刚用过，引擎从没被关过。现在点灯不碰引擎：先关旧的，再点新的。
  try {
    const rel = await releaseLocalServer()
    if (rel.killed) { rep.did.push('本地引擎闲着，已关掉') }
  } catch { /* 关不掉不挡心跳 */ }

  // 5) 状态灯：规则拼一句屋里此刻的情形（不署名、不写记忆、不发通道）。
  //    那是屋里的一行字，不是她睡着时想的事——别让她或别人当成她的心声。
  //
  // 2026-11-10 老板：「小模型灯没什么用，想关掉」→ 加开关 sleepLight（默认关）。
  // 关掉以后：不拉本地 llama-server、不写 sleep.jsonl、简报里不再有「屋里留的一行」。
  // 代码留着不删（一句开关就能开回来），但**默认不占那 7 GB**。
  try {
    if (readJson(path.join(DATA, 'switches.json'), {})?.sleepLight === true) {
      const sm = await sleepOnce(id, { now })
      if (sm.ok) { doc.sleep = { at: new Date(now).toISOString(), text: sm.text, ms: sm.ms }; rep.did.push(`状态灯：${sm.text}`) }
      else if (sm.skipped) { /* 刚亮过/她刚醒，正常跳过，不记 */ }
      else if (sm.why) { rep.notable.push(`状态灯没亮：${sm.why}`) }
    }
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
  // 写出去的内容必须是"能进群的"——私聊不进群（大鱼定的规矩），过滤在 buildRecap 里做。
  try {
    const rc = writeRecap(id, { now })
    if (rc.ok && !rc.empty) rep.did.push(`本体近况已更新（${rc.lines} 行）`)
  } catch (e) { rep.errors.push(`近况：${e?.message || e}`) }

  // 记忆一天降一档（只降清晰度，不删原文；pinned 不动）。
  try {
    const dd = applyDailyDecay(id, { now })
    // 2026-11-10（② 心跳日志）：这两行原来是普通字符串（少了 $），会原样打出「记忆降档 {dd.changed} 条」。
    // 面板和 vital.jsonl 都会露这行，所以按模板串修。
    if (dd.changed) rep.did.push(`记忆降档 ${dd.changed} 条`)
  } catch (e) { rep.errors.push(`降档：${e?.message || e}`) }

  // 闭架：一天搬一次——条目一个月不用就进 library/闭架/<年-月>/（只搬不删；搬了什么记 meta/closed-log.jsonl）。
  // 2026-11-11（图书馆定稿）：这是"降级通道"的落点；一次只搬整份都过期的，混着新条的整份留着。
  try {
    const cd = demoteDaily({ now })
    if (!cd.skipped && cd.moved.length) rep.did.push(`闭架：搬走 ${cd.moved.length} 份旧条目（${cd.month}）`)
  } catch (e) { rep.errors.push(`闭架：${e?.message || e}`) }

  doc.lastReport = { did: rep.did, notable: rep.notable }
  try { writeJson(bodyFile(id), doc) } catch (e) { rep.errors.push(`记心跳：${e?.message || e}`) }
  if (rep.notable.length) {
    try {
      fs.mkdirSync(path.dirname(bodyLog(id)), { recursive: true })
      fs.appendFileSync(bodyLog(id), `${JSON.stringify