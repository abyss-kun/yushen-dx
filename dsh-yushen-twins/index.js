// 改｜2026-11-24 23:50｜大鱼·工作台｜授权：主人（2026-11-24：还有什么没做的一起）｜index.js:1｜本轮整理提交：该文件在本轮之前已有改动，补留痕｜为什么：改动要能查到谁/何时/怎么验｜验证：回归 325/0（整体）｜可改：可改
// 鱼神双子星 · Copyright (c) 2026 从零开始. All rights reserved.
// 改｜2026-11-18 01:40｜大鱼·子代理（独立记忆后台页）｜授权：老板（任务书：只做独立记忆后台页，不改 client.js/角色卡）｜index.js:65-72,316-567,691-719,776-784｜新增：GET /api/yushen/memory/overview（只读六块：卡片/事件段/中层/信箱/心跳/压缩/召回/维护，失败项标 unknown）+ GET /yushen-memory 整页（pages/memory-admin.html，无构建、不内嵌令牌）｜为什么：记忆系统状态原来只在侧栏卡片和零散脚本里看，需要一个打开就能看全貌的独立页｜验证：node --check index.js；node scripts/test-memory-admin.mjs 10/10；假 ctx 真 HTTP 探针（页面 200、带令牌 API 200、未授权 401、POST 404、六块 known=true）；真数据只读跑 307ms，关键状态文件 mtime 未变｜可改：可改
// 改｜2026-11-03 16:52｜大鱼·子会话（文件编辑）｜授权：老板｜index.js:491-512｜新增 /api/yushen/file-edit（能力）、/api/yushen/file-text GET/POST（读/存）、/api/yushen/file-open POST（本机编辑器）｜为什么：右侧预览/diff 只读，保存要有后端接口｜验证：node --check index.js；node scripts/test-file-edit.mjs 12/0（HTTP 契约）｜可改：可改
// 改｜2026-11-02 23:20｜大鱼·子会话（工作台；父会话 session-bef06908 委派）｜授权：老板（本次任务书：桌宠右键看后台任务）｜index.js:17-20,461-470｜新增：GET /api/yushen/busy 把 busySnapshot() 递给桌宠面板（只读）｜为什么：面板要真实数据，不能在浏览器里另算一份｜验证：node --check index.js 通过；headless Edge 真页面里面板拿到 ok:true 的全量数据（scripts/busy-ui-probe.mjs）；`~/.dsh/dayu/boot.json` 记着插件在 2026-11-02T15:21:53 重载过，DSH 本身没重启｜可改：可改
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
// 桌宠右键那个「现在在忙什么」（只读；数据来自会话事件 / 桥的 lock / 宿主的 schedule.json / 当天账本）
import { busySnapshot, busyText } from './lib/busy.js'
// 经验条只认「自己想、自己排、自己做完」的议程条目（老板 2026-10-30 定），这里给它数。
import { readAgenda, countsForXp } from './lib/agenda.js'

/**
 * 经验只认「自己想做、自己排、自己做完」的议程条目（老板 2026-10-30 定）：
 * by=self 且 state=done 才算一件；他派的活（派活单）不进这个数。
 */
function selfDoneCounts() {
  const out = {}
  for (const role of ['dayu', 'xiaoyu', 'dragon']) {
    try {
      const items = readAgenda(role).items
      out[role] = items.filter(countsForXp).length
    } catch { out[role] = 0 }
  }
  return out
}
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
// 文件编辑（2026-11-03）：右侧预览/第 N 轮改动都只读，插件面板里补一条能改的路。
import { readTextResponse, saveTextResponse, openEditorResponse, fileEditCapabilities } from './lib/file-edit.js'
import { withCreativeMemory } from './lib/creative-memory.js'
// 2026-11-18：独立记忆后台页（/yushen-memory）的只读数据源。
// 只读：卡片目录、事件段、中层、信箱、心跳、压缩模式、召回日志、维护状态；这个页面不提供任何写操作。
import { cardStats } from './memory-core/runtime/cards.js'
import { readEpisodes } from './memory-core/runtime/episode.js'
import { dataRoot } from './memory-core/runtime/root.js'
import { statusOf as memoryStorageStatus } from './memory-core/runtime/control.js'
import { readHeartbeats, summaryOf, wakeClassOf } from './lib/heartbeat-journal.js'
import { unreadFor, roleReads } from './lib/inbox.js'
import { reminderStats } from './lib/turn-ledger.js'
import { describeMode } from './lib/compaction-mode.js'
import { describeMode as describeRetrieval, setMode as setRetrievalMode } from './lib/retrieval-mode.js'
import { recallStats, readRecallLog } from './lib/recall-log.js'

