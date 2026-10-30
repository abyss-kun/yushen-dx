// 鱼神双子星 · 移动端接口（/api/yushen/mobile/*）
//
// 设计边界（见 手机端-设计.md）：
//   · 手机是"另一个入口"，不是第二个本体；消息投进她自己的会话，回复从会话正文读。
//   · 设备令牌只存哈希（lib/mobile-gateway.js），App 拿明文 token 走 X-Mobile-Token。
//   · 配对码只在电脑端工作台生成（需回环或 DSH 登录态），手机用码换令牌。
//   · 每台设备一条会话，标题「手机 · <设备名>」，回复按时间游标增量拉取。
//
// 失败一律 fail-closed：没令牌 401、码不对 400、找不到会话 404。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const SESSIONS = path.join(DATA, 'mobile-sessions.json')
const SEEN = path.join(DATA, 'mobile-seen.json')

function readJson(file, fallback) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    return value && typeof value === 'object' ? value : fallback
  } catch { return fallback }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp-${process.pid}`
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  } catch { /* 记不下不挡业务 */ }
}

function text(value, max = 4000) { return String(value ?? '').trim().slice(0, max) }
function loopback(req) {
  const a = String(req.socket?.remoteAddress || '')
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
}
function tokenOf(req) { return text(req.headers?.['x-mobile-token'], 300) }

/**
 * @param {object} deps
 * @param {object} deps.gateway    lib/mobile-gateway.js 的实例
 * @param {fn}     deps.isAllowed  电脑端工作台鉴权（lib/auth.js）
 * @param {fn}     deps.readBody   读 JSON 体的函数
 * @param {fn}     deps.prompt     投递一条消息（{ sessionId, device, role, text }）
 * @param {fn}     deps.digest     读会话最近若干条（sessionId, { turns }）
 * @param {fn}     deps.ensure     确保会话存在（{ device } → sessionId）
 * @param {string} deps.version    插件版本
 */
export function createMobileRoutes(deps) {
  const {
    gateway,
    isAllowed = () => false,
    readBody = async () => ({}),
    prompt,
    digest,
    ensure,
    version = '0.0.0',
  } = deps

  const send = (res, status, value) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(value))
  }
  const unauthorized = (res) => send(res, 401, { ok: false, error: '设备令牌无效' })

  function deviceOf(req) {
    const token = tokenOf(req)
    if (!token) return null
    try { return gateway.authenticate(token) } catch { return null }
  }

  function sessionFor(device) {
    const state = readJson(SESSIONS, { devices: {} })
    const row = state.devices?.[device.id]
    return row && row.sessionId ? row : null
  }

  function remember(device, sessionId) {
    const state = readJson(SESSIONS, { devices: {} })
    state.devices = state.devices || {}
    state.devices[device.id] = { sessionId, name: device.name, at: new Date().toISOString() }
    writeJson(SESSIONS, state)
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1')
    const p = url.pathname.replace(/^\/api\/yushen\/mobile/, '') || '/'

    // ── 只有电脑端工作台能做的事 ──────────────────────────────
    if (p === '/pair-code' && req.method === 'GET') {
      if (!(loopback(req) || isAllowed(req))) return send(res, 401, { ok: false, error: '要在电脑端工作台生成配对码' })
      try {
        const out = gateway.issuePairing()
        return send(res, 200, { ok: true, ...out })
      } catch (error) {
        return send(res, 500, { ok: false, error: String(error?.message || error) })
      }
    }
    if (p === '/devices' && req.method === 'GET') {
      if (!(loopback(req) || isAllowed(req))) return send(res, 401, { ok: false, error: '仅限电脑端' })
      return send(res, 200, { ok: true, devices: gateway.listDevices() })
    }
    if (p === '/devices/revoke' && req.method === 'POST') {
      if (!(loopback(req) || isAllowed(req))) return send(res, 401, { ok: false, error: '仅限电脑端' })
      const body = await readBody(req).catch(() => ({}))
      return send(res, 200, { ok: true, ...gateway.revoke(text(body.deviceId, 80)) })
    }

    // ── 手机端（设备令牌）────────────────────────────────────
    if (p === '/pair' && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}))
      try {
        const out = gateway.pair({ code: text(body.code, 6), name: text(body.name, 80) })
        return send(res, 200, { ok: true, ...out })
      } catch (error) {
        return send(res, 400, { ok: false, error: String(error?.message || error) })
      }
    }

    const device = deviceOf(req)
    if (p === '/status') {
      // 探测端点：不带令牌也回 200，手机据此判断"端口通、插件在"；带令牌才回设备信息。
      return send(res, 200, {
        ok: true,
        version,
        paired: Boolean(device),
        device: device ? { name: device.name } : null,
        roles: gateway.roles,
      })
    }
    if (!device) return unauthorized(res)

    if (p === '/messages' && req.method === 'POST') {
      const body = await readBody(req).catch(() => ({}))
      const messageId = text(body.messageId, 80) || `m-${Date.now()}`
      const seen = readJson(SEEN, { ids: [] })
      if ((seen.ids || []).includes(messageId)) return send(res, 200, { ok: true, duplicate: true })
      let role = 'dayu'
      try { role = gateway.validateRole(text(body.role, 20)) } catch { /* 保持默认 */ }
      const message = text(body.text)
      if (!message) return send(res, 400, { ok: false, error: '消息为空' })

      let row = sessionFor(device)
      try {
        if (!row) {
          const sessionId = await ensure({ device })
          if (!sessionId) throw new Error('建会话失败')
          remember(device, sessionId)
          row = { sessionId }
        }
        await prompt({ sessionId: row.sessionId, device, role, text: message })
      } catch (error) {
        return send(res, 503, { ok: false, error: String(error?.message || error) })
      }
      seen.ids = [...(seen.ids || []), messageId].slice(-500)
      writeJson(SEEN, seen)
      return send(res, 200, { ok: true, sessionId: row.sessionId })
    }

    if (p === '/messages' && req.method === 'GET') {
      const row = sessionFor(device)
      if (!row) return send(res, 200, { ok: true, messages: [], next: '' })
      const after = text(url.searchParams.get('after'), 40)
      let data = null
      try { data = digest(row.sessionId, { turns: 40 }) } catch { data = null }
      if (!data || !data.ok) return send(res, 200, { ok: true, messages: [], next: after, note: '会话还没落盘' })
      const turns = Array.isArray(data.turns) ? data.turns : []
      const rows = turns
        .filter((t) => String(t.role || t.kind || '') === 'assistant')
        .filter((t) => {
          const at = String(t.at || '')
          return !after || (at && at > after)
        })
        .map((t) => ({ text: text(t.text || t.content || ''), at: String(t.at || '') }))
      const next = rows.length ? rows[rows.length - 1].at : after
      return send(res, 200, { ok: true, messages: rows, next })
    }

    if (p === '/history' && req.method === 'GET') {
      const row = sessionFor(device)
      if (!row) return send(res, 200, { ok: true, messages: [] })
      const limit = Math.max(1, Math.min(60, Number(url.searchParams.get('limit')) || 30))
      let data = null
      try { data = digest(row.sessionId, { turns: limit }) } catch { data = null }
      const turns = data?.ok ? data.turns || [] : []
      return send(res, 200, {
        ok: true,
        messages: turns.map((t) => ({
          role: String(t.role || t.kind || ''),
          text: text(t.text || t.content || ''),
          at: String(t.at || ''),
        })),
      })
    }

    return send(res, 404, { ok: false, error: '未知的移动端接口' })
  }

  return { handler, SESSIONS, DATA }
}
