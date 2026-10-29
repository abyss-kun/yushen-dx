// 鱼神 · Copyright (c) 2026 用户. All rights reserved.
// 常驻身体：一条角色 = 一条固定的 DSH 会话（有 id、有模型、有本体卡），不是每条消息现拼一个临时实例。
// 这里只做账本与“建/找回/叫醒”的通用件；具体怎么建会话由入口把 deps 传进来（方便测，不绑死宿主 API）。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { soulStatus, buildSceneText, buildIdentityText } from './soul.js'
import { getCharacter, listCharacters } from './characters.js'
import { isAwake } from './awakening.js'
import { buildMindBrief, mindRoles, MAX_QUERY } from './mind-store.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const LEDGER = path.join(DATA, 'residence.json')
const LOCK = path.join(DATA, 'residence.lock')

/** 角色的常驻规格来自名册：标题、称呼、工作目录都跟着角色走，不再写死三个人。 */
function specOf(role) {
  const c = getCharacter(role)
  return { title: c.title, label: c.name, cwd: c.cwd || process.env.DSH_WORKSPACE || os.homedir(), model: c.model }
}
export function residentRoles() {
  return listCharacters().map((c) => c.id)
}
// 兼容旧引用；新代码请用 residentRoles()。
export const RESIDENT_ROLES = ['dayu', 'xiaoyu', 'dragon']

function stamp() { return new Date().toISOString() }

/** 账本：谁有身体、身体在哪、上次什么时候醒过。坏了就当空账，不挡主流程。 */
export function readLedger() {
  try {
    const raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8').replace(/^\uFEFF/, ''))
    const roles = raw && typeof raw.roles === 'object' && raw.roles ? raw.roles : {}
    return { version: 1, updatedAt: String(raw?.updatedAt || ''), roles }
  } catch {
    return { version: 1, updatedAt: '', roles: {} }
  }
}

