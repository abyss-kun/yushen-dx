// 翻译器：把「别人说的话」翻成她能读懂的观察。
//
// 分工（2026-10-26 定）：
//   L0 本地翻译 → 只写**观察**，不写结论（"他连问三次"对，"他在挑衅你"错）
//   L1 她初判   → 只决定"值不值得认真想"（注意力的门，不是回不回的决定）
//   L2 云端细读 → 连原文和上下文一起看，认真想
//
// 后端可选：local / remote / off（`runtime/backends.json` 或环境变量）。
// 探测不到本地引擎就回落，并且**如实说**，不假装看懂了。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir, ensureRuntime } from './runtime.js'
import { localLlmDir } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
export const BACKENDS = Object.freeze(['remote', 'hybrid', 'local', 'off'])

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
}

function configFile() { return path.join(DATA, 'backends.json') }

/** 全局后端配置；默认 remote（出厂版不能假定别人有本地模型）。 */
export function readBackends() {
  const raw = readJson(configFile(), {}) || {}
  const def = String(raw.default || 'remote')
  const byRole = raw.roles && typeof raw.roles === 'object' ? raw.roles : {}
  return {
    version: 1,
    default: BACKENDS.includes(def) ? def : 'remote',
    roles: Object.fromEntries(Object.entries(byRole).filter(([, v]) => BACKENDS.includes(String(v)))),
    local: raw.local || {},
  }
}

export function backendFor(role) {
  const cfg = readBackends()
  return cfg.roles[String(role)] || cfg.default
}

export function setBackend({ role = '', backend = 'remote', now = Date.now() } = {}) {
  if (!BACKENDS.includes(String(backend))) throw new Error(`后端不认识：${backend}（可用：${BACKENDS.join(' / ')}）`)
  const cfg = readBackends()
  if (role) cfg.roles[String(role)] = String(backend)
  else cfg.default = String(backend)
  cfg.updatedAt = new Date(now).toISOString()
  writeJson(configFile(), cfg)
  return cfg
}

/** 本地引擎在不在：找 llama-server / ollama / .gguf；只读，不启动。 */
export function probeLocal({ home = HOME, extraPaths = [] } = {}) {
  const found = { engine: '', model: '', ready: false, checked: [] }
  // 优先 server（能一直服务），其次 cli（只能一次性跑），最后 ollama
  const exePref = ['llama-server.exe', 'llama-cli.exe', 'ollama.exe']
  const dirs = [
    path.join(DATA, 'local'), path.join(DATA, 'local', 'bin'), path.join(DATA, 'local', 'models'),
    localLlmDir(), path.join(localLlmDir(), 'bin'), path.join(localLlmDir(), 'models'),
    ...extraPaths,
  ]
  const seen = []
  for (const dir of dirs) {
    found.checked.push(dir)
    if (!fs.existsSync(dir)) continue
    let entries = []
    try { entries = fs.readdirSync(dir) } catch { continue }
    for (const name of entries) {
      const full = path.join(dir, name)
      if (exePref.includes(name)) seen.push(full)
      if (!found.model && /\.gguf$/i.test(name)) found.model = full
    }
  }
  for (const pref of exePref) {
    const hit = seen.find((f) => f.toLowerCase().endsWith(pref))
    if (hit) { found.engine = hit; break }
  }
  if (process.env.YUSHEN_LOCAL_ENGINE) found.engine = String(process.env.YUSHEN_LOCAL_ENGINE)
  if (process.env.YUSHEN_LOCAL_MODEL) found.model = String(process.env.YUSHEN_LOCAL_MODEL)
  found.ready = Boolean(found.engine && found.model)
  found.note = found.ready ? '本地引擎和模型都在' : `缺${found.engine ? '' : '引擎'}${!found.engine && !found.model ? '和' : ''}${found.model ? '' : '模型'}`
  return found
}

