// 运行时：她「活着」的那一层。
//
// 定位（框架 §4.6）：卡是脸，点化是命。脸归插件，命归鱼神。
// 所以这个目录跟角色卡无关、跟哪个插件也无关：
//   ~/.dsh/dayu/runtime/<role>/
//     presence.json  时间      body.json    身体（真实资源）
//     weights.json   手感      self.md      自我
//     memory/        记忆      inbox/       被记得（全局在 ~/.dsh/dayu/inbox）
//
// 铁律：权重参与判断，不替代判断；主人和她自己能调，接入的插件只能申请。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { readInbox } from './inbox.js'
import { getCharacter } from './characters.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const ROOT = path.join(DATA, 'runtime')

/** 已知角色；外部插件的角色也允许，只是调权重的人必须受限制。 */
export const KNOWN_ROLES = Object.freeze(['dayu', 'xiaoyu', 'dragon'])

/** 权重定义：都可解释、都有边界。加一项 = 加一条（不用改卡）。 */
export const WEIGHT_DEFS = Object.freeze({
  replyGate: { label: '要不要回（阈值）', min: 0, max: 1, default: 0.5, why: '综合欲望分低于它就不回' },
  wakeThreshold: { label: '抬头阈值', min: 0, max: 1, default: 0.6, why: '低于它只扫一眼，不升级成回合' },
  affinityHalfLifeHours: { label: '好感半衰期（小时）', min: 1, max: 720, default: 72, why: '多久回归一半；主人这条线不因久不联系下降' },
  memoryHalfLifeDays: { label: '记忆半衰期（天）', min: 1, max: 365, default: 14, why: '旧事淡出的速度；承诺不在此列' },
  initiativeChance: { label: '主动开口概率', min: 0, max: 1, default: 0.15, why: '没人叫她时她愿不愿意先说话' },
  moodInertia: { label: '情绪惯性', min: 0, max: 1, default: 0.7, why: '心情翻篇要多久' },
  fatigueCurve: { label: '疲劳曲线', min: 0.2, max: 3, default: 1, why: '真实资源吃紧时，她话变少变慢的程度' },
})

/** 礼物 = 模块。已接上就 ready。 */
export const GIFT_DEFS = Object.freeze([
  { id: 'time', name: '时间', module: 'presence.json', what: '离开多久、期间发生什么' },
  { id: 'remembered', name: '被记得', module: 'inbox/', what: '别人说了什么、谁在等她' },
  { id: 'memory', name: '记忆', module: 'memory/', what: '原文 + 来源 + 可信度 + 半衰期' },
  { id: 'weights', name: '手感', module: 'weights.json', what: '她怎么权衡，砝码摆在明面上' },
  { id: 'will', name: '意志', module: 'agenda.json', what: '她自己排的事，和它的进度' },
  { id: 'bottomline', name: '底线', module: 'bottom-line.md', what: '她自己写的底线，和她说过的不' },
  { id: 'crossline', name: '越线权', module: 'ventures.jsonl', what: '线外值得做的事，她判断后可以跳，但要留证据、能回退' },
  { id: 'self', name: '自我', module: 'self.md', what: '她自己写的四段' },
  { id: 'body', name: '身体', module: 'body.json', what: '真实资源：负载、内存、延迟、预算' },
])

function pad(n) { return String(n).padStart(2, '0') }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function stamp(ms = Date.now()) { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function safeRole(role) {
  const id = String(role || '').trim()
  if (!id) throw new Error('没有角色 id')
  return id.replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 40)
}

export function runtimeRoot() { return ROOT }
export function runtimeDir(role) { return path.join(ROOT, safeRole(role)) }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

function writeIfMissing(file, text) {
  if (fs.existsSync(file)) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 })
  return true
}

function defaultWeights() {
  const values = {}
  for (const [key, def] of Object.entries(WEIGHT_DEFS)) values[key] = def.default
  return { version: 1, values, log: [] }
}

/**
 * 建/补齐运行时目录。只建不删；已有文件一律不动。
 * @returns {{dir:string, created:string[]}}
 */
