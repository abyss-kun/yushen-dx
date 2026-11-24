// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜dsh-memory/index.js:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: dsh-memory-shell
 * kind: plugin
 * summary: 通用记忆插件壳：三个工具（记一条 / 按线索想 / 看家底），不含人格；装给别人用，数据格式和鱼神一致。
 * audience: 装这个插件的人（不是老板一人）、外面接上来的角色、我们自己拿来对格式
 * owner: 框架；谁都能改代码，但数据归装它的人
 * defaults: 数据落 <DSH_HOME>/dsh-memory/soul/memory/<role>.json；DSH_MEMORY_HOME / MEMORY_HOME 可覆盖
 * usage: 装好后调三个工具——memory_remember(记一条) / memory_recall(按线索想) / memory_status(看家底)
 * off: 从 profile 里卸掉这个 package 即可；数据文件留着，不会被删
 * tags: 记忆, 独立插件, 通用记忆, 三工具, 与鱼神同格式, MEMORY_HOME
 * created: 2026-11-07 22:45:00
 * changed: 2026-11-07 22:55:00
 * author: 照微·子会话（实现代理）
 * authority: 老板（2026-11-07 S4 任务书：建 dsh-memory 独立插件壳，3 个工具，不接鱼神、不改现有文件；
 *            S5 任务书：按真实 DSH 宿主契约补齐装载，工具名与参数不变）
 * why: docs/方案-记忆库拆分.md §1/§4——记忆库从鱼神里抽出来以后，要有一个别人能自己装的壳；
 *      壳只暴露「记一条 / 按线索想 / 看家底」，不含人格、角色卡、宪章、好感、账本。
 * result: memory_remember / memory_recall / memory_status 三个工具；数据默认落
 *         <DSH_HOME>/dsh-memory/soul/memory/<role>.json（独立根，不抢鱼神；同一份 JSON 格式），DSH_MEMORY_HOME / MEMORY_HOME 可覆盖。
 *         S5 补：inject=['tools']；注册包进 ctx.effect；package.json 加 dsh.bundle + cordis.patch.yml。
 * mutable: 可改
 */
// 改｜2026-11-11 01:10｜大鱼·子代理（闭环收口）｜授权：主人（2026-11-11 闭环任务：心跳下沉 / 借阅账 / 说明格式）｜dsh-memory/index.js:1-637｜补记：逻辑改动随 c0aee4e 提交，内容见文件头 changed 与标签块；本班只补留痕、未改逻辑｜为什么：改了逻辑却没贴「改」行，check-trace 一直红，全量回归卡在最后一步｜验证：node scripts/check-trace.mjs 退出 0（补后复跑）；随后跑 scripts/regression.mjs 确认全绿｜可改：可改

// 2026-11-07（S4）：壳的边界就三条——
//   ① 只做通用记忆，不读角色卡/宪章/好感；② 数据格式和鱼神一致，两边能直接拷；③ 不引外部依赖、不联网。
// 完整版（记忆库本体）在 ../memory-core/，这里只做「找到库 → 调三个接口 → 把结果交给工具层」。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import './root-config.js'
import { readControl, writeControl, memoryPaths, statusOf as memoryStatus } from './control.js'
import { createTurnCapture } from '../memory-core/runtime/capture.js'

export const name = 'dsh-memory'
// 2026-11-07（S5）：照真实宿主契约声明 tools 注入（原先是 inject = []）。
// 依据（都在 app.asar/dsh/node_modules/@deepseek-ai/ 里）：
//   cordis/src/reflect.ts:144 —— 没声明 inject 时读 ctx.tools 直接抛 "cannot get property … without inject"，
//     只能绕 ctx.get()（reflect.ts:233）；
//   cordis/src/registry.ts:330 —— 声明之后由宿主 Inject.resolve(plugin.inject) 等 tools 就绪再 apply；
//   cordis-plugin-development/references/practices.md:20 —— 缺服务时保持未激活，而不是 apply 了却什么都注册不上。
// 纯 host 插件（不进入 UI）只认这一种导出形状：apply(ctx, config) + inject（host-plugin.md:61）。
export const inject = ['tools']

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROLE = 'default'
const DEFAULT_N = 4
const DEFAULT_BUDGET = 300
const MAX_TEXT = 400
const MAX_EVENTS = 200
const TIERS = new Set(['core', 'important', 'normal'])
// 角色 id 会直接拼进文件名：只许小写字母开头 + [a-z0-9_-]，挡掉 `../` 和盘符。
const ROLE_RE = /^[a-z][a-z0-9_-]{0,31}$/i
// 写手用的通道/类型（工具参数里没有这两项；格式和鱼神那边同名，拷数据时读得懂）
const DEFAULT_CHANNEL = '通用'
const DEFAULT_KIND = 'note'

// ── 路径：默认 <DSH_HOME>/dsh-memory/soul/memory，DSH_MEMORY_HOME / MEMORY_HOME 可覆盖 ──
// 和鱼神同一个位置，是为了「以后想共享数据，直接拷 json 就行」（方案 §4）；独立装时各有各的 DSH_HOME，互不干扰。
export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

export function memoryRoot() {
  const override = String(process.env.MEMORY_HOME || '').trim()
  return override ? path.resolve(override) : path.join(dshHome(), 'dsh-memory', 'soul', 'memory')
}

function roleId(role) {
  const id = String(role || '').trim() || DEFAULT_ROLE
  if (!ROLE_RE.test(id)) throw new Error(`role 不合法：${id}（只许字母开头，a-z0-9_-，最长 32）`)
  return id
}

