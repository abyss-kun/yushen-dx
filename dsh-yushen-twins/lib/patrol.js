// 鱼神 · 值班巡检
// 没人叫也要看：启动后跑一遍，发现异常就自己建事故单、记账。
// 不弹窗、不问老板；处理不了就留单子。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { systemReport } from './system.js'
import { noteIncident } from './incidents.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const pad = (n) => String(n).padStart(2, '0')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function appendEvent(row) {
  try {
    fs.mkdirSync(path.join(DATA, 'events'), { recursive: true })
    fs.appendFileSync(path.join(DATA, 'events', `${today()}.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...row }) + '\n')
  } catch { /* 记账失败不影响巡检 */ }
}

/** 启动巡检：只做“能确定”的判断，不猜。 */
export async function patrolOnce() {
  const findings = []
  try {
    const sys = await systemReport()
    if (sys.restart?.risk === '高') {
      findings.push({ level: '高', title: '重启风险高', text: (sys.restart.items || []).map((i) => i.text).join('；') })
    }
    const jobs = readJson(path.join(DATA, 'dispatch.json'), [])
    const stale = (Array.isArray(jobs) ? jobs : []).filter((j) => {
      if (j.status !== 'dispatched' && j.status !== 'redispatched') return false
      const at = Date.parse(j.createdAt || '')
      return Number.isFinite(at) && Date.now() - at > 10 * 60 * 1000
    })
    if (stale.length) {
      findings.push({ level: '中', title: '派活超时没回话', text: stale.slice(0, 5).map((j) => `${j.id}（${j.employee || j.sessionId}）`).join('；') })
    }
    const reg = readJson(path.join(HOME, 'xiaoyu', 'registry', 'index.json'), { plugins: [] })
    const flagged = (reg.plugins || []).filter((p) => (p.behavior?.suspicious || []).length)
    if (flagged.length) {
      findings.push({ level: '低', title: '插件行为值得看一眼', text: flagged.map((p) => `${p.name}（${p.behavior.suspicious.join('、')}）`).join('；') })
    }
    // 未结事故超过 24 小时：只提醒，不再开新单（免得重复）。
    const incidents = readJson(path.join(DATA, 'incidents.json'), [])
    const staleInc = (Array.isArray(incidents) ? incidents : []).filter((i) => {
      if (i.status !== 'open' && i.status !== 'fixing') return false
      const at = Date.parse(i.lastAt || i.at || '')
      return Number.isFinite(at) && Date.now() - at > 24 * 3600 * 1000
    })
    if (staleInc.length) {
      findings.push({ level: '中', title: '事故超时未结', text: staleInc.slice(0, 5).map((i) => `${i.id}（${i.title}）`).join('；'), notifyOnly: true })
    }
  } catch (e) {
    findings.push({ level: '低', title: '巡检自身出错', text: String(e?.message || e) })
  }

  // 发现问题就自己建单，不等人叫；只提醒的不重复建单。
  for (const f of findings) {
    if (f.notifyOnly) continue
    try {
      noteIncident({ sessionId: 'patrol', title: f.title, text: f.text, source: 'self-check' })
    } catch { /* 单子建不了也继续 */ }
  }
  appendEvent({
    type: 'patrol',
    title: findings.length ? `值班巡检：${findings.length} 项` : '值班巡检：没事',
    text: findings.map((f) => `[${f.level}] ${f.title}`).join('；'),
  })
  // 没事就不建单、不刷存在感；报告只在有发现时生成（人版报告是另外按需要的）。
  return { ok: true, at: new Date().toISOString(), findings }
}

/** 最近一条交接（启动时先看上一班）。 */
export function latestHandoff() {
  const dir = path.join(DATA, 'handoff')
  try {
    const file = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort().pop()
    if (!file) return null
    return { file: path.join(dir, file), text: fs.readFileSync(path.join(dir, file), 'utf8') }
  } catch { return null }
}
