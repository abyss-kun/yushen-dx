// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// Runtime asset refresh marker: three-role nest assets remain sourced from the linked package.
// 单入口挂两个子入口：框架 §2.4 的退路。
// 子路径名 dsh-yushen-twins/dayu 在 DSH 0.1.x 装载器里不认，
// 改用包根入口，内部按开关依次挂大鱼、小鱼。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setDshHost, createSessionRpc, selectModelRpc, promptRpc, renameSessionRpc } from './lib/dsh-rpc.js'
import { createMobileGateway } from './lib/mobile-gateway.js'
import { createMobileRoutes } from './lib/mobile-routes.js'
import { transcriptDigest } from './lib/transcript.js'
import { isAllowed, unauthorized } from './lib/auth.js'
import { roleList, snapshot, adopt, adoptFile, adoptUrl, adoptGuest, guestFile, removeGuest, rename, restore, move, resolveAvatar, mimeOf } from './lib/nest.js'
import { characterCandidates, scanPlugins } from './lib/intake.js'
import { detectRoles } from './lib/detect-roles.js'
import { exportBundle, importBundle } from './lib/migrate.js'
import { readOwner, writeOwner } from './lib/onboard.js'
import { readBudgets, setBudget } from './lib/budget-book.js'
import { recordBoot } from './lib/system.js'
import { seedIfBlank } from './lib/seed.js'
import { attachDsh } from './adapters/dsh.js'
import { requireCap } from './lib/authz.js'
import { guard, recordCrash, listCrashes } from './lib/crash.js'
import { recordAction, listActions } from './lib/actionlog.js'
import { readBackupConfig, updateBackupConfig, startBackupService, backupStatus, runProtectedBackup, listProtectedSnapshots, restoreProtectedSnapshot, verifyProtectedSnapshot } from './lib/backup-service.js'
import { recordSolution, listSolutions } from './lib/solutions.js'
import { softwareProtectionStatus } from './lib/software-protection.js'
import { listArtifacts, verifyArtifact } from './lib/software-artifacts.js'
import { inspectPolicy, qualifySnapshot, quarantineSnapshot, finishRecovery, resetCircuit } from './lib/recovery-policy.js'
import { readRepairState } from './lib/repair-state.js'
import { startRepairLifecycle } from './lib/repair-lifecycle.js'
import { helperInfo, installRepairHelper } from './lib/repair-helper-install.js'
import { matterPreflight, readMatterHistory, listMatters } from './lib/fact-ledger.js'
let repairLifecycle = null
import { safePath } from './core/jobs.js'
import { withCreativeMemory } from './lib/creative-memory.js'

export const name = 'dsh-yushen-twins'
export const inject = ['webServer', 'sessions']

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SWITCHES = path.join(HOME, 'dayu', 'switches.json')

function logError(kind, error) {
  try {
    fs.mkdirSync(path.join(HOME, 'dayu'), { recursive: true })
    fs.appendFileSync(path.join(HOME, 'dayu', 'error.log'), `${new Date().toISOString()} ${kind}: ${error?.stack ?? error}\n`)
  } catch { /* 日志也写不了就算了 */ }
}