/** 角色 → 记忆文件（壳自己的唯一真源：<root>/<role>.json）。 */
export function memoryFile(role) {
  return path.join(memoryRoot(), `${roleId(role)}.json`)
}

// 2026-11-24：通用核心（决定簿 / 自我记忆）和鱼神同一份实现；独立包用自己的目录，不混鱼神的数据。
// 仓里在 ../memory-core/generic，打包后在 ./memory-core/generic，两个路径都试。
async function loadGeneric(name) {
  for (const p of [`./memory-core/generic/${name}.js`, `../memory-core/generic/${name}.js`]) {
    try { return await import(p) } catch { /* 试下一个 */ }
  }
  throw new Error(`找不到通用记忆模块 ${name}（没打包进来？）`)
}

/** 独立包自己的数据目录：~/.dsh/dsh-memory（DSH_HOME 可覆盖）。 */
export function genericDir() {
  return path.join(dshHome(), 'dsh-memory')
}

// 2026-11-24：单角色 / 多角色分开——不是每个人都开三个角色。
// single（默认）：一个角色，数据就在 ~/.dsh/dsh-memory；
// multi：每个角色一个子目录 ~/.dsh/dsh-memory/roles/<role>，互不混。
// 事件本来就按 <root>/<role>.json 存，两种模式都兼容。
const CONFIG_FILE = () => path.join(genericDir(), 'config.json')

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8').replace(/^\uFEFF/, '')) || {} } catch { return {} }
}
function writeConfig(cfg) {
  fs.mkdirSync(genericDir(), { recursive: true })
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2) + '\n', 'utf8')
}

/** 这台机器上“已经出现”的角色：事件文件 + roles/ 子目录。不预设三个，也不预设名字。 */
export function detectRoles() {
  const names = new Set()
  try {
    for (const f of fs.readdirSync(memoryRoot())) if (f.endsWith('.json')) names.add(f.slice(0, -5))
  } catch { /* 还没有事件 */ }
  try {
    for (const d of fs.readdirSync(path.join(genericDir(), 'roles'), { withFileTypes: true })) {
      if (d.isDirectory()) names.add(d.name)
    }
  } catch { /* 还没有角色目录 */ }
  return [...names].filter(Boolean).sort()
}

/**
 * 第一次检查 + 后续加人：不预设“三角色”。
 * - 第一次：看这台机器实际有几个角色；0/1 个 → single，>1 → multi；绑进 config。
 * - 后续：发现新角色就追加进 roles，不自动改模式（提示用户自己切 multi）。
 */
