// 鱼神弹窗 · host 半：配置 + 预览队列 + 素材路由。独立插件，不依赖鱼神双子星。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { busySnapshot, busyText } from './lib/busy.js'

export const name = 'dsh-yushen-popup'
export const inject = ['webServer']

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DIR = path.join(HOME, 'dsh-yushen-popup')
const CONF = path.join(DIR, 'config.json')
// 账本（只读）：从 dsh-token-budget 提取的同一份数据源
const QQ_BRIDGE_ROOT = process.env.QQ_BRIDGE_ROOT || 'D:\\deepseekTools\\qq-bridge'
const TOKEN_FILE = path.join(QQ_BRIDGE_ROOT, 'state', 'token-usage.jsonl')
const USAGE_FILE = path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh', '.dshw-usage.json')

function readJsonSafe(file, fallback) {
  try {
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    return JSON.parse(text)
  } catch { return fallback }
}
function readJsonlSafe(file) {
  const out = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try { out.push(JSON.parse(line)) } catch { /* 坏行跳过 */ }
    }
  } catch { /* 文件不存在 */ }
  return out
}
function usageDayKey(ms) {
  const d = new Date(ms)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function usageSourceName(key) {
  const k = String(key || '')
  if (k.includes('黑话')) return '黑话学习'
  if (k.startsWith('private:')) return '私聊'
  if (k.startsWith('group:')) return '群聊'
  return k || '其他'
}
function usageTokens(b) {
  const x = b || {}
  return (Number(x.cacheHit) || 0) + (Number(x.cacheMiss) || 0) + (Number(x.output) || 0)
}

// 聚合：今日 / 本周 / 本月 / 按来源 / 按会话
function buildUsage() {
  const usage = readJsonSafe(USAGE_FILE, {})
  const all = readJsonlSafe(TOKEN_FILE).filter((r) => String(r.k || '') !== 'base')
  const now = Date.now()
  const today = usageDayKey(now)
  const weekStart = new Date(now - ((new Date(now).getDay() + 6) % 7) * 86400000)
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime()

  const day = new Map()   // 天 -> tokens
  const sources = new Map()
  const sessions = new Map()
  let weekTok = 0
  let monthTok = 0
  let todayTok = 0
  for (const r of all) {
    const t = Number(r.t) || 0
    const tok = usageTokens(r.b)
    if (!t || !tok) continue
    const dk = usageDayKey(t)
    day.set(dk, (day.get(dk) || 0) + tok)
    if (dk === today) todayTok += tok
    if (t >= weekStart.getTime()) weekTok += tok
    if (t >= monthStart) monthTok += tok
    // 来源
    const src = usageSourceName(r.key)
    const so = sources.get(src) || { name: src, tokens: 0, calls: 0 }
    so.tokens += tok
    so.calls += 1
    sources.set(src, so)
    // 会话
    if (r.sid) {
      const sn = sessions.get(r.sid) || { sid: String(r.sid), tokens: 0, calls: 0, source: src, last: 0 }
      sn.tokens += tok
      sn.calls += 1
      sn.last = Math.max(sn.last, t)
      sessions.set(r.sid, sn)
    }
  }
  const pricePerM = 0.04
  const cost = (tok) => (tok * pricePerM) / 1e6
  const srcList = [...sources.values()].map((x) => ({ ...x, cost: cost(x.tokens) })).sort((a, b) => b.tokens - a.tokens)
  const sessList = [...sessions.values()].map((x) => ({ ...x, cost: cost(x.tokens) })).sort((a, b) => b.tokens - a.tokens).slice(0, 12)
  const daily = [...day.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 31).map(([d, tok]) => ({ day: d, tokens: tok, cost: cost(tok) }))
  return {
    today: { tokens: todayTok, cost: Number(usage.todayUsage) || cost(todayTok) },
    week: { tokens: weekTok, cost: cost(weekTok) },
    month: { tokens: monthTok, cost: cost(monthTok) },
    balance: Number(usage.lastBalance) || 0,
    sources: srcList,
    sessions: sessList,
    daily,
    history: usage.history || {},
    updatedAt: new Date().toISOString(),
  }
}

const DEFAULTS = {
  enabled: true,
  // 展示方式
  mode: 'ritual',            // ritual = 卷轴仪式（点开才展开）| auto = 直接通知
  urgentDirect: true,        // 紧急事件跳过仪式直接弹
  blankAction: 'fold',       // 点空白：fold 收成画卷 | close 关闭 | none 无效
  zoomView: 'expanded',      // 缩放时：expanded 展开的样子 | rolled 收拢的画卷
  reopenView: 'expanded',    // 缩放后再打开：expanded 直接展开 | rolled 还是收拢画卷
  // 手感
  sound: true,
  draggable: true,           // 缩小画卷可拖动
  rememberPos: true,         // 记住拖动后的位置
  hoverFx: true,             // 悬停反馈
  // 主题与事件
  themeMode: 'auto',         // blue | red | auto（蓝平常 + 红警醒）
  themeScope: 'all',         // all 全弹 | blue 只蓝 | red 只红
  eventColors: { incident: 'red', ask: 'blue', restart: 'red', notice: 'blue' },
  events: { incident: true, ask: true, restart: true },
  // 字体美化
  fontFamily: '', fontSize: '', textColor: '', accentColor: '', scheme: 'dark',
  buttonStyle: 'crystal',   // crystal 水晶 | glass 玻璃 | gold 金边
  // 会话 token 提醒
  tokenAlert: { enabled: true, warnAt: 80000, dangerAt: 150000, actions: { summarize: false, newSession: false } },
  sources: { qq: true, bili: true, local: true },
}

function readConf() {
  try {
    if (fs.existsSync(CONF)) {
      const raw = JSON.parse(fs.readFileSync(CONF, 'utf8'))
      return { ...DEFAULTS, ...raw, events: { ...DEFAULTS.events, ...(raw.events || {}) }, eventColors: { ...DEFAULTS.eventColors, ...(raw.eventColors || {}) }, tokenAlert: { ...DEFAULTS.tokenAlert, ...(raw.tokenAlert || {}), actions: { ...DEFAULTS.tokenAlert.actions, ...((raw.tokenAlert && raw.tokenAlert.actions) || {}) } }, sources: { ...DEFAULTS.sources, ...(raw.sources || {}) } }
    }
  } catch { /* 配置坏了用默认 */ }
  return { ...DEFAULTS, events: { ...DEFAULTS.events }, eventColors: { ...DEFAULTS.eventColors }, tokenAlert: { ...DEFAULTS.tokenAlert, actions: { ...DEFAULTS.tokenAlert.actions } }, sources: { ...DEFAULTS.sources } }
}
function writeConf(next) {
  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(CONF, JSON.stringify(next, null, 2))
  return next
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}
async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  return JSON.parse(raw)
}