/** 一条消息 → 观察（不替她下结论）。纯本地、零 token，不需要模型。 */
export function observe(message = {}, { now = Date.now() } = {}) {
  const text = String(message.text || '')
  const at = Date.parse(message.at || '') || now
  const minutes = Math.max(0, Math.round((now - at) / 60000))
  const marks = []
  if (message.atMe) marks.push('点了她的名')
  if (/[?？]/.test(text)) marks.push('在问问题')
  if (/[!！]{2,}|[。，,]{3,}/.test(text)) marks.push('标点很重')
  if (text.length <= 4) marks.push('只有几个字')
  if (message.media) marks.push(`带 ${message.media} 张图`)
  return {
    id: message.id || '',
    who: message.name || message.userId || '谁',
    at: new Date(at).toISOString(),
    agoMinutes: minutes,
    chars: text.length,
    marks,
    // 只给原文，不给"什么意思"。意思要靠翻译器或她自己读。
    text,
  }
}

/**
 * 翻译一批：返回观察清单。
 * - 没有本地引擎时**不编**，原样返回观察 + `translated:false`；
 * - 有引擎时留接口（下一步接 llama-server），输出必须是观察，不许是结论。
 */
export function translateBatch(role, messages = [], { now = Date.now(), backend = '' } = {}) {
  ensureRuntime(role)
  const mode = backend || backendFor(role)
  const local = probeLocal()
  const canLocal = mode === 'local' || mode === 'hybrid'
  const items = messages.map((m) => observe(m, { now }))
  const out = {
    role,
    backend: mode,
    translated: false,
    engine: local.engine,
    model: local.model,
    items,
    note: '',
  }
  if (mode === 'off') { out.note = '后端关着：她只记账，不看内容'; return out }
  if (!canLocal) { out.note = `后端=${mode}：不做本地翻译，交给云端读原文`; return out }
  if (!local.ready) { out.note = `本地引擎没接上（${local.note}）：先按观察给，不假装翻译过`; return out }
  // 有引擎才走到这里；真正的推理调用在 scripts/local-translate.mjs 里接。
  out.translated = false
  out.note = '本地引擎在，但翻译调用还没接上（下一步）'
  return out
}

/** 出厂/诊断用：现在这台机器能撑哪一档。 */
export function capabilityReport() {
  const local = probeLocal()
  const cfg = readBackends()
  return {
    default: cfg.default,
    roles: cfg.roles,
    local,
    canRun: local.ready ? (cfg.default === 'local' ? 'local' : 'hybrid') : 'remote',
    note: local.ready ? '本地可用' : '本地不可用：会自动留在 remote/off，不会假装',
  }
}

// ── 本地嗓子（llama-server）─────────────────────────────────────
const PORT = Number(process.env.YUSHEN_LOCAL_PORT || 8088)
const BASE = `http://127.0.0.1:${PORT}`
const LOCAL_DIR = path.join(HOME, 'dayu', 'local')
const LOCAL_USE_FILE = path.join(LOCAL_DIR, 'last-use')

/** 记一笔"本地模型刚被用过"（用来判能不能关）。 */
function touchLocalUse(now = Date.now()) {
  try {
    fs.mkdirSync(LOCAL_DIR, { recursive: true })
    fs.writeFileSync(LOCAL_USE_FILE, String(now), 'utf8')
  } catch { /* 记不下最多多占一会儿内存 */ }
}
export function localLastUse() {
  try { return Number(fs.readFileSync(LOCAL_USE_FILE, 'utf8').trim()) || 0 } catch { return 0 }
}

/**
 * 本地引擎闲着就关掉——**用完就退，不常驻**。
 * 为什么要有：2026-10-27 浅睡把它拉起来后常驻 24 小时，占了 7.26 GB 内存，
 * 期间只用过几次、每次几十秒。占着内存不干活，是纯浪费。
 * @returns {{ok:boolean, killed?:boolean, pid?:number, skipped?:string}}
 */