function readSwitches() {
  try {
    let text = fs.readFileSync(SWITCHES, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const raw = JSON.parse(text)
    return {
      master: raw.master !== false,
      dayu: raw.dayu !== false,
      xiaoyu: raw.xiaoyu !== false,
      autoRepair: raw.autoRepair !== false,
    }
  } catch {
    return { master: true, dayu: true, xiaoyu: true, autoRepair: true }
  }
}

// ─────────────────────────────────────────────────────────────
// 桌宠气泡的实时状态（只读、只在本机，给页面上那只小鱼用）
//   · 口径：turn/start → 在跑；turn/end → 结算这一轮
//   · 钱按官方价目表估；模型不在表里就不报钱（宁可不说，也不瞎说）
// ─────────────────────────────────────────────────────────────
const LIVE = { active: false, since: 0, tool: '', session: '', lastTurnSeq: 0, lastTurn: null, usage: null }

const PRICES = {
  'deepseek-flash': { hit: [0.02, 0.04], miss: [1, 2], out: [4, 8] },
  'deepseek-v4-pro': { hit: [0.15, 0.30], miss: [4.5, 9], out: [13.5, 27] },
}

function isPeakHour(now) {
  const d = new Date(now)
  const day = d.getDay()
  if (day === 0 || day === 6) return false
  const h = d.getHours()
  return (h >= 9 && h < 12) || (h >= 14 && h < 18)
}

function priceForModel(model) {
  const key = String(model || '')
  if (PRICES[key]) return PRICES[key]
  if (/^deepseek-(v4-)?flash/.test(key)) return PRICES['deepseek-flash']
  if (/^deepseek-(v4-)?pro/.test(key)) return PRICES['deepseek-v4-pro']
  return null
}

// 工具名 → 给人看的大白话（不出现英文、工具名、路径）
const TOOL_WORDS = [
  [/^(read|glob|grep|ls|list|search)/i, '正在查看…'],
  [/^(write|edit|apply_patch|notebook)/i, '正在调整…'],
  [/^(pwsh|bash|shell|exec|job_)/i, '正在执行…'],
  [/^(web_search|web_fetch|fetch|http)/i, '正在查找…'],
  [/^ask_user_question$/i, '正在等你回话…'],
]
function humanTool(name) {
  const n = String(name || '')
  for (const [re, word] of TOOL_WORDS) if (re.test(n)) return word
  return ''
}

/** 只读地跟一遍会话事件；任何异常都不许影响会话本身。 */
// 工作账：谁、哪条会话、这一轮干了什么、用了哪些工具、花了多少。
// 不靠她记得记，turn/end 时自动落一条；只追加，不改。
const WORK = { text: '', tools: [] }
function roleOfSession(sessionId) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(HOME, 'dayu', 'residence.json'), 'utf8'))
    for (const [role, row] of Object.entries(j.roles || {})) {
      if (String(row?.sessionId || '') === String(sessionId || '')) return role
    }
  } catch { /* 没有账本 */ }
  return ''
}
function appendWork(row) {
  try {
    const dir = path.join(HOME, 'dayu', 'worklog')
    fs.mkdirSync(dir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    fs.appendFileSync(path.join(dir, day + '.jsonl'), JSON.stringify(row) + '\n', 'utf8')
  } catch { /* 记不上不影响会话 */ }
}
function trackLiveEvent(session, event) {
  try {
    const type = String(event?.type || '')
    const data = event?.data && typeof event.data === 'object' ? event.data : {}
    if (type === 'turn/start') {
      LIVE.active = true
      LIVE.since = Date.now()
      LIVE.session = String(session?.id || '')
      LIVE.tool = ''
      LIVE.usage = { hit: 0, miss: 0, out: 0, model: '' }
      return
    }
    if (type === 'tool/call') {
      const word = humanTool(data.name || data.toolName)
      if (word) LIVE.tool = word
      try { WORK.tools.push(String(data.name || data.toolName || '').slice(0, 40)) } catch { /* 忽略 */ }
      return
    }
    if (type === 'assistant/message') {
      const usage = data.usage
      if (!usage || typeof usage !== 'object') return
      if (!LIVE.usage) LIVE.usage = { hit: 0, miss: 0, out: 0, model: '' }
      LIVE.usage.hit += Number(usage.cacheReadTokens) || 0
      LIVE.usage.miss += Number(usage.inputTokens) || 0
      LIVE.usage.out += Number(usage.outputTokens) || 0
      const model = data.message && data.message.source ? data.message.source.model : ''
      if (model) LIVE.usage.model = String(model)
      // 2026-10-30：留一句"这轮说了什么"，给工作账用（只留最后一段，省略号之外不存）
      try {
        const c = data.message && data.message.content
        const txt = Array.isArray(c) ? c.map((x) => (x && x.text) || '').join('') : (typeof c === 'string' ? c : '')
        if (txt) WORK.text = txt.slice(-240)
      } catch { /* 忽略 */ }
      return
    }
    if (type === 'turn/end') {
      const usage = LIVE.usage
      LIVE.active = false
      LIVE.tool = ''
      LIVE.usage = null
      // 2026-10-30：工作账先落，再算钱。
      // 原来"没 usage 就 return"会让工作账一条都写不出来（宿主不一定把 usage 送进来）。
      const total = usage ? (usage.hit + usage.miss + usage.out) : 0
      const price = usage ? priceForModel(usage.model) : null
      let cost = 0
      if (price && total > 0) {
        const off = isPeakHour(Date.now()) ? 1 : 0
        cost = (usage.hit / 1e6) * price.hit[off] + (usage.miss / 1e6) * price.miss[off] + (usage.out / 1e6) * price.out[off]
        LIVE.lastTurnSeq += 1
        LIVE.lastTurn = { seq: LIVE.lastTurnSeq, cost: Number(cost.toFixed(4)), tokens: total, at: Date.now() }
      }
      try {
        appendWork({
          at: new Date().toISOString(),
          role: roleOfSession(LIVE.session),
          session: LIVE.session,
          cost: Number(cost.toFixed(4)),
          tokens: total,
          tools: [...new Set(WORK.tools)].slice(0, 8),
          summary: String(WORK.text || '').replace(/\s+/g, ' ').slice(0, 160),
        })
      } catch { /* 记不上不影响会话 */ }
      WORK.text = ''
      WORK.tools = []
    }
  } catch { /* 状态跟踪失败不影响会话 */ }
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

/** 重启 DSH：写一个 .ps1 让它在外面跑——关应用 → 拉起来 → 90 秒内验 boot.json，
 *  没起来就再拉一次，全程记 restart.log。全本地，不花 token。 */
function restartHost({ dry = false } = {}) {
  const exe = process.execPath && /DeepSeek Harness(\.exe)?$/i.test(process.execPath)
    ? process.execPath
    : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe')
  if (!fs.existsSync(exe)) throw new Error(`找不到 DSH 程序：${exe}`)
  const dir = path.join(HOME, 'dayu')
  fs.mkdirSync(dir, { recursive: true })
  const script = path.join(dir, 'restart.ps1')
  const log = path.join(dir, 'restart.log')
  const marker = path.join(dir, 'boot.json')
  const q = (s) => String(s).replace(/'/g, "''")
  const ps = [
    `$log = '${q(log)}'`,
    `$marker = '${q(marker)}'`,
    `$exe = '${q(exe)}'`,
    "Add-Content -Path $log -Value ((Get-Date).ToString('o') + ' 开始重启')",
    'Start-Sleep -Seconds 2',
    "Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force",
    'Start-Sleep -Seconds 2',
    '$started = Get-Date',
    'Start-Process -FilePath $exe',
    '$ok = $false',
    'for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Seconds 1; if ((Test-Path $marker) -and ((Get-Item $marker).LastWriteTime -gt $started)) { $ok = $true; break } }',
    "if ($ok) { Add-Content -Path $log -Value ((Get-Date).ToString('o') + ' 起来了（boot.json 已更新）') } else { Add-Content -Path $log -Value ((Get-Date).ToString('o') + ' 90 秒没起来，停止重试，请运行鱼神修复助手') }",
  ].join('\n')
  fs.writeFileSync(script, ps, 'utf8')
  try {
    fs.writeFileSync(path.join(dir, 'restart-attempt.json'), JSON.stringify({ at: new Date().toISOString(), exe, script, pid: process.pid, dry }, null, 2), 'utf8')
  } catch { /* 记不下也继续 */ }
  if (dry) return
  repairLifecycle?.markPlannedExit('user-requested-restart')
  // 用 execFile（不是 spawn）：宿主里实测 spawn 会静默失败；execFile 至少能拿到错误。
  execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
    detached: true,
    windowsHide: true,
  }, (error) => {
    if (!error) { try { fs.appendFileSync(path.join(dir, 'restart.log'), `${new Date().toISOString()} 重启脚本跑完了\n`) } catch { /* 忽略 */ } return }
    try { recordCrash({ scope: 'restart', error }) } catch { /* 忽略 */ }
    try { fs.appendFileSync(path.join(dir, 'restart.log'), `${new Date().toISOString()} 重启脚本失败：${error.message}\n`) } catch { /* 忽略 */ }
  }).unref()
}

function readJsonBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('请求体太大（图最多 8MB）'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch {
        reject(new Error('请求体不是 JSON'))
      }
    })
    req.on('error', reject)
  })
}

