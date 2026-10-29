// 鱼神 · 软件本体体检（重启风险）
// 插件读完了（lib/intake.js），这里补“整个软件”：版本、端口、数据、脏状态、重启风险。
// 只读；不碰 DSH 安装目录里的文件，只读元信息。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { dataDrive } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function jsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
const pad = (n) => String(n).padStart(2, '0')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** 端口有没有人在听（本机）。 */
function portOpen(port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (v) => { try { socket.destroy() } catch { /* 忽略 */ } resolve(v) }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

function diskFree() {
  try {
    const st = fs.statfsSync(dataDrive())
    return { freeGB: Math.round((st.bavail * st.bsize) / 1e9), totalGB: Math.round((st.blocks * st.bsize) / 1e9) }
  } catch { return null }
}

function lastBoots(limit = 5) {
  const rows = jsonl(path.join(DATA, 'events', `${today()}.jsonl`)).filter((r) => r.type === 'boot')
  return rows.slice(-limit)
}

/** 一次软件体检 + 重启风险评估。 */
export async function systemReport({ dshPort = 0 } = {}) {
  const pluginsDir = path.join(HOME, 'profiles', 'desktop', 'plugins')
  let plugins = []
  try { plugins = fs.readdirSync(pluginsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { /* 没有目录 */ }

  const registry = readJson(path.join(HOME, 'xiaoyu', 'registry', 'index.json'), { plugins: [] })
  const jobs = readJson(path.join(DATA, 'dispatch.json'), [])
  const openJobs = Array.isArray(jobs) ? jobs.filter((j) => j.status === 'dispatched' || j.status === 'redispatched') : []
  const incidents = readJson(path.join(DATA, 'incidents.json'), [])
  const openIncidents = (Array.isArray(incidents) ? incidents : []).filter((i) => i.status === 'open' || i.status === 'fixing')
  const native = readJson(path.join(DATA, 'native-session.json'), {})
  const boots = lastBoots()
  const disk = diskFree()
  const ports = { dsh: dshPort ? await portOpen(dshPort) : null, qqBridge: await portOpen(3100) }

  const risks = []
  if (openJobs.length) risks.push({ level: '中', text: `有 ${openJobs.length} 件派活没回话；重启会丢这些在途回合`, evidence: openJobs.slice(0, 3).map((j) => j.id) })
  if (openIncidents.length) risks.push({ level: '中', text: `有 ${openIncidents.length} 件事故没结；重启前先看一遍`, evidence: openIncidents.slice(0, 3).map((i) => i.id) })
  if (native.sessionId) {
    const at = Date.parse(native.at || '')
    if (Number.isFinite(at) && Date.now() - at > 24 * 3600 * 1000) risks.push({ level: '低', text: `总台会话记录是 ${Math.round((Date.now() - at) / 3600000)} 小时前的，可能已经失效`, evidence: native.sessionId })
  }
  const flagged = (registry.plugins || []).filter((p) => p.flags?.exec || p.flags?.network)
  if (flagged.length) risks.push({ level: '低', text: `${flagged.length} 个插件会联网或执行命令；升级/重启前知道一下`, evidence: flagged.map((p) => p.name).slice(0, 5) })
  if (disk && disk.freeGB < 5) risks.push({ level: '高', text: `D 盘只剩 ${disk.freeGB} GB，重启/写档可能失败`, evidence: disk })
  if (!boots.length) risks.push({ level: '低', text: '今天没有启动记录（可能是本次刚装/刚重启）', evidence: [] })

  const score = risks.some((r) => r.level === '高') ? '高' : risks.some((r) => r.level === '中') ? '中' : '低'

  return {
    ok: true,
    at: new Date().toISOString(),
    software: {
      dshHome: HOME,
      profile: path.join(HOME, 'profiles', 'desktop'),
      plugins: { count: plugins.length, names: plugins },
      node: process.version,
      platform: process.platform,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      ports,
      disk,
    },
    registry: { scannedAt: registry.scannedAt || '', plugins: (registry.plugins || []).length },
    state: { openJobs: openJobs.length, openIncidents: openIncidents.length, nativeSession: native.sessionId || '', bootsToday: boots.length },
    restart: { risk: score, items: risks },
  }
}

/** 启动时记一笔，重启次数/时间就有据可查。 */
export function recordBoot(note = '') {
  try {
    fs.mkdirSync(path.join(DATA, 'events'), { recursive: true })
    const line = { at: new Date().toISOString(), type: 'boot', pid: process.pid, node: process.version, note }
    fs.appendFileSync(path.join(DATA, 'events', `${today()}.jsonl`), JSON.stringify(line) + '\n')
  } catch { /* 记账失败不影响启动 */ }
}
