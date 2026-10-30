// 鱼神事实问答：只读本地账本，不调用模型、不补猜测。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const ROLES = new Set(['dayu', 'xiaoyu'])
const ROLE_NAME = { dayu: '大鱼', xiaoyu: '小鱼' }

function roleOf(role) {
  const r = String(role || 'dayu')
  if (!ROLES.has(r)) throw new Error(`未知角色：${r}`)
  return r
}
function readJson(file, fallback) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v } catch { return fallback }
}
function readJsonl(file, limit = 100) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit).flatMap((line) => {
      try { return [JSON.parse(line)] } catch { return [] }
    })
  } catch { return [] }
}
function roleOfTask(task) { return task.role || 'dayu' }
function timeOf(row) { return row.returnedAt || row.completedAt || row.updatedAt || row.createdAt || row.at || '' }
function statusText(status) {
  return ({ dispatched: '已派出，等待回话', redispatched: '已重新派出，等待回话', returned: '已收到回话，尚未完成证据验收', done: '已完成并通过证据验收', aborted: '已终止', rejected: '被打回' })[status] || `状态为 ${status || '未知'}`
}

export function facts(role = 'dayu', { limit = 8 } = {}) {
  const r = roleOf(role)
  const tasks = readJson(path.join(DATA, 'dispatch.json'), []).filter((task) => roleOfTask(task) === r)
  const audits = readJsonl(path.join(DATA, 'audit.jsonl'), 300).filter((row) => !row.role || row.role === r || tasks.some((task) => task.id === row.id))
  const actions = readJsonl(path.join(DATA, 'actions.jsonl'), 200)
  const recentTasks = tasks.slice(-Math.max(1, Math.min(20, Number(limit) || 8))).reverse().map((task) => ({
    id: task.id,
    brief: String(task.brief || '').slice(0, 240),
    status: task.status || 'unknown',
    statusText: statusText(task.status),
    attempts: Number(task.attempts || 1),
    replyCount: Number(task.replyCount || 0),
    evidenceCount: Array.isArray(task.evidence) ? task.evidence.length : 0,
    lastAt: timeOf(task),
    result: task.result ? String(task.result).slice(0, 400) : '',
  }))
  const recentAudit = audits.slice(-Math.max(1, Math.min(30, Number(limit) * 3 || 24))).reverse().map((row) => ({ at: row.at || '', kind: row.kind || '', id: row.id || '', sessionId: row.sessionId || '', ok: row.ok, evidence: row.evidence || '' }))
  const recentActions = actions.slice(0, Math.max(1, Math.min(20, Number(limit) || 8))).map((row) => ({ at: row.at || '', kind: row.kind || '', path: row.path || '', method: row.method || '', ok: row.ok !== false, status: row.status || 0, note: row.note || '' }))
  return { ok: true, role: r, roleName: ROLE_NAME[r], source: ['dispatch.json', 'audit.jsonl', 'actions.jsonl'], taskCount: tasks.length, recentTasks, recentAudit, recentActions, modelCalled: false, note: '只依据本地事实账本；没有记录就不推测。' }
}

export function answerFacts(role = 'dayu', question = '') {
  const r = roleOf(role)
  const q = String(question || '').trim()
  const snapshot = facts(r)
  const task = snapshot.recentTasks[0]
  const name = snapshot.roleName
  if (!snapshot.taskCount && !snapshot.recentActions.length && !snapshot.recentAudit.length) {
    return { ok: true, role: r, answer: `我查不到${name}最近的执行记录，不能确定刚才做了什么。`, certainty: 'unknown', facts: snapshot, question: q }
  }
  const lines = [`我是${name}。以下只按本地记录回答${q ? `“${q.slice(0, 120)}”` : '最近做了什么'}：`]
  if (task) lines.push(`最近一单 ${task.id}：${task.brief}；${task.statusText}；尝试 ${task.attempts} 次，回话 ${task.replyCount} 次，证据 ${task.evidenceCount} 条。`)
  else lines.push('没有查到最近任务记录。')
  if (snapshot.recentAudit.length) {
    const a = snapshot.recentAudit[0]
    lines.push(`最近账本动作：${a.kind || '未标注'}${a.id ? `（${a.id}）` : ''}，时间 ${a.at || '未知'}。`)
  } else lines.push('没有查到最近的审计动作。')
  lines.push('记录不足的部分我不知道，不用猜测补全。')
  return { ok: true, role: r, answer: lines.join('\n'), certainty: 'recorded', facts: snapshot, question: q }
}