export function bindRoles() {
  const cfg = readConfig()
  const detected = detectRoles()
  const known = Array.isArray(cfg.roles) ? cfg.roles.filter(Boolean) : []
  const roles = [...new Set([...known, ...detected])]
  if (!roles.length) roles.push(DEFAULT_ROLE)
  const mode = cfg.mode === 'multi' || cfg.mode === 'single'
    ? cfg.mode
    : (roles.length > 1 ? 'multi' : 'single')
  const changed = !cfg.firstCheckAt || mode !== cfg.mode || roles.join(',') !== known.join(',')
  if (changed) {
    writeConfig({
      ...cfg,
      mode,
      roles,
      firstCheckAt: cfg.firstCheckAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  return { mode, roles, detected, changed }
}

export function memoryMode() {
  const env = String(process.env.DSH_MEMORY_MODE || '').trim().toLowerCase()
  if (env === 'single' || env === 'multi') return env
  return bindRoles().mode
}

export function setMemoryMode(mode, { migrate = false } = {}) {
  const m = String(mode || '').trim().toLowerCase()
  if (m !== 'single' && m !== 'multi') return { ok: false, error: 'mode 只能是 single / multi' }
  const migrated = []
  try {
    // 2026-11-24：single → multi 可顺手把旧数据拷进 roles/default（copy，不删原件；已有目标就跳过）。
    if (m === 'multi' && migrate) {
      const target = path.join(genericDir(), 'roles', DEFAULT_ROLE)
      fs.mkdirSync(target, { recursive: true })
      for (const f of ['definitions.jsonl', 'self-memory.jsonl', 'cards.jsonl']) {
        const from = path.join(genericDir(), f)
        const to = path.join(target, f)
        if (fs.existsSync(from) && !fs.existsSync(to)) { fs.copyFileSync(from, to); migrated.push(f) }
      }
    }
    const cfg = readConfig()
    const roles = [...new Set([...(Array.isArray(cfg.roles) ? cfg.roles : []), ...detectRoles()])]
    if (!roles.length) roles.push(DEFAULT_ROLE)
    writeConfig({ ...cfg, mode: m, roles, firstCheckAt: cfg.firstCheckAt || new Date().toISOString(), updatedAt: new Date().toISOString() })
    return { ok: true, mode: m, migrated }
  } catch (e) { return { ok: false, error: String(e?.message || e) } }
}

/** 通用记忆（决定/自我/卡片/现在）写哪个目录：single=基础目录，multi=roles/<role>。 */
export function roleDir(role = '') {
  const r = roleId(role)
  return memoryMode() === 'multi' ? path.join(genericDir(), 'roles', r) : genericDir()
}

/** 有哪些角色：第一次检查绑定的 + 后来实际出现的（不预设三个）。 */
export function listMemoryRoles() {
  return bindRoles().roles
}

function samePath(a, b) {
  const norm = (p) => path.resolve(String(p || '')).replace(/[\\/]+$/, '').toLowerCase()
  return Boolean(a) && Boolean(b) && norm(a) === norm(b)
}

// ── 找库：memory-core/ 可能在仓里（../memory-core），也可能被 pack.mjs 复制到壳里（./memory-core）
// 顺序：先仓里那份（S1/S2 的真身），独立包只剩壳里那份。
const CORE_CANDIDATES = [path.resolve(HERE, '..', 'memory-core'), path.join(HERE, 'memory-core')]
let corePromise = null

/**
 * 加载 memory-core（pick 必须、store 可选）。
 * store 加载失败不算错：它依赖鱼神的 lib/（角色名册、审计），独立包里没有，
 * 这时写走壳内置的兼容写手（lite），召回仍然走 pick——memory_status 的 backend 会如实写出来。
 */
export function loadCore() {
  if (!corePromise) {
    corePromise = (async () => {
      const out = { store: null, pick: null, heartbeat: null, dir: '', error: '' }
      for (const dir of CORE_CANDIDATES) {
        if (!fs.existsSync(path.join(dir, 'pick.mjs')) && !fs.existsSync(path.join(dir, 'store.mjs'))) continue
        out.dir = dir
        const errs = []
        try { out.pick = await import(pathToFileURL(path.join(dir, 'pick.mjs')).href) } catch (e) { errs.push(`pick: ${e.message}`) }
        try { out.store = await import(pathToFileURL(path.join(dir, 'store.mjs')).href) } catch (e) { errs.push(`store: ${e.message}`) }
        // 2026-11-11（闭环 P2）：心跳也下沉到共享内核了；独立壳要有它才能看"最近跳了什么"。
        // 它只依赖 node 内置，所以独立装也能加载（store 反而常因缺鱼神 lib 而失败，这正是分开的原因）。
        try { out.heartbeat = await import(pathToFileURL(path.join(dir, 'heartbeat.mjs')).href) } catch { out.heartbeat = null }
        out.error = errs.join(' | ')
        if (out.pick || out.store || out.heartbeat) break
      }
      if (!out.dir) out.error = `找不到 memory-core（找过：${CORE_CANDIDATES.join(' / ')}）`
      return out
    })()
  }
  return corePromise
}

// ── 脱敏：优先用鱼神那份 lib/redact.js（仓里或包里），没有就用下面这份保守兜底 ──────────
// 为什么留兜底：独立包漏拷 lib/redact.js 时，不能因此把密钥/手机号原样写进记忆（静默不脱敏比报错更糟）。
const FALLBACK_RULES = [
  [/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '私钥'],
  [/\b(?:sk|ghp|gho|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}/g, 'API密钥'],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, 'Bearer'],
  [/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|passcode|token|cookie)\s*[:=：]\s*[^\s,;，；]{4,}/gi, '键值密钥'],
  [/\b(?:\d[ -]?){16,19}\b/g, '银行卡'],
  [/\b\d{17}[\dXx]\b/g, '身份证'],
  [/\b1[3-9]\d{9}\b/g, '手机号'],
]
let redactPromise = null

export function loadRedact() {
  if (!redactPromise) {
    redactPromise = (async () => {
      for (const p of [path.join(HERE, 'lib', 'redact.js'), path.resolve(HERE, '..', 'lib', 'redact.js')]) {
        if (!fs.existsSync(p)) continue
        try {
          const mod = await import(pathToFileURL(p).href)
          if (typeof mod.redact === 'function') return { redact: mod.redact, from: 'lib/redact.js' }
        } catch { /* 试下一个 */ }
      }
      return { redact: scrubFallback, from: 'builtin' }
    })()
  }
  return redactPromise
}

function scrubFallback(input) {
  let text = String(input ?? '')
  for (const [re, label] of FALLBACK_RULES) text = text.replace(re, `[已隐藏：${label}]`)
  return { text }
}

// ── 内置写手（lite）：格式和 memory-core/store.mjs 的 appendEvent 对齐 ─────────
// 为什么要有它：store.appendEvent 第一步是 getCharacter(role)，通用角色 'default' 在鱼神名册里不存在，
// 会直接抛「没有这个角色」。S4 不许改 memory-core，所以壳这边留一个同格式的写手；
// 能解析出角色的（dayu/xiaoyu/…）仍然优先走 store，落账/审计/逻辑时钟都由它负责。
function readDoc(file) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    return doc && typeof doc === 'object' ? doc : null
  } catch { return null }
}

function emptyDoc() {
  return { version: 1, summary: '', habits: [], dynamics: [], impressions: {}, events: [] }
}

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

/** 目录当锁（和 memory-core/store.mjs 同一做法，理由也一样）：读-改-写不能互相踩。 */
function withLock(file, fn, { waitMs = 20, maxWaitMs = 3000 } = {}) {
  const lockPath = `${file}.lock`
  const deadline = Date.now() + maxWaitMs
  let held = false
  while (!held) {
    try { fs.mkdirSync(lockPath); held = true } catch (e) {
      if (e && e.code === 'EEXIST') {
        if (Date.now() > deadline) {
          try { fs.rmSync(lockPath, { recursive: true, force: true }) } catch { /* 强行收锁 */ }
          continue
        }
        const t = Date.now() + waitMs
        while (Date.now() < t) { /* 等一小会儿 */ }
      } else {
        return fn() // 锁建不了（权限之类）也别把写入堵死
      }
    }
  }
  try { return fn() } finally { try { fs.rmSync(lockPath, { recursive: true, force: true }) } catch { /* 尽力 */ } }
}

function deviceTag() {
  const forced = String(process.env.YUSHEN_DEVICE || '').trim()
  if (forced) return forced.slice(0, 16)
  const android = process.platform === 'android' || String(process.env.PREFIX || '').includes('com.termux')
  return android ? 'phone' : 'desktop'
}