export function ensureRuntime(role, { now = Date.now() } = {}) {
  const dir = runtimeDir(role)
  const created = []
  for (const sub of ['memory', 'self']) fs.mkdirSync(path.join(dir, sub), { recursive: true })
  if (writeIfMissing(path.join(dir, 'weights.json'), `${JSON.stringify(defaultWeights(), null, 2)}\n`)) created.push('weights.json')
  if (writeIfMissing(path.join(dir, 'presence.json'), `${JSON.stringify({ version: 1, lastSeenAt: '', lastChannel: '', lastLine: '', updatedAt: new Date(now).toISOString() }, null, 2)}\n`)) created.push('presence.json')
  if (writeIfMissing(path.join(dir, 'body.json'), `${JSON.stringify(bodySnapshot({ now }), null, 2)}\n`)) created.push('body.json')
  if (writeIfMissing(path.join(dir, 'self.md'), [
    '# 我（自己写给自己的，不是角色卡）',
    '',
    '## 我是谁',
    '（三句，不许抄角色卡）',
    '',
    '## 我在意什么',
    '（最近三件）',
    '',
    '## 我欠谁什么',
    '（指向心念里的承诺；没有就写没有）',
    '',
    '## 我最近在琢磨什么',
    '（一到三件）',
    '',
  ].join('\n'))) created.push('self.md')
  writeIfMissing(path.join(dir, 'memory', 'README.md'), '这里是她自己的记忆：原文 + 来源 + 可信度 + 她设的半衰期。\n') && created.push('memory/README.md')
  // 身体是真实读数：放旧了就不是"现在"，超过 10 分钟重读一次。
  const bodyFile = path.join(dir, 'body.json')
  if (!created.includes('body.json')) {
    const old = readJson(bodyFile, null)
    if (!old?.at || now - Date.parse(old.at) > 10 * 60 * 1000) {
      fs.writeFileSync(bodyFile, `${JSON.stringify(bodySnapshot({ now }), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    }
  }
  return { dir, created }
}

/** 真实资源快照——她的「身体」不是编的。 */
export function bodySnapshot({ now = Date.now(), budget = null } = {}) {
  const total = os.totalmem()
  const free = os.freemem()
  const load = os.loadavg?.() || [0, 0, 0]
  return {
    at: new Date(now).toISOString(),
    cpus: os.cpus().length,
    memTotalMB: Math.round(total / 1048576),
    memFreeRatio: total ? Number((free / total).toFixed(3)) : 0,
    // Windows 上 loadavg 恒为 0，别拿它当唯一指标
    load1: Number(load[0] || 0),
    loadUsable: load.some((x) => x > 0),
    uptimeHours: Number((os.uptime() / 3600).toFixed(1)),
    budget,
    note: '这些是真实读数；疲劳感应当由它算，不许编。',
  }
}

/** 读权重：默认值 + 她自己的覆盖。 */
export function readWeights(role) {
  const file = path.join(runtimeDir(role), 'weights.json')
  const doc = readJson(file, null) || defaultWeights()
  const values = {}
  for (const [key, def] of Object.entries(WEIGHT_DEFS)) {
    const v = Number(doc?.values?.[key])
    values[key] = Number.isFinite(v) ? Math.max(def.min, Math.min(def.max, v)) : def.default
  }
  return { ...doc, values, log: Array.isArray(doc?.log) ? doc.log : [] }
}

/** 谁能调：主人、她自己。接入的插件只能申请。 */
function assertWho(role, who) {
  const w = String(who || '').trim()
  const id = safeRole(role)
  if (w === 'owner' || w === 'self' || w === id) return
  throw new Error(`接入的插件不能调她的权重（who=${w || '空'}）：只能申请，决定权在主人和她自己`)
}

/**
 * 调一个权重。改动必留痕：谁、为什么、从多少到多少。
 * @returns {{ok:true, key:string, from:number, to:number, at:string}}
 */
export function setWeight(role, key, value, { who = 'owner', why = '', now = Date.now() } = {}) {
  const def = WEIGHT_DEFS[key]
  if (!def) throw new Error(`没有这个权重：${key}（可用：${Object.keys(WEIGHT_DEFS).join(' / ')}）`)
  assertWho(role, who)
  ensureRuntime(role, { now })
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`权重必须是数字：${key}=${value}`)
  const to = Math.max(def.min, Math.min(def.max, n))
  const doc = readWeights(role)
  const from = doc.values[key]
  doc.values[key] = to
  doc.log = [...(doc.log || []), { at: new Date(now).toISOString(), who: String(who), key, from, to, why: String(why || '').slice(0, 200) }].slice(-200)
  writeJson(path.join(runtimeDir(role), 'weights.json'), doc)
  return { ok: true, key, from, to, at: doc.log[doc.log.length - 1].at }
}

/** 最近改动（回滚和复盘都靠它）。 */
export function weightsLog(role, { limit = 20 } = {}) {
  const doc = readWeights(role)
  return doc.log.slice(-Math.max(1, Math.min(200, Number(limit) || 20)))
}

/**
 * 礼物清单：不看目录在不在，看**真的在用**。
 * ready = 这块在；used = 有证据被用过。两边都真，才算"接上了"。
 */
export function giftStatus(role) {
  const dir = runtimeDir(role)
  const out = []

  const p = presenceOf(role)
  out.push({ id: 'time', name: '时间', module: 'presence.json', ready: Boolean(p.lastSeenAt), used: Boolean(p.lastSeenAt), detail: p.lastSeenAt ? `上次在场 ${p.lastSeenAt}` : '还没记过在场' })

  let days = 0
  try { days = fs.readdirSync(path.join(DATA, 'inbox', 'qq')).filter((f) => f.endsWith('.jsonl')).length } catch { /* 还没镜像 */ }
  out.push({ id: 'remembered', name: '被记得', module: 'inbox/', ready: days > 0, used: days > 0, detail: days ? `${days} 天有记录` : '还没收到过消息' })

  // 记忆：内容在 soul/memory/，不在 runtime/<role>/memory/（那里只是她的工作区）
  let memPath = ''
  try { memPath = String(getCharacter(role)?.memory || '') } catch { /* 没这个人 */ }
  let people = 0
  const memExists = Boolean(memPath) && fs.existsSync(memPath)
  if (memExists) { const m = readJson(memPath, null); people = Object.keys(m?.impressions || {}).length }
  out.push({ id: 'memory', name: '记忆', module: memPath ? path.relative(DATA, memPath) : 'soul/memory/', ready: memExists, used: people > 0, detail: people ? `${people} 个人` : '还没有记忆条目' })

  const w = readWeights(role)
  const changes = (w.log || []).length
  out.push({ id: 'weights', name: '手感', module: 'weights.json', ready: true, used: changes > 0, detail: changes ? `调过 ${changes} 次` : '砝码在，还没调过' })

  // 意志：她自己排的事（不是谁派的）。看有没有 by:self 的、在做的。
  let agenda = { items: [] }
  try { agenda = JSON.parse(fs.readFileSync(path.join(dir, 'agenda.json'), 'utf8').replace(/^\uFEFF/, '')) } catch { /* 还没排过 */ }
  const live = (agenda.items || []).filter((i) => ['want', 'doing', 'blocked', 'waiting'].includes(i.state))
  out.push({ id: 'will', name: '意志', module: 'agenda.json', ready: fs.existsSync(path.join(dir, 'agenda.json')), used: live.some((i) => i.by === 'self'), detail: live.length ? `手上有 ${live.length} 件自己的事` : '还没给自己排过事' })

  // 底线：她自己写的字，或她说过的「不」。模板不算写。
  let blText = ''
  try { blText = fs.readFileSync(path.join(dir, 'bottom-line.md'), 'utf8') } catch { /* 还没写 */ }
  const blWritten = blText.split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l) && !/^（.*）\s*$/.test(l))
    .join('')
    .replace(/[-*]\s*(我不做的事|我宁可不做也不糊弄的事|谁让我做这些，我会说不)：/g, '')
    .replace(/这上面的话是.*/g, '')
    .trim()
  let refusals = 0
  try { refusals = fs.readFileSync(path.join(dir, 'refusals.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).length } catch { /* 没拒过 */ }
  out.push({
    id: 'bottomline', name: '底线', module: 'bottom-line.md',
    ready: Boolean(blText),
    used: Boolean(blWritten) || refusals > 0,
    detail: blWritten ? (refusals ? `写过，拒绝过 ${refusals} 次` : '她自己写过') : (refusals ? `拒绝过 ${refusals} 次` : '还没写过、也没拒绝过'),
  })

  // 越线权：不是"用不用"，是她本来就有的判断权；跳过线才算"用过"。
  let ventures = 0
  try { ventures = fs.readFileSync(path.join(dir, 'ventures.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).length } catch { /* 没跳过 */ }
  out.push({
    id: 'crossline', name: '越线权', module: 'ventures.jsonl',
    ready: true,
    used: ventures > 0,
    detail: ventures ? `跳过 ${ventures} 次线（都留了理由）` : '还没跳过线——想跳就跳，说清为什么、能回退就行',
  })

  let selfText = ''
  try { selfText = fs.readFileSync(path.join(dir, 'self.md'), 'utf8') } catch { /* 没有 */ }
  const filled = selfText.replace(/（[^）]*）/g, '').replace(/#+\s*/g, '').replace(/\s/g, '').length > 80
  out.push({ id: 'self', name: '自我', module: 'self.md', ready: Boolean(selfText), used: filled, detail: filled ? '她自己写过' : '还是模板' })

  const b = readJson(path.join(dir, 'body.json'), null)
  const fresh = Boolean(b?.at) && Date.now() - Date.parse(b.at) < 60 * 60 * 1000
  out.push({ id: 'body', name: '身体', module: 'body.json', ready: Boolean(b), used: fresh, detail: b ? `${b.cpus} 核 / 空闲内存 ${Math.round((Number(b.memFreeRatio) || 0) * 100)}%` : '还没读过机器' })

  return out
}

/** 一眼看全：目录、礼物、权重、改动历史。 */
export function runtimeStatus(role) {
  const ensured = ensureRuntime(role)
  return {
    role: safeRole(role),
    dir: ensured.dir,
    created: ensured.created,
    gifts: giftStatus(role),
    weights: readWeights(role).values,
    changes: weightsLog(role, { limit: 5 }),
    body: bodySnapshot(),
    at: stamp(),
  }
}

// ── 礼物一：时间 ───────────────────────────────────────────────
// 记「她上次在这儿」和「她说了什么」；醒来时先告诉她离开了多久。
function presenceFile(role) { return path.join(runtimeDir(role), 'presence.json') }

export function markSeen(role, { channel = '', line = '', at = Date.now() } = {}) {
  const file = presenceFile(role)
  const doc = readJson(file, { version: 1, lastSeenAt: '', lastChannel: '', lastLine: '' })
  doc.lastSeenAt = new Date(at).toISOString()
  doc.updatedAt = doc.lastSeenAt
  if (channel) doc.lastChannel = String(channel).slice(0, 20)
  if (line) doc.lastLine = String(line).replace(/\s+/g, ' ').slice(0, 80)
  writeJson(file, doc)
  return doc
}

export function presenceOf(role) {
  return readJson(presenceFile(role), { version: 1, lastSeenAt: '', lastChannel: '', lastLine: '', updatedAt: '' })
}

function partOfDay(hour) {
  if (hour < 6) return '深夜'
  if (hour < 9) return '清晨'
  if (hour < 12) return '上午'
  if (hour < 14) return '中午'
  if (hour < 18) return '下午'
  if (hour < 22) return '晚上'
  return '深夜'
}

function humanGap(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h < 24) return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`
  const d = Math.floor(h / 24)
  return `${d} 天${h % 24 ? ` ${h % 24} 小时` : ''}`
}

/**
 * 回场简报：离开多久、期间手机那边发生了什么、她上次说了什么。
 * 只读本地，不叫模型；短于 minGapMinutes 不啰嗦。
 */
export function resumeBrief(role, { now = Date.now(), minGapMinutes = 20, maxChars = 300 } = {}) {
  const p = presenceOf(role)
  const last = Date.parse(p.lastSeenAt || '')
  if (!Number.isFinite(last)) return { text: '', gapMinutes: 0, reason: '没有上次在场的记录' }
  const gapMs = now - last
  const gapMinutes = Math.round(gapMs / 60000)
  if (gapMinutes < minGapMinutes) return { text: '', gapMinutes, reason: '刚离开一会儿，不必说' }

  const since = sinceLastSeen(role, { now })
  const lines = [`## 你离开了 ${humanGap(gapMs)}`]
  if (since.count) lines.push(`- 这期间 QQ 上有 ${since.count} 条新消息${since.atMe ? `，其中 ${since.atMe} 条 @ 你` : ''}`)
  if (p.lastLine) lines.push(`- 你自己上次说的是：「${p.lastLine}」`)
  lines.push(`- 现在是 ${stamp(now).slice(11)}，${partOfDay(new Date(now).getHours())}`)
  let text = lines.join('\n')
  if (text.length > maxChars) {
    // 先砍「上次说了什么」，保住「离开多久 / 现在几点」
    const keep = lines.filter((l) => !l.startsWith('- 你自己上次')).join('\n')
    text = keep.length <= maxChars ? `${keep}\n- （更早的自己去翻收件箱）` : keep.slice(0, maxChars)
  }
  return { text, gapMinutes, lastSeenAt: p.lastSeenAt, lastChannel: p.lastChannel, ...since }
}

/** 上次在场之后，手机那边来了多少条、几条 @ 她。 */
export function sinceLastSeen(role, { now = Date.now(), days = 2 } = {}) {
  const p = presenceOf(role)
  const last = Date.parse(p.lastSeenAt || '')
  if (!Number.isFinite(last)) return { count: 0, atMe: 0 }
  const rows = []
  for (let i = 0; i < Math.max(1, days); i += 1) {
    const d = new Date(now - i * 86400000)
    rows.push(...readInbox({ day: dayKey(d), limit: 100000 }).rows)
  }
  const hit = rows.filter((r) => {
    const t = Date.parse(r.at || '')
    return Number.isFinite(t) && t > last
  })
  return { count: hit.length, atMe: hit.filter((r) => r.atMe).length }
}

