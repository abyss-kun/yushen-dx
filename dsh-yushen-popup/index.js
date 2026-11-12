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
const QQ_BRIDGE_ROOT = process.env.QQ_BRIDGE_ROOT || path.join(HOME, 'qq-bridge')
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

// 真实账本：DSH 自己的 .dshw-usage.json（events 里每轮有真实 cost），不是估算
function readRealUsage() {
  const usage = readJsonSafe(USAGE_FILE, {})
  const events = Array.isArray(usage.events) ? usage.events : []
  const todayKey = usageDayKey(Date.now())
  const todayEvents = events.filter((e) => e && e.day === todayKey)
  const todayCost = todayEvents.reduce((a, e) => a + (Number(e.cost) || 0), 0)
  const recent = events.slice(-20).map((e) => ({
    at: e.ts ? new Date(e.ts).toISOString() : '',
    day: e.day || '',
    tokens: Number(e.tokens) || 0,
    cost: Number(e.cost) || 0,
  }))
  return {
    todayUsage: Number(usage.todayUsage) || todayCost,
    todayEventsCost: todayCost,
    todayEventsCount: todayEvents.length,
    lastBalance: Number(usage.lastBalance) || 0,
    history: usage.history || {},
    recent,
  }
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
  // 2026-11-11 自查发现：today 用真实账本，week/month 却拿 0.04 元/M 拍脑袋，结果 week ¥1.93 < today ¥19.9。
  // 现在优先用账本里的每日真实花费（usage.history）求和；没有历史时才退回估算。
  const PPM_FALLBACK = 0.04
  const hist = (usage && typeof usage.history === 'object' && usage.history) ? usage.history : {}
  const dayStartMs = (d) => {
    const t = Date.parse(String(d) + 'T00:00:00')
    return isFinite(t) ? t : 0
  }
  const sumHist = (fromMs) => {
    let s = 0
    for (const d of Object.keys(hist)) {
      const at = dayStartMs(d)
      if (at && at >= fromMs) s += Number(hist[d]) || 0
    }
    return s
  }
  let realToday = Number(usage.todayUsage) || 0
  if (!realToday) realToday = Number(hist[today]) || 0
  const realWeek = sumHist(weekStart.getTime())
  const realMonth = sumHist(monthStart)
  // 估算单价：用今天的真实花费/真实 token 推，推不出来才退回 0.04
  const ppm = (realToday > 0 && todayTok > 0) ? (realToday / todayTok) * 1e6 : PPM_FALLBACK
  const cost = (tok) => (tok * ppm) / 1e6
  const srcList = [...sources.values()].map((x) => ({ ...x, cost: cost(x.tokens) })).sort((a, b) => b.tokens - a.tokens)
  const sessList = [...sessions.values()].map((x) => ({ ...x, cost: cost(x.tokens) })).sort((a, b) => b.tokens - a.tokens).slice(0, 12)
  const daily = [...day.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 31).map(([d, tok]) => ({ day: d, tokens: tok, cost: cost(tok) }))
  return {
    today: { tokens: todayTok, cost: realToday || cost(todayTok) },
    week: { tokens: weekTok, cost: realWeek || cost(weekTok) },
    month: { tokens: monthTok, cost: realMonth || cost(monthTok) },
    balance: Number(usage.lastBalance) || 0,
    pricePerM: Math.round(ppm * 100) / 100,
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
  // 会话 token 提醒（2026-11-10 新结构：峰谷 + 每轮成本 + 累计 + 容量 + CD）
  tokenAlert: {
    enabled: true,
    checkOnOpen: true,        // 每次打开页面检查一次
    repeatOnOpen: false,      // 重启后同一会话是否再弹（默认关：每会话每级只提醒一次）
    otherSessionAlert: true,  // 其他会话完成一轮时也提醒（不切过去也能看到）
    otherIntervalSec: 300,    // 其他会话提醒的检查间隔（秒，默认 5 分钟）
    roundLine: 0.1,           // 每轮成本线（¥/轮）
    roundEnabled: false,      // 每轮线开关（默认关：气泡已经显示花费，不再每轮弹）
    totalLine: 10,            // 累计成本线（¥），之后每 +totalStep 再提醒
    totalStep: 10,
    totalEnabled: true,       // 累计线开关
    contextLimit: 500000,     // 容量线（token，上限 100 万）
    contextEnabled: true,     // 容量线开关
    intervalSec: 300,         // 检查间隔（秒，默认 5 分钟）
    quietStart: 0,            // 静默时段开始（小时）
    quietEnd: 8,              // 静默时段结束（小时）
    quietEnabled: true,       // 静默时段开关
    maxPerHour: 3,            // 每小时最多弹几次
    limitEnabled: true,       // 限弹开关
    silentMode: false,        // 只记录不弹
    cacheAssumption: 0.8,     // 缓存命中率假设（估算用）
    cacheManual: false,       // true = 手动填缓存命中率
    cdMinutes: 10,            // 「稍后」默认时长（分钟）
    cdEnabled: true,          // 稍后 CD 开关
    forceRoundLine: 0.5,      // 强制提醒：每轮成本 ≥ 此值（无视 CD）
    forceContextPct: 0.8,     // 强制提醒：上下文 ≥ 上限的此比例
    forceEnabled: true,       // 强制提醒开关
    crossSessionAlert: true,  // 切回会话时提醒（其他会话期间涨了也提醒）
    recentWindowMin: 60,      // 「最近会话」统计窗口（分钟）
    coldDays: 3,              // 冷档：几天没读的会话清掉提醒状态
    actions: { summarize: false, newSession: false },
  },
  // 2026-11-12 修：这三个是**界面开关**，以前误放在 tokenAlert 里，而前端按顶层读 → 面板勾选和实际行为对不上
  // （勾着也关不掉小黑板、气泡花费点了没反应）。现在挪到顶层，并在 readConf 里兼容旧配置。
  memoEnabled: true,        // 显示小黑板（常驻备忘）
  memoAutoSessions: false,  // 小黑板里自动显示最近会话（默认关：黑板默认空白）
  inlineCost: true,         // 在消息下面的「用量 X tok」旁直接显示本轮花费
  sources: { qq: false, bili: false, local: true, backup: false },  // QQ/B站事件默认不弹；备份提醒也默认关（2026-11-11 老板：备份是我们自己的机制，别人不一定有）
}

// 老配置里这三个键藏在 tokenAlert 下面；读的时候抬到顶层，免得"面板显示了、实际没生效"。
const LIFT_KEYS = ['memoEnabled', 'memoAutoSessions', 'inlineCost']
function liftLegacy(conf) {
  try {
    const ta = conf && conf.tokenAlert
    if (!ta) return conf
    for (const k of LIFT_KEYS) {
      if (conf[k] === undefined && ta[k] !== undefined) conf[k] = ta[k]
    }
  } catch { /* 配置坏了就原样返回 */ }
  return conf
}

function readConf() {
  try {
    if (fs.existsSync(CONF)) {
      const raw = JSON.parse(fs.readFileSync(CONF, 'utf8'))
      return liftLegacy({ ...DEFAULTS, ...raw, events: { ...DEFAULTS.events, ...(raw.events || {}) }, eventColors: { ...DEFAULTS.eventColors, ...(raw.eventColors || {}) }, tokenAlert: { ...DEFAULTS.tokenAlert, ...(raw.tokenAlert || {}), actions: { ...DEFAULTS.tokenAlert.actions, ...((raw.tokenAlert && raw.tokenAlert.actions) || {}) } }, sources: { ...DEFAULTS.sources, ...(raw.sources || {}) } })
    }
  } catch { /* 配置坏了用默认 */ }
  return liftLegacy({ ...DEFAULTS, events: { ...DEFAULTS.events }, eventColors: { ...DEFAULTS.eventColors }, tokenAlert: { ...DEFAULTS.tokenAlert, actions: { ...DEFAULTS.tokenAlert.actions } }, sources: { ...DEFAULTS.sources } })
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

  // 2026-11-11 老板：「别的会话在跑的时候也被动拉起，根本不需要主动去轮询」
  // 检测这一段确实已经不轮询了（宿主在 session/event 上，所有会话的动静都从这里过）。
  // 慢的只剩"送货"：HTTP 只能浏览器来问。所以给一个**挂住**的问法——
  // /yushen-popup/wait：队列里有东西立刻回，没有就把请求挂着（最多 20 秒），一有东西马上唤醒。
  // 这样前端在空闲时不再"每 15 秒问一遍"，而是一个请求安静地挂着；有事是毫秒级送达。
  const waiters = new Set()
  const wakeWaiters = () => {
    for (const fn of [...waiters]) {
      try { fn() } catch { /* 单个坏了不影响别的 */ }
    }
  }
  const enqueue = (item) => {
    try {
      queue.push(item)
      wakeWaiters()
    } catch { /* 忽略 */ }
    return queue.length
  }

  // 2026-11-11 老板：「为什么要主动轮询检测，不能是每一轮动的时候机制就动吗，每次会话在运行的时候被动启动」
  // 对。宿主本来就在所有会话的事件流上（twins 也是这么接的），这里只做一件事：
  // 有动静就推一个「该算了」的信号，前端收到才去算成本和判断该不该提醒，不用每 5 分钟自己去读整页 DOM。
  // 一轮里事件很多，合并 1.2 秒推一次；前端关着时队列最多留 30 条，不会堆爆。
  let nudgeTimer = null
  let lastNudgeAt = 0
  let activeNudgeSid = ''
  const nudge = () => {
    try {
      if (nudgeTimer) return
      const wait = Math.max(0, 1200 - (Date.now() - lastNudgeAt))
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null
        lastNudgeAt = Date.now()
        try {
          const sid = String(activeNudgeSid || '')
          enqueue({ __nudge: 1, sid, at: Date.now() })
          if (queue.length > 30) queue.shift()
        } catch { /* 忽略 */ }
      }, wait)
      if (nudgeTimer && typeof nudgeTimer.unref === 'function') nudgeTimer.unref()
    } catch { /* 忽略 */ }
  }
  try {
    if (typeof ctx.on === 'function') {
      ctx.effect(() => ctx.on('session/event', (session) => {
        try {
          activeNudgeSid = String(session?.header?.id ?? session?.meta?.id ?? session?.id ?? '')
          nudge()
        } catch { /* 事件坏了不影响弹窗 */ }
      }))
    }
  } catch { /* 没有事件流就退回前端定时器（前端还留着 15 分钟兜底） */ }

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
            enqueue({ ...body, at: Date.now() })
            if (queue.length > 5) queue.shift()
            return sendJson(res, 200, { ok: true, queued: queue.length })
          }
          if (req.method === 'GET') {
            const items = queue.splice(0, queue.length)
            return sendJson(res, 200, { ok: true, items })
          }
          return sendJson(res, 405, { ok: false, error: '只支持 GET / POST' })
        }
        // 长轮询：有东西立刻回；没有就把请求挂着（最多 20 秒），一有东西立刻唤醒。
        // 前端空闲时就不用再"每 15 秒问一遍"了——一个请求安静挂着，有事毫秒级送到。
        if (url.pathname === '/yushen-popup/wait') {
          const take = () => queue.splice(0, queue.length)
          if (queue.length) return sendJson(res, 200, { ok: true, items: take(), long: true })
          let done = false
          const finish = () => {
            if (done) return
            done = true
            waiters.delete(finish)
            try { clearTimeout(timer) } catch { /* 忽略 */ }
            try { sendJson(res, 200, { ok: true, items: take(), long: true }) } catch { /* 连接已断 */ }
          }
          const timer = setTimeout(() => {
            if (done) return
            done = true
            waiters.delete(finish)
            try { sendJson(res, 200, { ok: true, items: [], long: true }) } catch { /* 忽略 */ }
          }, 20000)
          waiters.add(finish)
          try { req.on('close', () => { if (done) return; done = true; waiters.delete(finish); try { clearTimeout(timer) } catch { /* 忽略 */ } }) } catch { /* 忽略 */ }
          return
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
        // 真实账本：DSH 的 .dshw-usage.json（每轮真实 cost），用来和弹窗估算对账
        if (req.method === 'GET' && url.pathname === '/yushen-popup/real') {
          try { return sendJson(res, 200, { ok: true, ...readRealUsage() }) } catch (error) { return sendJson(res, 500, { ok: false, error: String(error?.message || error) }) }
        }
        // 诊断：client 把"点了按钮/按了 Esc/没读到用量"记一行到本地，下次出问题不用靠猜
        // （2026-11-11 老板截图：弹窗按键无效且关不掉；先留证据，再改）
        if (url.pathname === '/yushen-popup/diag') {
          if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: '只支持 POST' })
          let body = {}
          try { body = await readJsonBody(req) } catch { body = {} }
          try {
            const dir = path.join(DIR)
            fs.mkdirSync(dir, { recursive: true })
            const file = path.join(dir, 'popup-diag.jsonl')
            try {
              const st = fs.statSync(file)
              if (st.size > 2 * 1024 * 1024) fs.renameSync(file, file + '.1')
            } catch { /* 还没有这个文件 */ }
            fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...body }) + '\n', 'utf8')
          } catch { /* 诊断写不下不影响弹窗 */ }
          return sendJson(res, 200, { ok: true })
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
          enqueue({ ...item, at: Date.now() })
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
    push: (item) => { return enqueue({ ...item, at: Date.now() }) },
  })

  // 备份完成监听：备份状态文件的 lastAt 变了就推一条弹窗（页面开着才收得到）
  const backupTargets = [
    { kind: '全量', file: path.join(HOME, 'dayu', 'full-backup.json') },
    { kind: '小时', file: path.join(HOME, 'dayu', 'offsite.json') },
    { kind: '离线二', file: path.join(HOME, 'dayu', 'offsite-second.json') },
  ]
  const backupLast = new Map()
  const backupTick = () => {
    try {
      // 2026-11-11 老板：备份提醒要能开关，出厂默认关——「我们有备份机制，别人不一定有」。
      // 关着的时候连看都不看（也不记 prev，开起来的第一轮不会误报一次"刚完成"）。
      const cf = readConf()
      if (!cf.sources || cf.sources.backup !== true) return
      for (const t of backupTargets) {
        const j = readJsonSafe(t.file, null)
        if (!j || !j.lastAt) continue
        const prev = backupLast.get(t.file)
        backupLast.set(t.file, j.lastAt)
        if (!prev || prev === j.lastAt) continue
        enqueue({
          theme: 'blue',
          badge: '备份',
          title: t.kind + '备份完成',
          body: [j.files ? `${j.files} 个文件` : '', j.dir ? String(j.dir) : ''].filter(Boolean).join('\n'),
          at: Date.now(),
        })
        if (queue.length > 10) queue.shift()
      }
    } catch { /* 忽略 */ }
  }
  setInterval(backupTick, 60000)
  setTimeout(backupTick, 15000)
}