export const name = 'dsh-yushen-twins'
// 2026-11-04：安卓上的 DSH 没有网页服务器服务，注入 webServer 会让整个插件装不上
// （真机实测：0.2.6 装到手机被系统撤销安装）。手机包里把 MOBILE_BUILD 翻成 true，
// 只注入 sessions，HTTP 路由整段跳过；电脑包保持原样。
// 改｜2026-11-04 23:02｜大鱼·工作台｜授权：老板｜index.js:66-72,scripts/pack-mobile.mjs:58-68｜修：手机版插件装不上（webServer 必选注入）；手机包改为只注入 sessions 并跳过 HTTP 路由；pack-mobile 自动翻 MOBILE_BUILD｜为什么：安卓 DSH 没有 webServer 服务，必选注入会让插件被撤销安装｜验证：真机 0.2.6-mobile 安装成功、41 个工具、运行中；记忆导入 2411 条；4 张卡逐字节一致｜可改：可改
const MOBILE_BUILD = false // 打包手机版时由 scripts/pack-mobile.mjs 改成 true
export const inject = MOBILE_BUILD ? ['sessions'] : ['sessions', 'webServer']

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
    "Add-Content -Path $log -Value ((Get-Date).ToString('o') + ' restart start')",
    'Start-Sleep -Seconds 2',
    "Get-Process 'DeepSeek Harness' -ErrorAction SilentlyContinue | Stop-Process -Force",
    'Start-Sleep -Seconds 2',
    '$started = Get-Date',
    'Start-Process -FilePath $exe',
    '$ok = $false',
    'for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Seconds 1; if ((Test-Path $marker) -and ((Get-Item $marker).LastWriteTime -gt $started)) { $ok = $true; break } }',
    "if ($ok) { Add-Content -Path $log -Value ((Get-Date).ToString('o') + ' restarted ok') } else { Add-Content -Path $log -Value ((Get-Date).ToString('o') + ' 90 秒没起来，停止重试，请运行鱼神修复助手') }",
  ].join('\n')
  fs.writeFileSync(script, '\uFEFF' + ps, 'utf8')
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

// ─────────────────────────────────────────────────────────────
// 记忆后台的只读总览（2026-11-18）
//   · 给独立页 /yushen-memory 用，不是侧栏卡片；
//   · **只读**：不建目录、不写游标、不改任何数据（信箱未读也传 day，免得顺手初始化已读位）；
//   · **不编数**：读得出来就报真数；读不出来的那一项标 unknown 并写明原因，不用 0 冒充；
//   · 六块：概览（卡片/事件段/中层）/ 信箱 / 心跳 / 压缩 / 召回 / 维护。
// ─────────────────────────────────────────────────────────────
const MEMORY_ROLES = Object.freeze(['dayu', 'xiaoyu', 'dragon'])

function oneLineValue(value, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function localDay(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 读一份 JSON；坏文件/没文件都返回 fallback，不抛。 */
function readJsonQuiet(file, fallback) {
  try {
    let text = fs.readFileSync(file, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    return JSON.parse(text)
  } catch { return fallback }
}

/** 数一个目录（递归）里的 jsonl 行：坏行跳过，不计数、不抛。 */
function countJsonlDir(dir) {
  let files = 0
  let rows = 0
  let queued = 0
  const walk = (current) => {
    let entries = []
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!full.endsWith('.jsonl')) continue
      files += 1
      let lines = []
      try { lines = fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/) } catch { continue }
      for (const line of lines) {
        if (!line.trim()) continue
        let row = null
        try { row = JSON.parse(line) } catch { continue }
        rows += 1
        if (row && row.state === 'queued') queued += 1
      }
    }
  }
  walk(dir)
  return { files, rows, queued }
}

/**
 * 记忆系统只读总览。任何一块失败都只在结果里标 known:false（带原因），不抛给调用方。
 * @returns {{ok:true, at:string, day:string, roles:string[], root:string, unknown:object[], cards:object, episodes:object, middle:object, inbox:object, heartbeat:object, compaction:object, recall:object, maintenance:object}}
 */
