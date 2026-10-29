// 疲劳：有这个东西，但累不累看她们自己。
//
// 数值只算"事实"（今天花了多少、机器多忙），不替她下结论。
// 她觉得不累，可以覆盖；覆盖有时间，到点回到事实。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir, bodySnapshot } from './runtime.js'
import { qqBridgeState } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

function file(role) { return path.join(runtimeDir(role), 'fatigue.json') }
function read(role) { try { return JSON.parse(fs.readFileSync(file(role), 'utf8')) } catch { return { override: null, log: [] } } }
function write(role, doc) {
  fs.mkdirSync(path.dirname(file(role)), { recursive: true })
  fs.writeFileSync(file(role), `${JSON.stringify(doc, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return doc
}

function spendTodayYuan(now) {
  try {
    const ledger = path.join(HOME, 'dayu', 'state', 'token-usage.jsonl')
    const alt = path.join(qqBridgeState(), 'token-usage.jsonl')
    const p = fs.existsSync(ledger) ? ledger : alt
    const day = new Date(now).toISOString().slice(0, 10)
    let sum = 0
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const r = JSON.parse(line)
        if (!String(r.at || r.ts || '').startsWith(day)) continue
        const hit = Number(r.hit || 0), miss = Number(r.miss || 0), out = Number(r.out || 0)
        sum += (hit * 0.02 + miss * 1 + out * 4) / 1e6
      } catch { /* 坏行 */ }
    }
    return Math.round(sum * 10000) / 10000
  } catch { return 0 }
}

/** 事实分：0=轻松，100=很累。 */
export function fatigueOf(role, { now = Date.now() } = {}) {
  const doc = read(role)
  const ov = doc.override
  if (ov && Number(ov.until) > now) return { value: Number(ov.value), overridden: true, why: String(ov.why || ''), parts: [], overriddenUntil: Number(ov.until) }
  const spend = spendTodayYuan(now)
  let body = {}
  try { body = bodySnapshot({ now }) } catch { /* 读不到机器 */ }
  const memFree = Number(body.memFreeRatio) || 0
  const load = Number(body.load1) || 0
  const cpus = Number(body.cpus) || 1
  const spendScore = Math.min(60, spend * 12) // 花得越多越"费神"
  const memScore = memFree < 0.1 ? 25 : memFree < 0.2 ? 12 : 0
  const loadScore = Math.min(15, (load / cpus) * 15)
  const value = Math.round(Math.min(100, spendScore + memScore + loadScore))
  return { value, overridden: false, why: '', parts: [`今天云端花了 ${spend} 元`, `空闲内存 ${Math.round(memFree * 100)}%`, `负载 ${Number.isFinite(load) ? load : '读不到'}`] }
}

/** 她自己改："我不累" / "我确实累了"。 */
export function setFatigue(role, { value = 0, why = '', minutes = 120, now = Date.now() } = {}) {
  const doc = read(role)
  doc.override = { value: Math.max(0, Math.min(100, Number(value))), why: String(why || '').slice(0, 80), until: now + Math.max(1, Number(minutes) || 120) * 60000 }
  doc.log = [...(doc.log || []), { at: new Date(now).toISOString(), value: doc.override.value, why: doc.override.why }].slice(-30)
  return write(role, doc)
}

/** 注入：事实 + 她的判断权。 */
export function fatigueLine(role, { now = Date.now() } = {}) {
  const f = fatigueOf(role, { now })
  const who = f.overridden ? `你自己说：${f.value <= 40 ? '不累' : f.value >= 70 ? '累了' : '还行'}${f.why ? `（${f.why}）` : ''}` : `按事实算：${f.value >= 70 ? '有点累' : f.value >= 40 ? '一般' : '还好'}（${f.parts.join('；')}）`
  return `## 你的力气\n${who}。\n累不累你说了算：想歇就歇、想说就说，也可以改（yushen_self fatigue set）。`
}