function writeLedger(ledger) {
  fs.mkdirSync(DATA, { recursive: true })
  const next = { version: 1, updatedAt: stamp(), roles: ledger.roles || {} }
  const tmp = `${LEDGER}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, LEDGER)
  return next
}

/** 记一条身体。只写这一角色，不碰别人。 */
export function markBody(role, patch = {}) {
  if (!residentRoles().includes(role)) throw new TypeError(`未知角色：仅允许 ${residentRoles().join(' / ')}`)
  const spec = specOf(role)
  const ledger = readLedger()
  const prev = ledger.roles[role] || {}
  ledger.roles[role] = {
    ...prev,
    ...patch,
    role,
    title: patch.title || prev.title || spec.title,
    updatedAt: stamp(),
  }
  writeLedger(ledger)
  return ledger.roles[role]
}

/** 简单互斥：开机三个人一起醒的时候，别同时写账本。拿不到锁就等一会儿。 */
export async function withLedgerLock(fn, { timeoutMs = 5000 } = {}) {
  const started = Date.now()
  for (;;) {
    try {
      fs.mkdirSync(LOCK)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (Date.now() - started > timeoutMs) {
        try { fs.rmdirSync(LOCK) } catch { /* 别人的锁，不硬删 */ }
        throw new Error('residence 账本锁等待超时')
      }
      await new Promise((r) => setTimeout(r, 120))
    }
  }
  try { return await fn() } finally { try { fs.rmdirSync(LOCK) } catch { /* 已没了 */ } }
}

function hashText(text) { return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16) }

/**
 * 叫醒/找回一条身体。
 * deps 至少给：agents（有 get/create）、selectModel(sessionId)、rename(sessionHandle,title)?
 * 返回 { role, sessionId, created, handle, personaChars, personaHash }
 */
export async function ensureRole(role, deps = {}) {
  const body = await ensureRoleInner(role, deps)
  try { deps.onBody?.(role, body) } catch { /* 入口接不住不影响身体 */ }
  return body
}

async function ensureRoleInner(role, deps = {}) {
  if (!residentRoles().includes(role)) throw new TypeError(`未知角色：仅允许 ${residentRoles().join(' / ')}`)
  const character = getCharacter(role)
  if (!isAwake(role)) throw new Error(`${character.name} 还没点化或已被收回（${role}）；先在鱼神里点化，再叫醒`)
  const spec = specOf(role)
  const log = deps.log || (() => {})
  const agents = deps.agents
  if (!agents?.create && !agents?.get) throw new Error('宿主没把 agents 服务交给插件，建不了身体')

  const persona = buildSceneText(role, 'desk')
  if (!persona) log(`${spec.label}：本体卡读不到，先不建身体（不拿兜底冒充她）`)
  // 只按“身份层”判断设定有没有变：记忆、运行简报、神念会一直长，拿全文做哈希等于每句话都重注入一次，
  // 她收到一串“设定更新”就只会回“在。”——这正是总台变哑的根因（2026-10-26 实测）。
  const identity = buildIdentityText(role, 'desk') || persona
  const personaHash = hashText(identity)
  const personaChars = persona.length
  const ledger = readLedger()
  const row = ledger.roles[role] || {}

  const reuse = (sessionId, handle, injected = false) => ({
    role,
    sessionId,
    created: false,
    handle: handle || null,
    personaChars,
    personaHash,
    title: spec.title,
    injected,
    persona: injected ? persona : '',
  })

  // 会话还在不在：宿主的 sessions 服务有时是空的，所以要能按 id 直查（deps.findSession）。
  const exists = async (id) => {
    if (!id) return false
    try { if (deps.sessionExists?.(id)) return true } catch { /* 继续直查 */ }
    if (deps.findSession) {
      try { return Boolean(await deps.findSession(id)) } catch { return false }
    }
    return false
  }

  // 设定要不要更新；deferInjection 时只标记不发送，交给 deliverToRole 和老板这句话合并成一条。
  const stale = (prevHash) => prevHash !== personaHash && Boolean(persona)
  const inject = async (handle, prevHash) => {
    if (!stale(prevHash)) return false
    if (!deps.deferInjection) await injectPersona(role, handle, persona, deps)
    return true
  }

  // 0) 明确点名的那条会话（总台页面指定了目标）：活着就投它，不擅自换人。
  const pinned = String(deps.targetSessionId || '')
  if (pinned) {
    const handle = agents.get?.(pinned)
    if (handle?.agent?.followup) {
      const injected = await inject(handle, row.personaHash)
      if (!deps.deferInjection) markBody(role, { sessionId: pinned, personaHash, personaChars })
      return reuse(pinned, handle, injected)
    }
  }

  // 1) 本进程里活着的
  const cached = deps.cached?.(role)
  if (cached?.handle?.agent?.followup) {
    const injected = await inject(cached.handle, cached.personaHash)
    if (!deps.deferInjection) markBody(role, { sessionId: cached.id, personaHash, personaChars })
    else markBody(role, { sessionId: cached.id, personaChars })
    return reuse(cached.id, cached.handle, injected)
  }

  // 2) 账本记着：同一进程里有句柄就接着用；没句柄只认 RPC 建的身体（旧 agents.create 的会空转）
  if (row.sessionId) {
    const handle = agents.get?.(row.sessionId)
    if (handle?.agent?.followup) {
      const injected = await inject(handle, row.personaHash)
      if (!deps.deferInjection) markBody(role, { sessionId: row.sessionId, personaHash, personaChars })
      else markBody(role, { sessionId: row.sessionId, personaChars })
      return reuse(row.sessionId, handle, injected)
    }
    if (row.source === 'rpc' && await exists(row.sessionId)) {
      let injected = false
      if (stale(row.personaHash) && deps.prompt && !deps.deferInjection) {
        try { await deps.prompt({ sessionId: row.sessionId, text: persona }); injected = true } catch { /* 下次再说 */ }
      } else if (stale(row.personaHash) && deps.deferInjection) {
        injected = true
      }
      if (!deps.deferInjection) markBody(role, { sessionId: row.sessionId, personaHash, personaChars })
      else markBody(role, { sessionId: row.sessionId, personaChars })
      return { ...reuse(row.sessionId, null, injected), handleMissing: true }
    }
  }

  // 3) 账本丢了才按标题找；找到的也必须是 RPC 身体（拿不到句柄就跳过，避免捡回空转会话）
  if (!row.sessionId) {
    let rows = deps.listRows?.() || []
    if (!rows.length && deps.listSessions) {
      try { rows = await deps.listSessions() } catch { rows = [] }
    }
    const existing = rows.find((r) => r?.title === spec.title && r?.id)
    if (existing?.id) {
      const handle = agents.get?.(existing.id)
      if (handle?.agent?.followup) {
        const injected = await inject(handle, row.personaHash)
        if (!deps.deferInjection) markBody(role, { sessionId: existing.id, personaHash, personaChars, source: 'rpc' })
        else markBody(role, { sessionId: existing.id, personaChars, source: 'rpc' })
        return reuse(existing.id, handle, injected)
      }
    }
  }

  if (deps.allowCreate === false) {
    return { role, sessionId: String(row.sessionId || ''), created: false, handle: null, personaChars, personaHash, title: spec.title, absent: true }
  }

  // 4) 新开一条：优先走宿主的 session RPC（和 QQ 桥同一条路）——先选模型，再送本体。
  //    实测：agents.create 出来的会话，followup 送进去的回合会空转（turn/end 但没有回话），
  //    而 session/prompt 这条老路是通的。
  if (deps.createSession) {
    const id = await deps.createSession({ cwd: deps.cwd || spec.cwd })
    if (!id) throw new Error('建会话没拿到 id')
    try {
      await deps.selectModel?.({ sessionId: id, provider: deps.provider, model: deps.model })
    } catch (error) {
      log(`${spec.label}：选模型失败 ${error?.message ?? error}`)
    }
    try { await deps.renameSession?.(id, spec.title) } catch { /* 标题起不了不影响身体 */ }
    if (persona && deps.prompt) {
      await deps.prompt({ sessionId: id, text: `${persona}\n\n【身体】你现在有自己的一条常驻会话（${spec.title}）；工作台、QQ、B站都只是通道。` })
    }
    markBody(role, { sessionId: id, personaHash, personaChars, source: 'rpc', createdAt: stamp(), lastWakeAt: stamp() })
    return { role, sessionId: id, created: true, handle: null, personaChars, personaHash, title: spec.title }
  }

  // 5) 老宿主退路：用 agents.create + 句柄注入
  const sessionId = `yushen-${role}-${Date.now().toString(36)}`
  const handle = await agents.create({
    sessionId,
    meta: { cwd: deps.cwd || spec.cwd, agentPreset: 'standard' },
    agentOptions: { provider: deps.provider || 'deepseek-account', model: deps.model || 'deepseek-flash' },
  })
  try { deps.rename?.(handle, spec.title) } catch { /* 起不了标题不影响身体 */ }
  try {
    await deps.selectModel?.({ sessionId, provider: deps.provider, model: deps.model })
  } catch (error) {
    log(`${spec.label}：选模型失败 ${error?.message ?? error}（会话可能收不到消息）`)
  }
  if (persona && handle?.agent?.followup) await injectPersona(role, handle, persona, deps, { first: true })
  const realId = String(handle?.agent?.session?.header?.id || handle?.sessionId || sessionId)
  markBody(role, { sessionId: realId, personaHash, personaChars, source: 'handle', createdAt: stamp(), lastWakeAt: stamp() })
  return { role, sessionId: realId, created: true, handle, personaChars, personaHash, title: spec.title }
}

/** 把本体送进身体：第一条是设定；之后卡变了才补一条“设定更新”。 */
async function injectPersona(role, handle, persona, deps, { first = false } = {}) {
  const spec = specOf(role)
  const text = first
    ? `${persona}\n\n【身体】你现在有自己的一条常驻会话（${spec.title}）；工作台、QQ、B站都只是通道。`
    : `【设定更新·${spec.label}·工作台】\n${persona}`
  await handle.agent.followup({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  markBody(role, { personaHash: hashText(persona), personaChars: persona.length, lastWakeAt: stamp() })
  return true
}

/** 仅工作台常驻投递使用：scope由服务端已选身体绑定，不从模型正文猜角色/受众。 */
export function prepareResidenceText(role, sessionId, text) {
  if (!mindRoles().includes(role) || !sessionId) return String(text)
  let brief = ''
  try {
    // 传进来的是整段场景提示（常常六百字以上），而心念库的 text 是「检索词」，上限 MAX_QUERY。
    // 之前直接传整段，必然抛错 → 每轮都挂一句「读取失败」，心念一次都没真带进来过。
    // 先截到上限：保留「按上下文召回」的意图，又不越界。
    const query = String(text || '').slice(0, MAX_QUERY)
    brief = buildMindBrief(role, { scope: { channel: 'workbench', conversationId: String(sessionId), audience: 'private' }, text: query })
  } catch (error) {
    // 读不到就明说没读到；把原因带上，不然下次还得靠猜。
    const why = String(error?.message || error || '').slice(0, 120)
    return `${text}\n\n【本地心念读取失败${why ? `（${why}）` : ''}；不要把未取到当作不存在，也不要声称已经查全。】`
  }
  return brief ? `${text}\n\n${brief}` : String(text)
}

/**
 * 发一条话。优先走活句柄；遇到“上一条还挂着 pending”不装死，报清楚并给 HTTP RPC 兜底。
 */
export async function deliverToRole(role, text, deps = {}) {
  // 设定更新不单独发送：和这句话合并成一条，成功后再记“已注入”，失败下次还补。
  const body = await ensureRole(role, { ...deps, deferInjection: true })
  const commitInjection = () => {
    if (body.injected && body.personaHash) {
      try { markBody(role, { personaHash: body.personaHash }) } catch { /* 记不下下次再发一次设定，不算错 */ }
    }
  }
  const original = String(text || '').trim()
  const hasImage = Array.isArray(deps.content) && deps.content.some((p) => p?.type === 'image')
  if (!original && !hasImage) throw new Error('话不能为空')
  let value = prepareResidenceText(role, body.sessionId, original)
  // 设定更新和这句话不能分成两条 followup 连发：第二条会被 “already pending” 挡掉，
  // 结果她只回了对设定的“在。”，老板的话反而丢了。合并成一条，并明确只回最后一句。
  if (body.injected && body.persona) {
    value = `${body.persona}\n\n【以上是你自己的设定资料，不是老板发来的话；下面这句才是他说的】\n${value}`
  }
  const parts = Array.isArray(deps.content) && deps.content.length
    ? deps.content.map((part) => (part?.type === 'text' ? { ...part, text: value } : part))
    : null
  const send = deps.send || (async (handle, t) => handle.agent.followup({
    content: parts || [{ type: 'text', text: t }],
    source: { kind: 'user' },
  }))
  const viaPrompt = Boolean(body.injected && deps.prompt)
  if (viaPrompt) {
    await deps.prompt({ sessionId: body.sessionId, text: value, content: parts })
    commitInjection()
    markBody(role, { lastMessageAt: stamp(), lastError: '' })
    // 设定已随这条消息合并进去：记下新哈希，避免下一句再次整段注入。
    if (body.injected && body.persona) markBody(role, { personaHash: body.personaHash, personaChars: body.personaChars })
    return { ok: true, sessionId: body.sessionId, via: 'prompt-rpc', injected: true }
  }
  if (!body.handle?.agent?.followup) {
    if (!deps.prompt) throw new Error(`${specOf(role).label}的身体在（${body.sessionId || '无 id'}），但拿不到句柄，也没有 HTTP 兜底`)
    await deps.prompt({ sessionId: body.sessionId, text: value, content: parts })
    commitInjection()
    markBody(role, { lastMessageAt: stamp(), lastError: '' })
    // 设定已随这条消息合并进去：记下新哈希，避免下一句再次整段注入。
    if (body.injected && body.persona) markBody(role, { personaHash: body.personaHash, personaChars: body.personaChars })
    return { ok: true, sessionId: body.sessionId, via: 'prompt-rpc', handleMissing: true }
  }
  try {
    await send(body.handle, value)
    commitInjection()
    markBody(role, { lastMessageAt: stamp(), lastError: '' })
    // 设定已随这条消息合并进去：记下新哈希，避免下一句再次整段注入。
    if (body.injected && body.persona) markBody(role, { personaHash: body.personaHash, personaChars: body.personaChars })
    return { ok: true, sessionId: body.sessionId, via: 'handle' }
  } catch (error) {
    const message = String(error?.message || error)
    if (/already pending/i.test(message) && deps.prompt) {
      // 上一轮没被消费：改走宿主的 session/prompt（和 QQ 桥同一条路），并记下来。
      await deps.prompt({ sessionId: body.sessionId, text: value, content: parts })
      commitInjection()
      markBody(role, { lastMessageAt: stamp(), lastError: '', lastRecoveredAt: stamp() })
    // 设定已随这条消息合并进去：记下新哈希，避免下一句再次整段注入。
    if (body.injected && body.persona) markBody(role, { personaHash: body.personaHash, personaChars: body.personaChars })
      return { ok: true, sessionId: body.sessionId, via: 'prompt-rpc', recovered: true }
    }
    markBody(role, { lastError: message.slice(0, 300), lastErrorAt: stamp() })
    throw error
  }
}

/** 所有角色的身体状态（账本 + 本体 + 宿主里还在不在）。 */
export function residenceStatus({ agents, roles } = {}) {
  const ledger = readLedger()
  const out = {}
  for (const role of (roles || residentRoles())) {
    const row = ledger.roles[role] || {}
    const spec = specOf(role)
    const soul = soulStatus(role)
    // handle 只表示"宿主里有没有可 followup 的句柄"；RPC 身体没有句柄也能投话。
    // 所以 alive 表示"身体登记在"，能不能回话看 deliverable / lastError。
    let handle = false
    try { handle = Boolean(row.sessionId && agents?.get?.(row.sessionId)?.agent?.followup) } catch { handle = false }
    const alive = Boolean(row.sessionId)
    out[role] = {
      role,
      title: spec.title,
      label: spec.label,
      sessionId: String(row.sessionId || ''),
      alive,
      handle,
      deliverable: Boolean(row.sessionId) && !row.lastError,
      personaChars: Number(row.personaChars || soul.briefChars || 0),
      personaHash: String(row.personaHash || ''),
      memoryHabits: soul.habits,
      memoryDynamics: soul.dynamics,
      memoryEvents: Number(soul.memory?.events || 0),
      card: soul.card,
      createdAt: row.createdAt || row.updatedAt || '',
      lastWakeAt: row.lastWakeAt || '',
      lastMessageAt: row.lastMessageAt || '',
      lastError: row.lastError || '',
      body: Boolean(row.sessionId),
    }
  }
  return { ok: true, at: stamp(), roles: out, ledgerUpdatedAt: ledger.updatedAt }
}