export function memoryOverview({ now = Date.now() } = {}) {
  const ts = Number(now) || Date.now()
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const data = dataRoot(home)
  const out = {
    ok: true,
    at: new Date(ts).toISOString(),
    day: localDay(ts),
    roles: [...MEMORY_ROLES],
    root: data,
    unknown: [],
  }

  const block = (name, fn) => {
    const parts = []
    try {
      const value = fn(parts)
      out[name] = { known: true, ...(value && typeof value === 'object' ? value : {}), unknown: parts }
    } catch (error) {
      const reason = oneLineValue(error?.message || error, 300)
      out.unknown.push({ block: name, reason })
      out[name] = { known: false, reason, unknown: parts }
    }
  }
  const part = (parts, item, fn, fallback = null) => {
    try { return fn() } catch (error) {
      parts.push({ item, reason: oneLineValue(error?.message || error, 300) })
      return fallback
    }
  }

  // 概览①：卡片（按类型/游）、事件段（按角色去重）、中层行数
  block('cards', () => {
    const stats = cardStats()
    return { total: Number(stats?.total) || 0, byKind: stats?.byKind || {}, byTier: stats?.byTier || {} }
  })

  block('episodes', () => {
    const byRole = {}
    let count = 0
    let versions = 0
    for (const role of MEMORY_ROLES) {
      const rows = readEpisodes(role)
      const ids = new Set(rows.map((row) => String(row?.id || '')).filter(Boolean))
      byRole[role] = { count: ids.size, versions: rows.length }
      count += ids.size
      versions += rows.length
    }
    return { count, versions, byRole }
  })

  block('middle', (parts) => {
    const main = countJsonlDir(path.join(data, 'library', '中层'))
    const legacy = part(parts, '手抄本（旧目录）', () => countJsonlDir(path.join(data, 'library', '手抄本')), { files: 0, rows: 0 })
    return { rows: main.rows, files: main.files, queued: main.queued, legacyRows: legacy.rows, legacyFiles: legacy.files }
  })

  // 概览②：信箱（QQ 收件箱逐条镜像）——未读按角色算，断档来自镜像游标
  block('inbox', (parts) => {
    const inboxRoot = path.join(home, 'dayu', 'inbox')
    const cursor = readJsonQuiet(path.join(inboxRoot, '.cursor.json'), null)
    const gaps = Array.isArray(cursor?.gaps) ? cursor.gaps.filter((gap) => gap && typeof gap === 'object') : []
    const roles = {}
    let unread = 0
    let counted = 0
    for (const role of MEMORY_ROLES) {
      // 已读位只读；没有已读位 ≠ 全部未读，如实说「还没启用」。
      const cursorOfRole = part(parts, `${role} 已读位`, () => roleReads(role)?.channels?.qq || null, null)
      if (!cursorOfRole) {
        roles[role] = { hasCursor: false, unread: null, note: '还没有已读位（没看过，不算未读）' }
        continue
      }
      // 传 day：unreadFor 有 day 时不会去初始化已读位（只读，不写 .reads.json）。
      const got = part(parts, `${role} 未读`, () => unreadFor(role, { day: localDay(ts), limit: 1 }), null)
      if (!got) { roles[role] = { hasCursor: true, unread: null, note: '未读算不出来' }; continue }
      roles[role] = {
        hasCursor: true,
        unread: Number(got.unread) || 0,
        total: Number(got.total) || 0,
        via: oneLineValue(got.via, 20),
        degraded: Boolean(got.degraded),
      }
      unread += Number(got.unread) || 0
      counted += 1
    }
    return {
      unread: counted ? unread : null,
      gaps: { count: gaps.length, last: gaps.length ? oneLineValue(gaps[gaps.length - 1]?.at, 40) : '' },
      cursorUpdatedAt: oneLineValue(cursor?.updatedAt, 40),
      roles,
    }
  })

  // 概览③：心跳（今天的逐跳留痕，按角色汇总；落点口径来自 heartbeat-journal 自己）
  block('heartbeat', (parts) => {
    const rows = readHeartbeats({ role: '', now: ts, days: 1 })
    const roles = {}
    // 按类报数用「今天的全部行」算，跟 lines 同一口径（不按角色各算再相加，免得漏掉没登记角色的行）。
    const byClass = {}
    for (const row of rows) {
      const cls = wakeClassOf(row?.trigger)
      byClass[cls] = (byClass[cls] || 0) + 1
    }
    let produced = 0
    let idle = 0
    let unjudged = 0
    let selfTicks = 0
    let lastAt = ''
    for (const role of MEMORY_ROLES) {
      const summary = part(parts, `${role} 心跳汇总`, () => summaryOf({ role, now: ts }), null)
      if (!summary) { roles[role] = { known: false }; continue }
      roles[role] = {
        known: true,
        total: Number(summary.total) || 0,
        selfTicks: Number(summary.selfTicks) || 0,
        wakes: Number(summary.wakes) || 0,
        produced: Number(summary.produced) || 0,
        idle: Number(summary.idle) || 0,
        // summaryOf 里叫 unknown（还没认定落点）；这里换个名字，免得和「读不出来」混在一起。
        unjudged: Number(summary.unknown) || 0,
        spent: Number(summary.spent) || 0,
        lastAt: oneLineValue(summary.lastAt, 40),
        nextAt: oneLineValue(summary.nextAt, 40),
      }
      produced += Number(summary.produced) || 0
      idle += Number(summary.idle) || 0
      unjudged += Number(summary.unknown) || 0
      selfTicks += Number(summary.selfTicks) || 0
      if (summary.lastAt && summary.lastAt > lastAt) lastAt = summary.lastAt
    }
    return { day: localDay(ts), lines: rows.length, byClass, produced, idle, unjudged, selfTicks, lastAt, roles }
  })

  // 概览③b：每轮台账的提醒额度（不是每轮催，但每天多少要看得见）
  block('reminders', (parts) => {
    const roles = {}
    let open = 0
    let explicit = 0
    let reminded24h = 0
    let maxPerDay = 0
    let enabled = true
    for (const role of [...MEMORY_ROLES, 'workbench']) {
      const s = part(parts, `${role} 提醒额度`, () => reminderStats(role, { now: ts }), null)
      if (!s) { roles[role] = null; continue }
      roles[role] = s
      open += Number(s.open) || 0
      explicit += Number(s.explicit) || 0
      reminded24h += Number(s.reminded24h) || 0
      maxPerDay = Math.max(maxPerDay, Number(s.maxPerDay) || 0)
      enabled = s.enabled !== false
    }
    return { enabled, maxPerDay, reminded24h, remaining: Math.max(0, maxPerDay - reminded24h), open, explicit, roles }
  })
  // 概览④：压缩摘要模式（default / memory / off）
  block('compaction', () => {
    const mode = describeMode()
    return { mode: oneLineValue(mode.mode, 20), label: oneLineValue(mode.label, 40), modes: Array.isArray(mode.modes) ? mode.modes : [] }
  })

  // 概览⑤：召回（最近 7 天次数/用上次数 + 最近一条）
  block('recall', (parts) => {
    const stats = recallStats({ days: 7 })
    const rows = part(parts, '最近一条召回', () => readRecallLog({ limit: 200 }), [])
    const last = rows.length ? rows[rows.length - 1] : null
    return {
      windowDays: Number(stats.days) || 7,
      total: Number(stats.total) || 0,
      used: Number(stats.used) || 0,
      hitRate: Number(stats.hitRate) || 0,
      logRows: rows.length,
      last: last ? {
        at: oneLineValue(last.at, 40),
        who: oneLineValue(last.who, 40),
        query: oneLineValue(last.query, 80),
        hits: Number(last.hits) || 0,
        used: oneLineValue(last.used, 20),
        source: oneLineValue(last.source, 40),
      } : null,
    }
  })

  // 概览⑥：维护（离线维护脚本最后一份总结 + 记忆目录大小；只读）
  block('maintenance', (parts) => {
    const file = path.join(data, 'runtime', 'maintenance-last.json')
    let last = null
    if (fs.existsSync(file)) {
      const doc = part(parts, 'maintenance-last.json', () => {
        let text = fs.readFileSync(file, 'utf8')
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
        return JSON.parse(text)
      }, null)
      if (doc && typeof doc === 'object') {
        last = {
          at: oneLineValue(doc.at, 40),
          ok: doc.ok !== false,
          ms: Number(doc.ms) || 0,
          steps: Array.isArray(doc.steps)
            ? doc.steps.slice(-40).map((step) => ({
              step: oneLineValue(step?.step, 40),
              result: oneLineValue(step?.result, 40),
              ms: Number(step?.ms) || 0,
            }))
            : [],
          lines: Array.isArray(doc.lines) ? doc.lines.slice(-8).map((line) => oneLineValue(line, 200)) : [],
        }
      }
    }
    const storage = part(parts, '记忆目录大小', () => memoryStorageStatus(), null)
    return { ran: Boolean(last), last, storage }
  })

  return out
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

  if (!MOBILE_BUILD) ctx.effect(() => ctx.webServer.register({
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

  if (!MOBILE_BUILD) ctx.effect(() => ctx.webServer.register({
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
  if (!MOBILE_BUILD) ctx.effect(() => ctx.webServer.register({
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

  // 独立记忆后台页（2026-11-18）：/yushen-memory 是整页，不是鱼神侧栏里的卡片。
  // 页面本身是一份静态 HTML（pages/memory-admin.html），不含任何令牌；脚本只同源请求
  // /api/yushen/memory/overview，靠浏览器自带的 DSH 登录 Cookie 过门。
  if (!MOBILE_BUILD) {
    const serveMemoryAdmin = (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { ok: false, error: '只支持 GET' })
      let html = ''
      try {
        const here = path.dirname(fileURLToPath(import.meta.url))
        html = fs.readFileSync(path.join(here, 'pages', 'memory-admin.html'), 'utf8')
      } catch (error) {
        return sendJson(res, 500, { ok: false, error: `页面文件读不了：${String(error?.message || error)}` })
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : html)
    }
    // 一个 prefix + 入口处白名单：带不带结尾斜杠都给同一页；别的 /yushen-memory* 一律 404。
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/yushen-memory',
      handler: (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        if (url.pathname !== '/yushen-memory' && url.pathname !== '/yushen-memory/') {
          return sendJson(res, 404, { ok: false, error: 'unknown' })
        }
        return serveMemoryAdmin(req, res)
      },
    }), 'yushen: /yushen-memory')
  }

  // 移动端接口：必须注册在 /api/yushen 之前——手机没有 DSH 登录态，只带自己的设备令牌
  // （X-Mobile-Token）。契约见 手机端-设计.md。
  const mobileGateway = createMobileGateway()
  const mobileVersion = (() => {
    try {
      const here = path.dirname(fileURLToPath(import.meta.url))
      return String(JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8')).version || '0.0.0')
    } catch { return '0.0.0' }
  })()
  if (!MOBILE_BUILD) ctx.effect(() => ctx.webServer.register({
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

  if (!MOBILE_BUILD) ctx.effect(() => ctx.webServer.register({
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
        // 桌宠右键 →「现在在忙什么」：只读，不写任何状态（见 lib/busy.js 抬头）。
        if (req.method === 'GET' && url.pathname === '/api/yushen/busy') {
          try {
            const snap = busySnapshot()
            return sendJson(res, 200, { ok: true, ...snap, text: busyText(snap) })
          } catch (error) {
            return sendJson(res, 200, { ok: false, error: String(error?.message || error) })
          }
        }
        // 独立记忆后台页（2026-11-18）：只读总览，给 /yushen-memory 用。
        // 只读：不写任何文件；哪一块读不出来就如实标 unknown（见 memoryOverview）。
        if (req.method === 'GET' && url.pathname === '/api/yushen/memory/overview') {
          try {
            return sendJson(res, 200, memoryOverview())
          } catch (error) {
            return sendJson(res, 200, { ok: false, error: String(error?.message || error) })
          }
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/memory/retrieval') {
          try {
            const body = await readJsonBody(req, 4096)
            const out = setRetrievalMode(body?.mode)
            return sendJson(res, out.ok === false ? 400 : 200, out)
          } catch (error) {
            return sendJson(res, 400, { ok: false, error: String(error?.message || error) })
          }
        }        if (req.method === 'POST' && url.pathname === '/api/yushen/memory/reminders') {
          try {
            const body = await readJsonBody(req, 4096)
            const next = writeSwitches({ turnReminder: body?.turnReminder === true })
            return sendJson(res, 200, { ok: true, turnReminder: next.turnReminder !== false })
          } catch (error) {
            return sendJson(res, 400, { ok: false, error: String(error?.message || error) })
          }
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/nest') {
          return sendJson(res, 200, { ...snapshot(), selfDone: selfDoneCounts() })
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
        // 文件编辑：读（GET）/ 存（POST）。DSH 右侧的「文件」「第 N 轮改动」是预览与 diff，
        // 组件层没有写接口（workspaceFiles 只有 read/readBytes/stat/list/changes），所以给插件面板一条路。
        if (req.method === 'GET' && url.pathname === '/api/yushen/file-edit') {
          return sendJson(res, 200, { ok: true, ...fileEditCapabilities() })
        }
        if (req.method === 'GET' && url.pathname === '/api/yushen/file-text') {
          const out = readTextResponse(url.searchParams.get('path'))
          return sendJson(res, out.status, out.body)
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/file-text') {
          let body = {}
          try { body = await readJsonBody(req) } catch { body = {} }
          const out = saveTextResponse(body)
          return sendJson(res, out.status, out.body)
        }
        if (req.method === 'POST' && url.pathname === '/api/yushen/file-open') {
          // 用本机编辑器打开：优先 VS Code / Cursor，找不到就记事本。同样只认 safePath 的根。
          let body = {}
          try { body = await readJsonBody(req) } catch { body = {} }
          const out = openEditorResponse(body)
          return sendJson(res, out.status, out.body)
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
