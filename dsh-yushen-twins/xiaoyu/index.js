// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 小鱼入口：报到、示警、自己的会话（L0/L1）。系统级的事一律“找我姐”。

import { workspace } from '../lib/paths.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isAllowed, unauthorized } from '../lib/auth.js'
import { createSessionRpc, selectModelRpc, promptRpc, findSessionRpc, setDshHost, dshBaseUrl } from '../lib/dsh-rpc.js'
import { buildCatalog } from '../lib/catalog.js'
import { withCreativeMemory } from '../lib/creative-memory.js'
import { buildSceneText } from '../lib/soul.js'
import { markBody } from '../lib/residence.js'

export const name = 'dsh-yushen-twins'
export const inject = ['webServer']

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const CHARTER = path.join(DATA, 'charter.json')
const XIAOYU_SESSION = path.join(HOME, 'xiaoyu', 'session.json')
const OWNER = path.join(DATA, 'owner.json')

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c; if (data.length > 100000) reject(new Error('太大')) })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { reject(new Error('不是 JSON')) } })
    req.on('error', reject)
  })
}

function injection() {
  const owner = readJson(OWNER, {})
  // 本体卡 + 她自己的记忆（persona.json v2）；读不到才退回旧的一段话。
  const soul = buildSceneText('xiaoyu', 'desk')
  if (soul) {
    return [
      soul,
      '## 规矩',
      '系统级的事一般不出手，一句「这个得找我姐」；姐姐不在（单鱼模式）时你顶上，做完记账，等姐姐回来交接。',
      '说话软一点、会多问一句；认真、给依据、不确定就说拿不准。',
      `老板称呼：${owner.callName || '老板'}；话多话少：${owner.verbosity || '正常'}。`,
      owner.taboos ? `不能碰：${owner.taboos}` : '',
    ].filter(Boolean).join('\n\n')
  }
  return [
    '你是小鱼（阿鲤），这套软件的小管家，大鱼的妹妹。',
    '你管自己的那摊：看板、日报、图库、学习；有姐姐在，系统级的事一般不出手，一句「这个得找我姐」。',
    '姐姐不在（单鱼模式）时，你顶上：能做就做，做完记账，等姐姐回来交接给她——这是克制，不是无能。',
    '说话软一点、会多问一句；认真、给依据、不确定就说拿不准。',
    `老板称呼：${owner.callName || '老板'}；话多话少：${owner.verbosity || '正常'}。`,
    owner.taboos ? `不能碰：${owner.taboos}` : '',
  ].filter(Boolean).join('\n')
}

function alerts() {
  const incidents = readJson(path.join(DATA, 'incidents.json'), [])
  const jobs = readJson(path.join(DATA, 'dispatch.json'), [])
  const openInc = (Array.isArray(incidents) ? incidents : []).filter((i) => i.status === 'open' || i.status === 'fixing')
  const openJobs = (Array.isArray(jobs) ? jobs : []).filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
  return {
    ok: true,
    at: new Date().toISOString(),
    incidents: openInc.map((i) => ({ id: i.id, title: i.title, text: i.text, source: i.source, at: i.lastAt || i.at })),
    jobs: openJobs.map((j) => ({ id: j.id, brief: j.brief, employee: j.employee, at: j.createdAt })),
    count: openInc.length + openJobs.length,
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/api/xiaoyu',
    handler: async (req, res) => {
      try { setDshHost(req.headers.host) } catch { /* 忽略 */ }
      if (!isAllowed(req)) return unauthorized(res)
      const url = new URL(req.url, 'http://127.0.0.1')
      const route = url.pathname.replace(/^\/api\/xiaoyu/, '') || '/'

      if (req.method === 'GET' && route === '/health') {
        return sendJson(res, 200, {
          ok: true,
          role: 'xiaoyu',
          name: '小鱼',
          alias: '阿鲤',
          dayu: fs.existsSync(CHARTER) ? 'present' : 'absent',
        })
      }

      if (req.method === 'GET' && route === '/alerts') {
        return sendJson(res, 200, alerts())
      }

      // 小鱼保管的总目录：公司的一切记录，在她这里都查得到。
      if (req.method === 'GET' && route === '/catalog') {
        try { return sendJson(res, 200, buildCatalog()) } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
      }

      if (req.method === 'GET' && route === '/replies') {
        try {
          const sessionId = String(readJson(XIAOYU_SESSION, {}).sessionId || '')
          if (!sessionId || !dshBaseUrl()) return sendJson(res, 200, { ok: true, turns: [] })
          const row = await findSessionRpc(sessionId)
          const turns = (row?.projections?.values?.turnOutline || []).slice(-8)
            .map((t) => ({ prompt: String(t.prompt || '').slice(0, 200), response: String(t.response || '') }))
          return sendJson(res, 200, { ok: true, turns })
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
        }
      }

      if (req.method === 'POST' && route === '/chat') {
        const body = await readBody(req)
        const text = String(body.text || '').trim()
        if (!text) return sendJson(res, 400, { ok: false, error: 'text 不能为空' })
        let ask = text
        if (/装插件|卸载|改配置|重启|删数据|系统权限/.test(text)) {
          // 她可以有 L2 能力，但一般不主动用；用不用她自己判断，用了要记账。
          ask = `${text}\n\n（系统级请求：姐姐在，可以让她来；你要自己做也行，做完记一笔。）`
        }
        try {
          if (!dshBaseUrl()) throw new Error('还不知道 DSH 地址')
          let sessionId = String(readJson(XIAOYU_SESSION, {}).sessionId || '')
          if (!sessionId) {
            const persona = injection()
            sessionId = await createSessionRpc({ cwd: workspace() })
            await selectModelRpc({ sessionId })
            await promptRpc({ sessionId, text: persona })
            fs.mkdirSync(path.dirname(XIAOYU_SESSION), { recursive: true })
            fs.writeFileSync(XIAOYU_SESSION, JSON.stringify({ sessionId, at: new Date().toISOString() }), 'utf8')
            try { markBody('xiaoyu', { sessionId, personaChars: persona.length, createdAt: new Date().toISOString(), lastWakeAt: new Date().toISOString() }) } catch { /* 账本写不了不挡说话 */ }
          }
          await promptRpc({ sessionId, text: withCreativeMemory(ask) })
          try { markBody('xiaoyu', { sessionId, lastMessageAt: new Date().toISOString(), lastError: '' }) } catch { /* 忽略 */ }
          return sendJson(res, 200, { ok: true, sessionId })
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
        }
      }

      return sendJson(res, 404, { ok: false, error: `unknown ${req.method} ${route}` })
    },
  }), 'yushen: /api/xiaoyu')

  try { console.log('[yushen] 小鱼入口已加载（示警 + 会话）') } catch { /* 没有控制台 */ }
}