export function apply(ctx) {
  const queue = []

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/yushen-popup',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      try {
        // 配置
        if (url.pathname === '/yushen-popup/config') {
          if (req.method === 'GET') return sendJson(res, 200, { ok: true, config: readConf() })
          if (req.method === 'POST') {
            let body = {}
            try { body = await readJsonBody(req) } catch { body = {} }
            const cur = readConf()
            const next = writeConf({ ...cur, ...body, events: { ...cur.events, ...(body.events || {}) }, eventColors: { ...cur.eventColors, ...(body.eventColors || {}) }, tokenAlert: { ...cur.tokenAlert, ...(body.tokenAlert || {}), actions: { ...cur.tokenAlert.actions, ...((body.tokenAlert && body.tokenAlert.actions) || {}) } }, sources: { ...cur.sources, ...(body.sources || {}) } })
            return sendJson(res, 200, { ok: true, config: next })
          }
          return sendJson(res, 405, { ok: false, error: '只支持 GET / POST' })
        }
        // 预览：host 下发，页面轮询弹出（不用刷新）
        if (url.pathname === '/yushen-popup/preview') {
          if (req.method === 'POST') {
            let body = {}
            try { body = await readJsonBody(req) } catch { body = {} }
            queue.push({ ...body, at: Date.now() })
            if (queue.length > 5) queue.shift()
            return sendJson(res, 200, { ok: true, queued: queue.length })
          }
          if (req.method === 'GET') {
            const items = queue.splice(0, queue.length)
            return sendJson(res, 200, { ok: true, items })
          }
          return sendJson(res, 405, { ok: false, error: '只支持 GET / POST' })
        }
        // 后台在忙什么（白话）：扒自鱼神 lib/busy.js，独立可用
        if (req.method === 'GET' && url.pathname === '/yushen-popup/busy') {
          try {
            const snap = busySnapshot()
            return sendJson(res, 200, { ok: true, ...snap, text: busyText(snap) })
          } catch (error) {
            return sendJson(res, 500, { ok: false, error: String(error?.message || error) })
          }
        }
        // 用量明细：读账本聚合（今日/本周/本月/来源/会话/每日）
        if (req.method === 'GET' && url.pathname === '/yushen-popup/usage') {
          try { return sendJson(res, 200, { ok: true, ...buildUsage() }) } catch (error) { return sendJson(res, 500, { ok: false, error: String(error?.message || error) }) }
        }
        // 统一事件入口：外部（QQ/B站/本机/新机器）都往这里推
        if (url.pathname === '/yushen-popup/event') {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
          let body = {}
          try { body = await readJsonBody(req) } catch { body = {} }
          const conf = readConf()
          if (!conf.enabled) return sendJson(res, 200, { ok: true, skipped: 'popup-disabled' })
          const src = String(body.source || 'local')
          if (conf.sources && conf.sources[src] === false) return sendJson(res, 200, { ok: true, skipped: 'source-off' })
          const item = {
            theme: body.theme || (conf.themeMode === 'red' ? 'red' : 'blue'),
            badge: body.badge || src,
            title: body.title || '提醒',
            body: body.body || '',
            confirmText: body.confirmText || '知道了',
            cancelText: body.cancelText || '好',
          }
          queue.push({ ...item, at: Date.now() })
          if (queue.length > 10) queue.shift()
          return sendJson(res, 200, { ok: true, queued: queue.length })
        }
        // 素材：只允许 blue/red 下固定文件名
        if (req.method === 'GET' && url.pathname.startsWith('/yushen-popup/assets/')) {
          const name = url.pathname.slice('/yushen-popup/assets/'.length)
          const isImg = /^(?:blue|red)\/[a-z0-9_-]+\.png$/i.test(name)
          const isSnd = /^sounds\/[a-z0-9_-]+\.(?:wav|mp3)$/i.test(name)
          if (!isImg && !isSnd) return sendJson(res, 400, { ok: false, error: '文件名不合法' })
          const base = path.join(HERE, 'assets', 'popup')
          const file = path.join(base, name)
          if (!file.startsWith(base + path.sep)) return sendJson(res, 400, { ok: false, error: '路径不合法' })
          if (!fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: '没有这张素材' })
          res.writeHead(200, { 'content-type': isSnd ? (name.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav') : 'image/png', 'cache-control': 'no-cache' })
          res.end(fs.readFileSync(file))
          return
        }
        return sendJson(res, 404, { ok: false, error: 'unknown' })
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: String(error?.message || error) })
      }
    },
  }), 'dsh-yushen-popup: web routes')

  ctx.provide?.('yushenPopup', {
    config: readConf,
    save: writeConf,
    push: (item) => { queue.push({ ...item, at: Date.now() }); return queue.length },
  })
}
