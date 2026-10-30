// 重启后的真机验收：叫醒三个人，各问一句，看她自己的回话。
// 跑法：ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/verify-roles-live.mjs [dayu|xiaoyu|dragon ...]
// 只做本地 HTTP，不碰 QQ/B站；结果同时写到 ~/.dsh/dayu/三人验收-latest.md。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const BASE = (() => {
  try {
    const saved = fs.readFileSync(path.join(HOME, 'dayu', 'base-url'), 'utf8').trim()
    return /^https?:\/\//.test(saved) ? saved : `http://${saved || '127.0.0.1:60912'}`
  } catch { return 'http://127.0.0.1:60912' }
})()
const TOKEN = (() => {
  try { return fs.readFileSync(path.join(HOME, 'dayu', 'api-token'), 'utf8').trim() } catch { return '' }
})()

const args = process.argv.slice(2).filter(Boolean)
const roles = args.length ? args : ['dayu', 'xiaoyu', 'dragon']
const PROBE = '在吗？用一句话说：你是谁、住在哪。'

async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}/api/dayu${pathname}`, {
    method,
    headers: { 'x-yushen-token': TOKEN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 非 JSON */ }
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status}: ${text.slice(0, 200)}`)
  return json
}

async function waitReply(sessionId, { timeoutMs = 90000 } = {}) {
  const started = Date.now()
  let last = ''
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 4000))
    try {
      const data = await api(`/transcript?id=${encodeURIComponent(sessionId)}&n=6`)
      const turns = Array.isArray(data?.turns) ? data.turns : []
      const answer = [...turns].reverse().find((t) => t.role === 'assistant' && String(t.text || '').trim())
      if (answer) {
        if (answer.text === last) continue
        last = answer.text
        return { ok: true, at: answer.at, text: answer.text, total: data.total }
      }
    } catch { /* 会话可能还没落盘，继续等 */ }
  }
  return { ok: false, timeoutMs }
}

const report = [`# 三人真机验收 · ${new Date().toLocaleString('zh-CN')}`, '']
let allOk = true

for (const role of roles) {
  const line = []
  try {
    const state = await api('/residence')
    let row = state?.roles?.[role]
    if (!row?.sessionId) {
      const woken = await api('/residence/wake', { method: 'POST', body: { role } })
      row = woken?.status || row
      line.push(`${role}：新建身体 ${woken?.sessionId || ''}`)
    } else {
      line.push(`${role}：已有身体 ${row.sessionId}（卡 ${row.personaChars} 字 / 记忆 ${row.memoryHabits}+${row.memoryDynamics} 条）`)
    }
    const said = await api('/residence/say', { method: 'POST', body: { role, text: PROBE } })
    line.push(`投递：${said?.via || '?'} → ${said?.sessionId || ''}`)
    const reply = await waitReply(said?.sessionId || row?.sessionId)
    if (reply.ok) {
      line.push(`回话：${String(reply.text).replace(/\s+/g, ' ').slice(0, 240)}`)
    } else {
      allOk = false
      line.push(`回话：${Math.round(reply.timeoutMs / 1000)} 秒内没等到`)
    }
    try {
      const after = await api('/residence')
      const rowNow = after?.roles?.[role] || {}
      line.push(`记忆：习惯 ${rowNow.memoryHabits || 0} 条 / 关系 ${rowNow.memoryDynamics || 0} 条 / 事件 ${rowNow.memoryEvents || 0} 条`)
    } catch { /* 状态读不到不影响验收结论 */ }
  } catch (error) {
    allOk = false
    line.push(`${role}：失败 ${String(error?.message || error).slice(0, 200)}`)
  }
  report.push(`## ${role}`, ...line.map((s) => `- ${s}`), '')
}

report.push(allOk ? '结论：三个都回了话。' : '结论：还有没回话的，别当成已经活了。')
const out = path.join(HOME, 'dayu', '三人验收-latest.md')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${report.join('\n')}\n`, 'utf8')
console.log(report.join('\n'))
console.log(`\nwritten: ${out}`)
if (!allOk) process.exitCode = 2