export async function apply(ctx) {
  const switches = readSwitches()
  // 接宿主：六能力契约。接不上不挡启动（旧路径照跑）。
  try { attachDsh(ctx, { log: (m) => { try { console.log(`[yushen] ${m}`) } catch { /* 忽略 */ } } }) } catch { /* 忽略 */ }
  // 首次启动：如果是出厂版（数据为空），用白纸播种；作者版已有数据，不会被动。
  try { seedIfBlank() } catch { /* 播种失败不挡启动 */ }
  recordBoot('yushen plugin loaded')
  try { repairLifecycle = startRepairLifecycle(ctx) } catch (error) { logError('repair-evidence', error) }
  // 本机增量保全随插件启动/卸载；失败记状态，不阻塞鱼窝。
  try { startBackupService(ctx) } catch (error) { logError('protection-start', error) }
  // 入职分析：启动时扫一遍已装插件（只读、失败不影响主流程）。
  setTimeout(() => { try { scanPlugins() } catch { /* 忽略 */ } }, 1500)

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/yushen-assets',
    handler: async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      if (req.method === 'GET' && url.pathname === '/yushen-assets/nest/bg') {
        const here = path.dirname(fileURLToPath(import.meta.url))
        const file = path.join(here, 'assets', 'nest', url.searchParams.get('size') === 'small' ? 'bg-small.jpg' : 'bg.jpg')
        if (!fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: '鱼窝背景尚未安装' })
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-cache' })
        res.end(fs.readFileSync(file))
        return
      }
      if (req.method === 'GET' && url.pathname === '/yushen-assets/candidate') {
        const plugin = String(url.searchParams.get('plugin') || '')
        const rel = String(url.searchParams.get('rel') || '')
        const hit = characterCandidates().find((c) => c.plugin === plugin && c.rel === rel)
        if (!hit) return sendJson(res, 404, { ok: false, error: '档案里没有这个文件' })
        res.writeHead(200, { 'content-type': mimeOf(hit.path), 'cache-control': 'no-cache' })
        res.end(fs.readFileSync(hit.path))
        return
      }
      if (req.method === 'GET' && url.pathname === '/yushen-assets/guest') {
        const id = String(url.searchParams.get('id') || '')
        const file = guestFile(id)
        if (!file || !fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: '没有这只桌宠' })
        res.writeHead(200, { 'content-type': mimeOf(file), 'cache-control': 'no-cache' })
        res.end(fs.readFileSync(file))
        return
      }
      if (req.method === 'GET' && url.pathname === '/yushen-assets/style') {
        const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
        const file = path.join(home, 'dayu', 'visuals', 'current-style.json')
        if (!fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: '形象版本标记还没写' })
        try {
          const s = JSON.parse(fs.readFileSync(file, 'utf8'))
          return sendJson(res, 200, {
            ok: true,
            current: s.current || '',
            label: s.label || '',
            changedAt: s.changedAt || '',
            available: ['realistic', 'anime-q', 'anime-normal'],
            pending: ['anime-normal-transparent'],
          })
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: String(e?.message || e) })
        }
      }
      if (req.method === 'GET' && url.pathname === '/yushen-assets/halo') {
        const role = String(url.searchParams.get('role') || '')
        const svgRole = role === 'dragon' ? 'zhaowei' : role
        if (!['dayu', 'xiaoyu', 'zhaowei'].includes(svgRole)) return sendJson(res, 400, { ok: false, error: 'role 只能是 dayu / xiaoyu / dragon' })
        const stage = Math.max(1, Math.min(5, Number(url.searchParams.get('stage')) || 1))
        const mode = url.searchParams.get('mode') === 'static' ? 'static' : 'idle'
        const here = path.dirname(fileURLToPath(import.meta.url))
        const file = path.join(here, 'assets', 'halos', `${svgRole}-${stage}-${mode}.svg`)
        if (!fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: '这个阶位的光环还没做' })
        res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-cache' })
        res.end(fs.readFileSync(file))
        return
      }
      if (req.method === 'GET' && url.pathname === '/yushen-assets/avatar') {
        const who = String(url.searchParams.get('who') || '')
        if (!roleList().includes(who)) return sendJson(res, 400, { ok: false, error: `who 只能是 ${roleList().join(' / ')}` })
        const file = resolveAvatar(who)
        if (!file) return sendJson(res, 404, { ok: false, error: `没有 ${who} 的形象` })
        const buf = fs.readFileSync(file)
        res.writeHead(200, { 'content-type': mimeOf(file), 'cache-control': 'no-cache' })
        res.end(buf)
        return
      }
      return sendJson(res, 404, { ok: false, error: 'unknown' })
    },
  }), 'yushen: /yushen-assets')

  // 桌宠气泡的实时状态：跟一遍会话事件（老宿主没有这条事件也不影响别的功能）
  try { ctx.on('session/event', trackLiveEvent) } catch { /* 没有事件总线就只靠点按冒泡 */ }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/yushen/live',
    handler: (req, res) => {
      if (!isAllowed(req)) return unauthorized(res)
      return sendJson(res, 200, {
        ok: true,
        active: LIVE.active,
        since: LIVE.since,
        tool: LIVE.tool,
        lastTurnSeq: LIVE.lastTurnSeq,
        lastTurn: LIVE.lastTurn,
      })
    },
  }), 'yushen: /api/yushen/live')

  // 装前认人：本机已经有哪些角色（只读，不改任何文件）
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/yushen/roles/detect',
    handler: (req, res) => {
      if (!isAllowed(req)) return unauthorized(res)
      try {
        const { roles, checked } = detectRoles({})
        return sendJson(res, 200, { ok: true, count: roles.length, checked, roles })
      } catch (error) {
        return sendJson(res, 200, { ok: false, count: 0, roles: [], error: String(error?.message || error) })
      }
    },
  }), 'yushen: /api/yushen/roles/detect')

  // 移动端接口：必须注册在 /api/yushen 之前——手机没有 DSH 登录态，只带自己的设备令牌
  // （X-Mobile-Token）。契约见 手机端-设计.md。
  const mobileGateway = createMobileGateway()
  const mobileVersion = (() => {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url))
      return String(JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version || '0.0.0')
    } catch { return '0.0.0' }
  })()
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/api/yushen/mobile',
    handler: guard('api/yushen/mobile', createMobileRoutes({
      gateway: mobileGateway,
      isAllowed,
      readBody: readJsonBody,
      version: mobileVersion,
      digest: (sessionId, opts) => transcriptDigest(sessionId, opts),
      prompt: async ({ sessionId, role, text }) => {
        await promptRpc({ sessionId, text: withCreativeMemory(`【手机 · ${role}】${text}`) })
      },
      ensure: async ({ device }) => {
        const sessionId = await createSessionRpc({ cwd: process.cwd() })
        try { await selectModelRpc({ sessionId }) } catch { /* 用默认模型 */ }
        try { await renameSessionRpc(sessionId, `手机 · ${device.name}`) } catch { /* 改不了就留着 */ }
        return sessionId
      },
    }).handler),
  }), 'yushen: /api/yushen/mobile')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/api/yushen',
    handler: guard('api/yushen', async (req, res) => {
      // 顺手记下宿主地址：派活要用 HTTP RPC 时会按这个拼 baseUrl（见 lib/dsh-rpc.js）。
      try { setDshHost(req.headers.host) } catch { /* 忽略 */ }
      if (!isAllowed(req)) return unauthorized(res)
      const url = new URL(req.url, 'http://127.0.0.1')
      // 动作记录：请求一到就记一笔（尤其是点了按钮但没反应的场景）。
      try {
        if (req.method !== 'GET') recordAction({ kind: 'request', method: req.method, path: url.pathname, status: 200, ok: true, note: 'received' })
      } catch { /* 记不了不影响 */ }
      try {
        if (req.method === 'GET' && url.pathname === '/api/yushen/status') {
          return sendJson(res, 200, { ok: true, switches })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/nest') {
          return sendJson(res, 200, snapshot())
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/action') {
          const body = await readJsonBody(req).catch(() => ({}))
          recordAction({ kind: 'click', path: String(body.name || 'unknown'), method: 'CLIENT', status: 200, ok: true, note: '浏览器里点的' })
          return sendJson(res, 200, { ok: true })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/file') {
          // 聊天里的文件卡片点开：只读、限 200KB、只能看工作区/.dsh/deepseekTools。
          try {
            const full = safePath(url.searchParams.get('path'))
            const text = fs.readFileSync(full, 'utf8').slice(0, 200 * 1024)
            return sendJson(res, 200, { ok: true, path: full, text })
          } catch (error) { return sendJson(res, 400, { ok: false, error: String(error?.message || error) }) }
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/upload') {
          // 聊天里发文件：落到 ~/.dsh/dayu/uploads/，只存本机；返回路径给消息卡片用。
          try {
            const body = await readJsonBody(req)
            const name = String(body.name || 'file').replace(/[^\w.\u4e00-\u9fa5-]+/g, '_').slice(-60)
            const m = String(body.dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
            if (!m) throw new Error('只收 base64 文件')
            const buf = Buffer.from(m[2], 'base64')
            if (buf.length > 8 * 1024 * 1024) throw new Error('文件太大，最多 8MB')
            const dir = path.join(HOME, 'dayu', 'uploads')
            fs.mkdirSync(dir, { recursive: true })
            const full = path.join(dir, `${Date.now()}-${name}`)
            fs.writeFileSync(full, buf)
            return sendJson(res, 200, { ok: true, path: full, size: buf.length, mime: m[1] })
          } catch (error) { return sendJson(res, 400, { ok: false, error: String(error?.message || error) }) }
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/facts') {
          return sendJson(res, 200, matterPreflight({ query: url.searchParams.get('q') || '', kind: url.searchParams.get('kind') || undefined }))
        }
        if (req.method === 'GET' && url.pathname.startsWith('/api/yushen/facts/')) {
          const matterId = decodeURIComponent(url.pathname.slice('/api/yushen/facts/'.length))
          return sendJson(res, 200, readMatterHistory(matterId))
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/protection/recovery-policy') {
          return sendJson(res, 200, { ok: true, policy: await inspectPolicy({ store: (await readBackupConfig()).store }) })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/protection/recovery-policy') {
          const body = await readJsonBody(req)
          const store = (await readBackupConfig()).store
          if (body.action === 'qualify') {
            await verifyProtectedSnapshot(body.id)
            return sendJson(res, 200, { ok: true, result: await qualifySnapshot({ store, id: body.id, evidence: body.evidence }) })
          }
          if (body.action === 'quarantine') return sendJson(res, 200, { ok: true, result: await quarantineSnapshot({ store, id: body.id, reason: body.reason }) })
          if (body.action === 'finish') return sendJson(res, 200, { ok: true, result: await finishRecovery({ store, attemptId: body.attemptId, success: body.success, reason: body.reason }) })
          if (body.action === 'reset' && body.confirm === 'RESET CIRCUIT') return sendJson(res, 200, { ok: true, result: await resetCircuit({ store, acknowledge: true, reason: body.reason }) })
          return sendJson(res, 400, { ok: false, error: 'Unknown recovery policy action or missing confirmation' })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/protection/repair/helper') {
          return sendJson(res, 200, { ok: true, helper: await helperInfo() })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/protection/repair/install') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, { ok: true, result: await installRepairHelper({ confirm: body.confirm, desktop: true }) })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/protection/repair/status') {
          return sendJson(res, 200, { ok: true, repair: readRepairState() })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/protection/artifacts') {
          return sendJson(res, 200, { ok: true, artifacts: await listArtifacts({ store: path.join(HOME, 'dayu', 'protection', 'software-artifacts') }) })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/protection/artifacts/verify') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, await verifyArtifact({ store: path.join(HOME, 'dayu', 'protection', 'software-artifacts'), id: body.id }))
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/protection/software') {
          return sendJson(res, 200, { ok: true, coverage: softwareProtectionStatus() })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/protection') {
          return sendJson(res, 200, { ok: true, status: backupStatus(), snapshots: await listProtectedSnapshots() })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/protection/config') {
          return sendJson(res, 200, { ok: true, config: await readBackupConfig() })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/protection/config') {
          const body = await readJsonBody(req)
          const config = await updateBackupConfig(body)
          return sendJson(res, 200, { ok: true, config })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/backup') {
          const r = await runProtectedBackup()
          recordAction({ kind: 'backup', path: r.id || 'no-change', method: 'COPY', status: 200, ok: true, note: r.skipped ? '未变化，不新增版本' : '已保存内容去重的历史快照' })
          return sendJson(res, 200, { ...r, ok: true })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/protection/verify') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, await verifyProtectedSnapshot(body.id))
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/protection/restore') {
          const body = await readJsonBody(req)
          if (body.apply === true && body.confirm !== 'RESTORE') return sendJson(res, 400, { ok: false, error: '真实恢复需要confirm=RESTORE；默认只预览差异' })
          return sendJson(res, 200, { ok: true, ...(await restoreProtectedSnapshot({ id: body.id, apply: body.apply === true })) })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/solutions') {
          return sendJson(res, 200, { ok: true, solutions: await listSolutions() })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/solutions') {
          return sendJson(res, 200, { ok: true, solution: await recordSolution(await readJsonBody(req), { explicit: true }) })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/restart') {
          if (!requireCap(res, 'host.restart', sendJson)) return
          const dry = url.searchParams.get('dry') === '1'
          try {
            restartHost({ dry })
            return sendJson(res, 200, { ok: true, dry, note: dry ? '干跑：只写证据，不真重启' : '2 秒后重启 DSH；页面会断开，重开即最新' })
          } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'GET' && url.pathname === '/api/dayu/budget') {
          try { return sendJson(res, 200, readBudgets()) } catch (e) { return sendJson(res, 500, { ok: false, error: String(e?.message || e) }) }
        }
        if (req.method === 'POST' && url.pathname === '/api/dayu/budget') {
          if (!requireCap(res, 'owner.write', sendJson)) return
          const body = await readJsonBody(req)
          const out = setBudget(String(body.role || ''), body.total, body.days)
          return sendJson(res, out.ok ? 200 : 400, out)
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/onboard') {
          return sendJson(res, 200, readOwner())
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/onboard') {
          if (!requireCap(res, 'owner.write', sendJson)) return
          const body = await readJsonBody(req)
          return sendJson(res, 200, writeOwner(body))
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/move/export') {
          return sendJson(res, 200, exportBundle())
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/move/import') {
          const body = await readJsonBody(req)
          try {
            return sendJson(res, 200, importBundle(body))
          } catch (e) {
            return sendJson(res, 400, { ok: false, error: String(e?.message || e) })
          }
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/nest/candidates') {
          const list = characterCandidates().map((c) => ({
            id: `${c.plugin}::${c.rel}`, plugin: c.plugin, rel: c.rel, kind: c.kind, bytes: c.bytes, license: c.license || '',
          }))
          return sendJson(res, 200, { ok: true, candidates: list })
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/nest/adopt-file') {
          const body = await readJsonBody(req)
          const hit = characterCandidates().find((c) => c.plugin === body.plugin && c.rel === body.rel)
          if (!hit) return sendJson(res, 404, { ok: false, error: '入职档案里没有这个文件' })
          return sendJson(res, 200, adoptFile(body.role, body.name, hit.path, { plugin: hit.plugin, rel: hit.rel, license: hit.license }))
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/nest/adopt') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, adopt(body.role, body.name, body.dataUrl))
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/nest/adopt-url') {
          const body = await readJsonBody(req)
          const role = body.role || ''
          if (role && !roleList().includes(role)) return sendJson(res, 400, { ok: false, error: `role 只能是 ${ROLES.join(' / ')}` })
          const from = body.from && typeof body.from === 'object' ? body.from : {}
          const result = await adoptUrl(role, body.name, body.src, from)
          return sendJson(res, 200, result)
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/nest/guest/remove') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, removeGuest(String(body.id || '')))
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/nest/rename') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, rename(body.role, body.name))
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/nest/restore') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, restore(body.role))
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/nest/pos') {
          const body = await readJsonBody(req)
          return sendJson(res, 200, move(body.role, body.x, body.y))
        }
      } catch (error) {
        return sendJson(res, 400, { ok: false, error: String(error?.message || error) })
      }
      return sendJson(res, 404, { ok: false, error: 'unknown' })
    }),
  }), 'yushen: /api/yushen')

  if (!switches.master) {
    try { console.log('[yushen] 总开关关闭，两条鱼都不挂') } catch { /* 没有控制台 */ }
    return
  }
  if (switches.dayu) {
    // 动态加载：大鱼入口自己写崩了，也不连累路由和侧边栏。
    try {
      const mod = await import('./dayu/index.js')
      mod.apply(ctx)
    } catch (error) { logError('dayu', error); console.error('[yushen] 大鱼入口挂了（路由尽量保留）', error) }
  }
  if (switches.xiaoyu) {
    try {
      const mod = await import('./xiaoyu/index.js')
      mod.apply(ctx)
    } catch (error) { logError('xiaoyu', error); console.error('[yushen] 小鱼入口挂了', error) }
  }

  // 启动标记：重启脚本靠它判断“是不是真的起来了”，不花 token。
  try {
    fs.writeFileSync(path.join(HOME, 'dayu', 'boot.json'), JSON.stringify({
      at: new Date().toISOString(),
      pid: process.pid,
      node: process.execPath,
      switches,
    }, null, 2), 'utf8')
  } catch { /* 标记写不了不影响启动 */ }

  // 修复联动（2026-10-25 故障档案）：DSH 能起来之后，和修复助手对一次账——
  // 台账里还 open、但现在证据已消失的缺口标记 resolved；仍然修不了的写成能力请求。
  // 只读诊断 + 只追加台账；失败静默，一个进程只跑一次，绝不拖慢或搞挂启动。
  try {
    if (!globalThis.__yushenRepairLoopStarted) {
      globalThis.__yushenRepairLoopStarted = true
      void import('./lib/repair-loop.js')
        .then((m) => m.runRepairLoop())
        .then((r) => {
          if (r && ((r.resolvedNow || []).length || (r.capabilitiesRequested || []).length)) {
            console.log('[repair-loop] 对账完成', JSON.stringify({
              resolved: r.resolvedNow, stillOpen: r.stillOpen, requested: r.capabilitiesRequested,
            }))
          }
        })
        .catch(() => { /* 对账失败不影响启动 */ })
    }
  } catch { /* 同上 */ }

  // 助手自动升级（2026-10-26）：只有「已经装过我们自己的某个版本」才动作——
  // 首装仍要用户在面板上点确认；升级时顺手把桌面快捷方式指向新版本、旧版本目录归档。
  try {
    if (!globalThis.__yushenHelperUpgradeStarted) {
      globalThis.__yushenHelperUpgradeStarted = true
      void import('./lib/repair-helper-install.js')
        .then((m) => m.autoUpgradeIfInstalled())
        .then((r) => {
          if (r && (r.upgraded || r.shortcutUpdated)) console.log('[repair-helper] 自动升级', JSON.stringify(r))
        })
        .catch(() => { /* 升级失败不影响启动 */ })
    }
  } catch { /* 同上 */ }
}