export async function releaseLocalServer({ maxIdleMs = 10 * 60 * 1000, force = false, now = Date.now() } = {}) {
  if (!(await localHealth())) return { ok: true, killed: false, skipped: '本地引擎没在跑' }
  const last = localLastUse()
  if (!force && last && now - last < maxIdleMs) {
    return { ok: true, killed: false, skipped: `最近 ${Math.round((now - last) / 60000)} 分钟用过` }
  }
  // 找听这个端口的进程，确认是本地引擎再杀（不按名字乱杀）
  let pid = 0
  try {
    const { execFile } = await import('node:child_process')
    const out = await new Promise((resolve) => {
      execFile('netstat', ['-ano', '-p', 'tcp'], { timeout: 8000, windowsHide: true }, (e, so) => resolve(e ? '' : String(so || '')))
    })
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(new RegExp(`^TCP\\s+\\S+:${PORT}\\s+\\S+\\s+LISTENING\\s+(\\d+)$`, 'i'))
      if (m) { pid = Number(m[1]); break }
    }
  } catch { /* 找不到就不杀 */ }
  if (!pid) return { ok: false, killed: false, skipped: '找不到监听进程（可能已退出）' }
  try {
    const { execFile } = await import('node:child_process')
    // 核对进程名：确认是 llama-server 才动
    const name = await new Promise((resolve) => {
      execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeout: 8000, windowsHide: true }, (e, so) => resolve(e ? '' : String(so || '')))
    })
    if (!/llama-server/i.test(name)) return { ok: false, killed: false, skipped: `pid ${pid} 不是本地引擎（${name.slice(0, 40)}）` }
    process.kill(pid, 'SIGKILL')
    return { ok: true, killed: true, pid }
  } catch (e) {
    return { ok: false, killed: false, skipped: String(e?.message || e) }
  }
}

export async function localHealth() {
  try { const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(1200) }); return r.ok } catch { return false }
}

/** 起本地服务（已在跑就直接用）；起不来就抛，调用方负责回落。 */
export async function ensureLocalServer({ waitSeconds = 180 } = {}) {
  const local = probeLocal()
  if (!local.ready) throw new Error(`本地引擎没装好：${local.note}`)
  if (await localHealth()) return { started: false, port: PORT }
  const { spawn } = await import('node:child_process')
  // 服务日志落到本地目录：起不来时能看为什么
  let out = 'ignore'
  try {
    const logFile = path.join(path.dirname(local.engine), 'llama-server.log')
    out = (await import('node:fs')).openSync(logFile, 'a')
  } catch { out = 'ignore' }
  const child = spawn(local.engine, [
    '-m', local.model, '-c', '4096', '--host', '127.0.0.1', '--port', String(PORT),
    '-t', String(Math.max(2, Math.min(8, os.cpus().length - 2))), '--no-webui',
  ], { detached: true, stdio: ['ignore', out, out] })
  child.unref()
  for (let i = 0; i < waitSeconds; i += 1) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await localHealth()) return { started: true, pid: child.pid, port: PORT }
  }
  throw new Error(`本地服务 ${waitSeconds} 秒没起来（看 bin/llama-server.log）`)
}

/** 2026-10-30：请求格式规范化。
 *  本地模型对格式极敏感（角色名错一个字母、空消息、content 是数组而不是字符串，
 *  都会让它“看起来在答，其实答歪了”）。发之前统一：角色只留三种、内容压成纯文本、空的丢掉。 */
export function normalizeMessages(messages) {
  const ALLOWED = new Set(['system', 'user', 'assistant'])
  const out = []
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m) continue
    const role = String(m.role || '').toLowerCase()
    if (!ALLOWED.has(role)) continue
    const raw = Array.isArray(m.content)
      ? m.content.map((p) => (typeof p === 'string' ? p : String(p?.text || ''))).join('')
      : String(m.content ?? '')
    const text = raw.replace(/\r\n/g, '\n').trim()
    if (!text) continue
    out.push({ role, content: text })
  }
  return out
}

/** 从本地服务的返回里取文本：有的版本给字符串，有的给数组。 */
export function pickLocalText(data) {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) return content.map((p) => String(p?.text || '')).join('').trim()
  return String(data?.content || data?.choices?.[0]?.text || '').trim()
}

/** 跟本地模型说一句话，拿回文本。 */
export async function chatLocal(messages, { maxTokens = 400, temperature = 0.3, timeoutMs = 120000 } = {}) {
  const msgs = normalizeMessages(messages)
  if (!msgs.length) throw new Error('没有可发的消息（角色或内容不合法）')
  await ensureLocalServer()
  const r = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'local', temperature, max_tokens: maxTokens, messages: msgs }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`本地服务返回 ${r.status}`)
  const data = await r.json()
  touchLocalUse() // 记一笔：这次真用过；闲着超过 10 分钟就会被关掉，不再常驻占内存
  return pickLocalText(data)
}