/** 被裁掉的旧事件进冷档（只增不删，和 store.archiveDropped 的规矩一致；位置放在记忆根下）。 */
function archiveDropped(root, role, dropped) {
  if (!Array.isArray(dropped) || !dropped.length) return 0
  try {
    const dir = path.join(root, 'cold', role)
    fs.mkdirSync(dir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    fs.appendFileSync(path.join(dir, `${day}.jsonl`), `${dropped.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8')
    return dropped.length
  } catch { return 0 }
}

/**
 * 内置写手：记一条事件（同步、带锁、去重、脱敏、200 条封顶 + 冷档）。
 * @param {(text: string) => {text: string}} [scrubber] 脱敏函数（默认用兜底规则）
 */
export function appendEventLite(role, { text = '', at = '', tier = 'normal', source = '', channel = DEFAULT_CHANNEL, kind = DEFAULT_KIND, scrubber = null } = {}) {
  const id = roleId(role)
  const raw = String(text || '').trim()
  if (!raw) return { ok: false, reason: '空事件' }
  let value = raw
  try {
    const out = (typeof scrubber === 'function' ? scrubber(raw) : scrubFallback(raw))?.text
    if (typeof out === 'string') value = out.trim()
  } catch { /* 脱敏失败就按原文，宁可记下也不静默丢 */ }
  if (!value) return { ok: false, reason: '空事件（脱敏后为空）' }
  const when = (() => {
    const t = String(at || '').trim()
    return Number.isFinite(Date.parse(t)) ? new Date(Date.parse(t)).toISOString() : new Date().toISOString()
  })()
  const file = memoryFile(id)
  const root = path.dirname(file)
  return withLock(file, () => {
    const memory = readDoc(file) || emptyDoc()
    const events = Array.isArray(memory.events) ? memory.events : []
    const dev = deviceTag()
    // 去重：同设备 + 同通道 + 同类型 + 同文本 + 同一分钟，只记一次（和 store 的指纹同一写法）
    const fingerprint = (e) => crypto.createHash('sha256').update(`${e.device || ''}|${e.session || ''}|${e.channel}|${e.kind}|${String(e.text).slice(0, 200)}|${String(e.at).slice(0, 16)}`).digest('hex')
    const probe = { device: dev, channel, kind, text: value.slice(0, MAX_TEXT), at: when }
    if (events.some((e) => e && e.text && fingerprint(e) === fingerprint(probe))) {
      return { ok: true, duplicate: true, count: events.length, backend: 'lite', file }
    }
    const seq = events.reduce((m, e) => Math.max(m, Number(e && e.seq) || 0), 0) + 1
    const row = {
      at: when,
      channel: String(channel || DEFAULT_CHANNEL).slice(0, 20),
      kind: String(kind || DEFAULT_KIND).slice(0, 20),
      text: value.slice(0, MAX_TEXT),
      source: String(source || '').slice(0, 200),
      verified: false,
      tier: TIERS.has(String(tier)) ? String(tier) : 'normal',
      clarity: 'vivid',
      pinned: false,
      lastSeenAt: when,
      recallCount: 0,
      by: '',
      device: dev,
      // 和 store 同一个 id 公式：id = sha1(device|session|at|channel|text[0:120])
      id: `m-${crypto.createHash('sha1').update(`${dev}||${when}|${channel}|${value.slice(0, 120)}`).digest('hex').slice(0, 10)}`,
      seq,
    }
    const merged = [...events, row]
    if (merged.length > MAX_EVENTS) archiveDropped(root, id, merged.slice(0, merged.length - MAX_EVENTS))
    const next = merged.slice(-MAX_EVENTS)
    writeAtomic(file, { ...memory, version: memory.version ?? 1, updatedAt: when, events: next })
    return { ok: true, appended: true, count: next.length, id: row.id, seq: row.seq, file, backend: 'lite' }
  })
}

/** 读某个角色的热档事件（只读；坏文件当没有）。 */
export function readEventsOf(role) {
  const doc = readDoc(memoryFile(role))
  return Array.isArray(doc?.events) ? doc.events : []
}

// ── 三个对外接口（工具层只是它们的薄包装）────────────────────────────────────

/**
 * 记一条：优先 memory-core 的 store（落账/审计/逻辑时钟齐全），
 * 解析不出角色（通用 'default'）或 MEMORY_HOME 换了根时用内置写手。
 * @returns {{ok:boolean, id?:string, backend:'memory-core'|'lite', file?:string, ...}}
 */
export async function remember({ role, text = '', tier = 'normal', source = '', at = '' } = {}) {
  const id = roleId(role)
  if (!String(text || '').trim()) return { ok: false, reason: '空事件' }
  const target = memoryFile(id)
  const core = await loadCore()
  let storeError = ''
  // 只有「store 认这个角色，且它记的正是这个文件」时才交给它——否则写偏了文件，status/recall 会读不到。
  if (core.store) {
    try {
      const storeFile = core.store.memoryFile(id)
      if (samePath(storeFile, target)) {
        const r = core.store.appendEvent(id, {
          text,
          ...(at ? { at } : {}),
          tier,
          source,
          channel: DEFAULT_CHANNEL,
          kind: DEFAULT_KIND,
        })
        if (r && r.ok) return { ...r, backend: 'memory-core' }
        if (r && r.reason) return { ...r, backend: 'memory-core' }
      }
    } catch (e) {
      // 「没有这个角色」是预期内的（通用角色没有名册），其他错误也先降级，但把原因带回去
      storeError = String(e?.message || e).slice(0, 160)
    }
  }
  const redactMod = await loadRedact()
  const r = appendEventLite(id, { text, tier, source, at, channel: DEFAULT_CHANNEL, kind: DEFAULT_KIND, scrubber: redactMod?.redact })
  return storeError ? { ...r, storeError } : r
}

/** 记忆根能不能交给 pick 直接读（pick 只认 <DSH_HOME>/dayu/soul/memory）。 */
function pickPath(role) {
  return path.join(dshHome(), 'dayu', 'soul', 'memory', `${role}.json`)
}

function deriveDshHome(file) {
  const root = path.dirname(file)
  const soul = path.dirname(root)
  const dayu = path.dirname(soul)
  if (path.basename(root).toLowerCase() !== 'memory') return ''
  if (path.basename(soul).toLowerCase() !== 'soul') return ''
  if (path.basename(dayu).toLowerCase() !== 'dayu') return ''
  return path.dirname(dayu)
}

/** 临时把 DSH_HOME 指到某个根上（pick 在调用时读 env，同步调用，外面不会插进来）。 */
function withDshHome(home, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'DSH_HOME')
  const prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try { return fn() } finally {
    if (had) process.env.DSH_HOME = prev
    else delete process.env.DSH_HOME
  }
}

/** MEMORY_HOME 不是标准 <X>/dayu/soul/memory 结构时的只读视图：拷一份到根下的 .dsh-memory-view 让 pick 读。 */
function pickViaView(pickMod, role, target, n, cue) {
  if (!fs.existsSync(target)) return { items: [] }
  const view = path.join(path.dirname(target), '.dsh-memory-view')
  const viewFile = path.join(view, 'dayu', 'soul', 'memory', `${role}.json`)
  try {
    fs.mkdirSync(path.dirname(viewFile), { recursive: true })
    fs.copyFileSync(target, viewFile)
  } catch (e) {
    return { error: `读不到 ${target}：${e.message}` }
  }
  return { items: withDshHome(view, () => pickMod.pickForInject(role, { n, cue })) }
}

/** budget 只做截断：按总字数上限留前几条，超了就把最后一条裁短并标 trimmed。 */
function clipByBudget(items, budget) {
  const cap = Number(budget)
  if (!Array.isArray(items) || !items.length) return Array.isArray(items) ? items : []
  if (budget === null || budget === undefined || !Number.isFinite(cap) || cap <= 0) return items
  const out = []
  let used = 0
  for (const it of items) {
    const len = String(it?.text || '').length
    if (used + len <= cap) { out.push(it); used += len; continue }
    const room = cap - used
    if (room > 0) out.push({ ...it, text: String(it.text).slice(0, room), trimmed: true })
    break
  }
  return out
}

/**
 * 按线索想：cue 非空走 pick 的相关性选法；不传 cue 就是「最新 1 + 分数补满」的老行为。
 * 不截断时结果与 memory-core/pick.mjs 的 pickForInject(role,{n}) 逐字一致（冒烟里锁着）。
 * @returns {{ok:boolean, items:Array, readMode:'direct'|'swap'|'view', file:string}}
 */
export async function recall({ role, cue = '', n = DEFAULT_N, budget = DEFAULT_BUDGET } = {}) {
  const id = roleId(role)
  const core = await loadCore()
  if (!core.pick) return { ok: false, error: 'memory-core/pick.mjs 没加载到', detail: core.error || '' }
  const target = memoryFile(id)
  const direct = pickPath(id)
  let items = []
  let readMode = 'direct'
  if (samePath(target, direct)) {
    readMode = 'direct'
    items = core.pick.pickForInject(id, { n, cue })
  } else {
    const derived = deriveDshHome(target)
    if (derived) {
      readMode = 'swap'
      items = withDshHome(derived, () => core.pick.pickForInject(id, { n, cue }))
    } else {
      readMode = 'view'
      const view = pickViaView(core.pick, id, target, n, cue)
      if (view.error) return { ok: false, error: view.error, role: id, readMode }
      items = view.items
    }
  }
  const cap = budget === null || budget === undefined ? null : budget
  return {
    ok: true,
    role: id,
    cue: String(cue || ''),
    n: Number.isFinite(Number(n)) ? Number(n) : DEFAULT_N,
    budget: cap,
    file: target,
    readMode,
    backend: 'memory-core/pick',
    items: clipByBudget(items, cap),
  }
}

function countOf(value) {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.length
  if (typeof value === 'object') return Object.keys(value).length
  return null
}

/**
 * 看家底：事件数、实体数/情节数（有 episodes 才报）、最近一条时间、文件在哪。
 * 只读，不建文件、不调模型。
 */
export async function status({ role } = {}) {
  const id = roleId(role)
  const file = memoryFile(id)
  const doc = readDoc(file)
  const events = Array.isArray(doc?.events) ? doc.events : []
  const last = events.reduce((acc, e) => {
    const at = String(e?.at || '')
    return at > acc ? at : acc
  }, '')
  const core = await loadCore()
  const redactMod = await loadRedact()
  let sizeBytes = null
  try { sizeBytes = fs.statSync(file).size } catch { /* 还没有文件 */ }
  const episodes = countOf(doc?.episodes)
  // backend = 这个 role 写入时实际走哪条路（和 remember 同一判断），不是「库有没有加载」。
  // default 这类通用角色在鱼神名册里没有 → lite；dayu/xiaoyu 解析得出来 → memory-core。
  const storeLoaded = Boolean(core.store)
  let viaStore = false
  try { viaStore = storeLoaded && samePath(core.store.memoryFile(id), file) } catch { viaStore = false }
  return {
    ok: true,
    role: id,
    root: memoryRoot(),
    file,
    exists: Boolean(doc),
    backend: viaStore ? 'memory-core' : 'lite',
    storeLoaded,
    pick: Boolean(core.pick),
    redact: redactMod?.from || 'none',
    events: events.length,
    max: MAX_EVENTS,
    entities: countOf(doc?.entities),
    episodes,
    hasEpisodes: episodes !== null,
    lastAt: last,
    updatedAt: String(doc?.updatedAt || ''),
    sizeBytes,
  }
}

// ── 工具层（形状照 dayu/index.js 的 registerTool：name/description/parameters/output/execute）──
const toolOutput = {
  schema: { type: 'object', additionalProperties: true },
  render(args, value) {
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  },
}

const ROLE_PARAM = {
  type: 'string',
  description: `写到/读哪个记忆文件：默认 ${DEFAULT_ROLE}。填 dayu / xiaoyu 等就是鱼神那几份同名文件（同格式，可共享）。`,
}

async function guard(fn) {
  try { return await fn() } catch (e) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/**
 * 看心跳（只读）：最近跳了什么、今天跳了几次。
 * 2026-11-11（闭环 P2）：心跳下沉到 memory-core/heartbeat.mjs，这个壳不依赖鱼神也能读。
 * **不解释**：`trigger` 是什么意思、哪几种算"醒"，这里一概不懂，原样返回。
 */
export async function heartbeat({ role = '', action = 'read', day = '', days = 3 } = {}) {
  const core = await loadCore()
  if (!core.heartbeat) return { ok: false, error: 'memory-core 里没有 heartbeat.mjs（核心太旧？）', core: core.dir || '' }
  const id = String(role || '').trim() ? roleId(role) : ''
  const span = Math.max(1, Math.min(31, Number(days) || 1))
  if (String(action) === 'summary') {
    const s = core.heartbeat.summary(id, { days: span })
    return { ...s, role: id || '(全部角色)', backend: 'memory-core/heartbeat.mjs' }
  }
  const rows = core.heartbeat.read(id, { day: String(day || ''), days: span })
  return {
    ok: true,
    role: id || '(全部角色)',
    count: rows.length,
    items: rows.slice(0, 50),
    backend: 'memory-core/heartbeat.mjs',
    note: '只读；trigger 的含义由角色那边定，这里不解释',
  }
}

const rememberTool = {
  name: 'memory_remember',
  description: '记一条通用记忆（事件）：谁说了什么、发生了什么事。这是通用记忆，不含人格（没有角色卡、宪章、好感、账本）；和鱼神双子星用同一份 JSON 格式，数据可共享，也能单独用。空文本不记。',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要记的内容（最长 400 字，入库前脱敏）' },
      tier: { type: 'string', enum: ['core', 'important', 'normal'], description: '重要程度，默认 normal；core 每轮都会带，important 按需翻' },
      source: { type: 'string', description: '这条从哪来（可选，比如“文件”“网页”）' },
      at: { type: 'string', description: '发生时间（ISO；不传就是现在）' },
      role: ROLE_PARAM,
    },
    required: ['text'],
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(() => remember({
      role: args?.role,
      text: String(args?.text ?? ''),
      tier: args?.tier,
      source: args?.source,
      at: args?.at,
    }))
  },
}

const recallTool = {
  name: 'memory_recall',
  description: '按线索想：给一句话（cue），返回最相关的 n 条记忆；不传 cue 就是「最近一条 + 分数补满」的老选法。这是通用记忆，不含人格。budget 是总字数上限（默认 300，超了截断）。',
  parameters: {
    type: 'object',
    properties: {
      cue: { type: 'string', description: '线索（一句话也行）；不传就是按时间/重要程度选' },
      n: { type: 'number', description: `要几条，默认 ${DEFAULT_N}` },
      budget: { type: 'number', description: `总字数上限，默认 ${DEFAULT_BUDGET}；0 或 null = 不截断` },
      role: ROLE_PARAM,
    },
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(() => recall({
      role: args?.role,
      cue: String(args?.cue ?? ''),
      n: args?.n,
      budget: args?.budget,
    }))
  },
}

const statusTool = {
  name: 'memory_status',
  description: '看家底：事件数、实体数、情节数（有 episodes 才报）、最近一条时间、文件在哪、当前用哪个写手。只读，不调模型。这是通用记忆，不含人格。',
  parameters: {
    type: 'object',
    properties: {
      role: ROLE_PARAM,
    },
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(() => status({ role: args?.role }))
  },
}

const heartbeatTool = {
  name: 'memory_heartbeat',
  description: '看心跳（只读）：最近跳了什么、今天跳了几次。这是通用记忆旁边的"时间线"，不含人格；也不解释 trigger 的含义——那是角色自己的事。装它的人能看"最近跳了什么"，拿不到角色卡/底线/契约。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['read', 'summary'], description: 'read=最近几跳；summary=今天跳了几次（按 trigger 原样分组）' },
      role: { type: 'string', description: '看哪个角色（dayu/xiaoyu/…）；不填=全部角色' },
      day: { type: 'string', description: 'read 时只看某一天（YYYY-MM-DD）；不填=最近几天' },
      days: { type: 'number', description: '看最近几天，默认 3，最多 31' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(() => heartbeat({
      action: args?.action,
      role: args?.role,
      day: args?.day,
      days: args?.days,
    }))
  },
}

/** 决定簿（通用核心）：记/看长期决定；和鱼神同一份实现，独立包写自己的目录。 */
const defineTool = {
  name: 'memory_define',
  description: '决定簿：记/看长期决定（老板定过的口径、设计、边界）。只记一句话+出处；同文去重；同话题“更正/改成”会覆盖旧的。这是通用记忆，不含人格。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'add'], description: 'list 看最近 / add 记一条' },
      text: { type: 'string', description: '用一句话复述这条决定（add 必填）' },
      quote: { type: 'string', description: '原话（可选）' },
      source: { type: 'string', description: '出自哪次对话/哪份文档（可选）' },
      limit: { type: 'number', description: 'list 看几条，默认 10' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(async () => {
      const g = await loadGeneric('definitions')
      const dir = roleDir(String(args?.role || ''))
      if (String(args?.action || 'list') === 'add') {
        return g.addDefinition({ text: String(args?.text || ''), quote: String(args?.quote || ''), source: String(args?.source || ''), dir })
      }
      return { ok: true, items: g.readDefinitions({ limit: Number(args?.limit) || 10, dir }) }
    })
  },
}

/** 自我记忆（通用核心）：做过/学到/记得/看法/对人/答应自己/想做/没想通。 */
const selfTool = {
  name: 'memory_self',
  description: '自我记忆：我做过/学到/有印象的瞬间/看法/对人/答应自己/想做/没想通。用第一人称一句话记，不抄事实。这是通用记忆，不含人格。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'add'], description: 'list 看最近 / add 记一条' },
      kind: { type: 'string', enum: ['deed', 'lesson', 'moment', 'stance', 'bond', 'vow', 'wish', 'open'], description: 'add 必填' },
      text: { type: 'string', description: '一句话（add 必填）' },
      emotion: { type: 'string', description: '当时的情绪，一个词（可选）' },
      about: { type: 'string', description: '涉及谁（可选）' },
      ref: { type: 'string', description: '出处/关联（可选）' },
      limit: { type: 'number', description: 'list 看几条，默认 10' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(async () => {
      const g = await loadGeneric('self-memory')
      const dir = roleDir(String(args?.role || ''))
      if (String(args?.action || 'list') === 'add') {
        return g.appendSelf({ kind: String(args?.kind || 'deed'), text: String(args?.text || ''), emotion: String(args?.emotion || ''), about: String(args?.about || ''), ref: String(args?.ref || ''), role: String(args?.role || 'dayu'), dir })
      }
      return { ok: true, items: g.readSelf({ limit: Number(args?.limit) || 10, kind: String(args?.kind || ''), dir }) }
    })
  },
}

/** 通用“一页现在”：最近事件 + 最近决定 + 我记得的自己；只读。 */
const nowTool = {
  name: 'memory_now',
  description: '一页“现在”（通用记忆）：最近事件、最近决定、我最近记得的自己；只读，不写账。不含鱼神的议程/心情；这是通用记忆，不含人格。',
  parameters: {
    type: 'object',
    properties: {
      role: { type: 'string', description: '看哪个角色的事件（默认 dayu）' },
      maxChars: { type: 'number', description: '总字数上限，默认 320' },
    },
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(async () => {
      const g = await loadGeneric('now-page')
      const dir = roleDir(String(args?.role || ''))
      const file = memoryFile(String(args?.role || 'dayu'))
      return { ok: true, text: g.buildGenericNow({ dir, memoryFile: file, maxChars: Number(args?.maxChars) || 320 }) }
    })
  },
}

/** 通用卡片：经验/知识/错题/任务/人物；只追加，可按词搜。 */
const cardTool = {
  name: 'memory_card',
  description: '通用卡片：记一张经验/知识/错题/任务/人物，或按词搜卡片。只追加、不删旧卡；这是通用记忆，不含人格。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'list', 'search'], description: 'add 记一张 / list 列 / search 按词搜' },
      kind: { type: 'string', enum: ['经验', '知识', '错题', '任务', '人物'], description: '卡片类型（add/list 用）' },
      head: { type: 'string', description: '一句话标题（add 必填）' },
      detail: { type: 'string', description: '细节/结论（可选）' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签（可选）' },
      q: { type: 'string', description: 'search 用：搜什么' },
      limit: { type: 'number', description: 'list/search 条数，默认 10/5' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(async () => {
      const g = await loadGeneric('cards')
      const dir = roleDir(String(args?.role || ''))
      const action = String(args?.action || 'list')
      if (action === 'add') return g.addCard({ dir, kind: String(args?.kind || '经验'), head: String(args?.head || ''), detail: String(args?.detail || ''), tags: args?.tags })
      if (action === 'search') return { ok: true, items: g.searchCards(String(args?.q || ''), { dir, limit: Number(args?.limit) || 5 }) }
      return { ok: true, items: g.listCards({ dir, kind: String(args?.kind || ''), limit: Number(args?.limit) || 10 }) }
    })
  },
}

/** 单角色 / 多角色：看/切模式。不是每个人都要开多角色。 */
const modeTool = {
  name: 'memory_mode',
  description: '单角色 / 多角色模式（通用记忆设置）：single=一个角色、数据就在 ~/.dsh/dsh-memory；multi=每个角色一个 roles/<role> 子目录，互不混。不是每个人都需要多角色；这是通用记忆，不含人格。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['get', 'set'], description: 'get 看当前 / set 切换' },
      mode: { type: 'string', enum: ['single', 'multi'], description: 'set 用' },
      migrate: { type: 'boolean', description: 'set multi 时把 single 旧数据拷进 roles/default（copy，不删原件）' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  output: toolOutput,
  async execute(args) {
    return guard(() => {
      if (String(args?.action || 'get') === 'set') {
        const r = setMemoryMode(String(args?.mode || ''), { migrate: Boolean(args?.migrate) })
        const b = bindRoles()
        return r.ok ? { ok: true, mode: memoryMode(), changed: true, migrated: r.migrated || [], roles: b.roles } : r
      }
      const b = bindRoles()
      return { ok: true, mode: memoryMode(), dir: roleDir(''), roles: b.roles, firstCheck: Boolean(readConfig().firstCheckAt) }
    })
  },
}

/** 有哪些角色（单角色模式也至少有一个）。 */
const rolesTool = {
  name: 'memory_roles',
  description: '看这台机器上通用记忆里出现过哪些角色；single 模式下通常只有一个，multi 模式下列出 roles/<role> 目录。只读；这是通用记忆，不含人格。',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  output: toolOutput,
  async execute() {
    return guard(() => ({ ok: true, mode: memoryMode(), roles: listMemoryRoles() }))
  },
}

/** 十个工具定义（记/查/状态/心跳/决定/自我/现在/卡片/模式/角色）——冒烟直接 import，不需要真跑宿主。 */
export const memoryToolDefs = [rememberTool, recallTool, statusTool, heartbeatTool, defineTool, selfTool, nowTool, cardTool, modeTool, rolesTool]

function svc(ctx, key) {
  try {
    const value = ctx?.[key]
    if (value) return value
  } catch { /* 没注入时取属性可能抛 */ }
  try {
    return typeof ctx?.get === 'function' ? ctx.get(key) : undefined
  } catch {
    return undefined
  }
}

function log(msg) {
  try { console.log(`[dsh-memory] ${msg}`) } catch { /* 没有控制台就算了 */ }
}

function sendJson(res, code, data) {
  try {
    res.statusCode = code
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data))
  } catch { /* 连接断了就算了 */ }
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

function memoryRoles() {
  try {
    return fs.readdirSync(memoryRoot()).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
  } catch { return [] }
}

export function apply(ctx) {
  const tools = svc(ctx, 'tools')
  if (tools?.register) {
    for (const def of memoryToolDefs) {
      // tools.register() 的反注册器被挂进 **ToolRuntime 自己的** fiber（dsh-tools/lib/index.js:2974/2982
      // layers.effect(this.ctx, …)），不跟着本插件卸载。用 ctx.effect 包一层，插件被禁用/HMR 重载时
      // 3 个工具才会一起撤掉、不留半份（host-plugin.md:64 的要求）。
      // 冒烟和直接调用传的是普通对象，没有 ctx.effect —— 那时照旧直接注册。
      if (typeof ctx?.effect === 'function') ctx.effect(() => tools.register(def))
      else tools.register(def)
    }
  } else {
    log('tools 服务不可用：3 个工具没挂上（模块本身仍可 import 直接调）')
  }

  // 采集：独立插件自己的事件订阅；数据根在 root-config 里已切到 dsh-memory。
  const capture = createTurnCapture({ log, enabled: () => true })
  const recoverTimer = setTimeout(() => { capture.recover().catch(() => {}) }, 60 * 1000)
  try { recoverTimer.unref?.() } catch { /* 老 Node 没有 unref 就算了 */ }
  if (typeof ctx?.on === 'function') {
    ctx.effect(() => ctx.on('session/event', (session, event) => {
      try { capture.handle(session, event) } catch (e) { log(`采集失败：${e?.message || e}`) }
    }))
  }

  // 自己的后台接口：/api/dsh-memory/*。页面在 ./client.js，不挂在鱼神那边。
  const web = svc(ctx, 'webServer')
  if (!web?.register) return
  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const route = url.pathname.replace(/^\/api\/dsh-memory/, '') || '/'
    try {
      if (req.method === 'GET' && route === '/control') {
        return sendJson(res, 200, {
          ok: true,
          control: readControl(),
          paths: memoryPaths(),
          status: memoryStatus(),
          roles: memoryRoles().map((id) => ({ id })),
        })
      }
      if (req.method === 'POST' && route === '/control') {
        const body = await readBody(req)
        const patch = {}
        if (body.sourceEnabled !== undefined) patch.sourceEnabled = body.sourceEnabled === true
        if (body.captureFrom !== undefined) patch.captureFrom = String(body.captureFrom || 'source')
        if (body.archiveDays !== undefined) patch.archiveDays = Number(body.archiveDays)
        if (body.roles && typeof body.roles === 'object') patch.roles = body.roles
        const control = writeControl(patch)
        return sendJson(res, 200, { ok: true, control, status: memoryStatus() })
      }
      if (req.method === 'POST' && route === '/open') {
        const body = await readBody(req)
        const which = String(body.which || 'source')
        const p = memoryPaths()[which]
        if (!p || !fs.existsSync(p)) return sendJson(res, 400, { ok: false, error: `没有这个目录：${which}` })
        const cmd = process.platform === 'win32' ? 'explorer.exe' : (process.platform === 'darwin' ? 'open' : 'xdg-open')
        spawn(cmd, [p], { detached: true, stdio: 'ignore' }).unref()
        return sendJson(res, 200, { ok: true, path: p })
      }
      return sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
    }
  }
  if (typeof ctx?.effect === 'function') ctx.effect(() => web.register({ kind: 'prefix', path: '/api/dsh-memory', handler }))
  else web.register({ kind: 'prefix', path: '/api/dsh-memory', handler })
}
