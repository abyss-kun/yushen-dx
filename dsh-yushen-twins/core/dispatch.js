// core · 派活（宿主无关）
// 只认四个动作：列会话、建会话、发话、记账。DSH/CLI 各自实现。

import { readAll, writeAll, audit, newId, verifyEvidence } from './jobs.js'
import { recordExperience, queryExperience } from '../lib/task-experience.js'
import { recordFishState } from '../lib/state-adapter.js'
import { handbookBlock, handbookStamp } from '../lib/handbook.js'
import { handbookForEmployee } from '../lib/employee-profile.js'
import { recordHandbook, sync as syncEmployee } from '../lib/employee-record.js'
import { buildExperienceBrief } from '../lib/task-experience.js'
import { matterPreflight } from '../lib/fact-ledger.js'
import { recallCreativeMemory } from '../lib/creative-memory.js'
import { findTaskConflicts, classifyTaskOverlap } from '../lib/task-coordination.js'

export function composeBrief(id, brief, expect, role = 'dayu', { sessionId = '', book: preBook = '' } = {}) {
  const stamp = handbookStamp()
  // 定制手册：先看这个会话干过什么（派活单 + 事故单 + 本次简报），再发她这一本。
  // 不是全员同一本 worker 章——那样每个人都在读跟自己无关的规则。
  let book = String(preBook || '')
  try {
    if (!book && sessionId) book = String(handbookForEmployee({ sessionId, brief, expect }).text || '')
  } catch { book = book || '' }
  if (!book) book = handbookBlock('worker', { text: `${brief || ''}\n${expect || ''}`, target: { kind: 'task', id: String(id) }, task: String(id), maxChars: 2000 })
  return [
    `【派活 ${id}】`,
    book,
    stamp ? `（手册版本 sha ${stamp.sha}）` : '',
    recallCreativeMemory(`${brief || ''}\n${expect || ''}`),
    buildExperienceBrief(role, { text: `${brief || ''} ${expect || ''}` }),
    `任务：${brief}`,
    `验收标准：${expect || '给出结果 + 证据（文件路径 / 命令输出 / 链接），别只说“做完了”。'}`,
    '回话带「已读手册」+ 结果 + 证据；做完直接回，不用问我在不在。',
  ].filter(Boolean).filter((line, index, lines) => lines.indexOf(line) === index).join('\n')
}

/** 履历：干过几单、成几单、有没有前科；同时给验收松紧。 */
export function historyFor(sessionId, expect) {
  try {
    const mine = readAll().filter((j) => j.sessionId === sessionId)
    if (!mine.length) return { text: '', expect }
    const done = mine.filter((j) => j.status === 'done').length
    const failed = mine.filter((j) => j.status === 'aborted' || j.status === 'rejected').length
    if (failed > 0) {
      return {
        text: `【履历】干过 ${mine.length} 单，成 ${done}，没成 ${failed}；上次有没回话/被打回，这次先回话再动手。`,
        expect: `${expect || '给出结果 + 证据'}；另外必须附：改了哪个文件（路径:行号）、跑过什么命令（原样 + 结果）、你自己核对过什么。`,
      }
    }
    return {
      text: `【履历】干过 ${mine.length} 单，成 ${done}，没成 ${failed}；老员工，按上次的做。`,
      expect: `${expect || '给出结果 + 证据'}；可信的人，给结论 + 一处关键证据就够。`,
    }
  } catch { return { text: '', expect } }
}

function openSessions() {
  return new Set(readAll().filter((j) => j.status === 'dispatched' || j.status === 'redispatched').map((j) => j.sessionId))
}

/** 选一个空闲、不像总台、不是临时工号的会话。 */
export async function pickEmployee(host) {
  const sessions = await host.listSessions()
  const busy = openSessions()
  return (sessions || []).find((row) => row.running
    && !busy.has(row.id)
    && !/鱼神·总台|大鱼·总台/.test(row.title || '')
    && !String(row.id).startsWith('dayu-job-')) || null
}

/** 派一单：选人/开人 → 拼简报 → 投递 → 记账。 */
export async function dispatch(host, { brief, expect, target, reviewedId, role = 'dayu' } = {}) {
  const requested = { brief: String(brief || ''), expect: String(expect || '') }
  if (!requested.brief.trim()) throw new Error('brief 不能为空')
  const all = readAll()
  const reviewed = String(reviewedId || '')
  const taskToResume = reviewed ? all.find((row) => row.id === reviewed && row.status === 'ready') : null
  const queued = all.filter((row) => ['waiting', 'ready-for-review', 'ready'].includes(row.status) && row.id !== reviewed)
    .map((task) => ({ task, ...classifyTaskOverlap(requested, task) }))
    .find((row) => row.kind === 'duplicate')
  if (queued?.task.status === 'waiting') return { ok: true, waiting: true, ...queued.task }
  if (queued?.task.status === 'ready-for-review') return { ok: true, reviewRequired: true, reason: '前置单已结束，但等待实际证据复查；请用 dayu_review_waiting，不要另派一单', ...queued.task }
  const conflicts = findTaskConflicts(requested, all)
    .filter((row) => (row.task.role === role || !row.task.role) && ['dispatched', 'returned', 'waiting'].includes(row.task.status))
    // 2026-10-27：判定为 conflict 的（部分重叠）就该等，不再要求相似度 ≥0.82；
    // 0.82 只用来兜住"独立但很像"的边界情况。
    .filter((row) => row.kind === 'conflict' || row.sharedFile || row.similarity >= 0.82)
  const duplicate = conflicts.find((row) => row.kind === 'duplicate')
  if (duplicate) {
    audit({ kind: 'dispatch-deduped', existingId: duplicate.task.id, similarity: duplicate.similarity })
    return { ok: true, deduped: true, reason: '已有相同或高度相似任务在途；跳过重复派活并复用原任务', matchedBy: duplicate.similarity, ...duplicate.task }
  }
  const id = taskToResume?.id || queued?.task.id || newId()
  if (conflicts.length) {
    const waiting = {
      id, ...requested, role, requestedTarget: String(target || ''), sessionId: '', employee: '',
      status: 'waiting', attempts: 0, createdAt: new Date().toISOString(), result: '',
      dependsOn: conflicts.map((row) => row.task.id),
      coordination: '等待前任务结束；完成后必须人工/主管检查结果与证据，再决定继续或跳过',
    }
    const list = readAll(); list.unshift(waiting); writeAll(list)
    audit({ kind: 'dispatch-waiting', id, dependsOn: waiting.dependsOn })
    return { ok: true, waiting: true, ...waiting }
  }
  let sessionId = String(target || '').trim()
  let employee = ''
  let created = false
  if (!sessionId) {
    const pick = await pickEmployee(host)
    if (pick) {
      sessionId = pick.id
      employee = pick.title
    } else {
      const made = await host.createSession({ cwd: host.cwd })
      if (!made?.id) throw new Error('宿主开不出会话')
      sessionId = made.id
      employee = '新开的助手会话'
      created = true
    }
  } else {
    const sessions = await Promise.resolve(host.listSessions()).catch(() => [])
    employee = (sessions || []).find((row) => row.id === sessionId)?.title || sessionId.slice(0, 8)
  }

  const hist = historyFor(sessionId, expect)
  const conflictText = conflicts.length ? [
    '【并发协调：已有相关任务，先等待并核对，不要并行改同一目标】',
    ...conflicts.map(({ task, similarity, sharedFile }) => `- 在途单 ${task.id}（${task.status}，相似度 ${similarity}${sharedFile ? `，共享文件 ${sharedFile}` : ''}）：${task.brief}`),
    '当前单属于部分重叠：先不要进入冲突文件/资源；等待相关在途单返回。返回后先读其结果和证据，独立检查与本单的重合范围。确认已完成同一项且证据达标，则标注复用并跳过本单重叠部分；若仅部分完成，继续未覆盖部分；若不冲突，说明核查依据后继续。不能只凭口头“已完成”跳过，交付文件/测试/链接等证据。',
  ].join('\n') : ''
  const prior = historyFor(sessionId, requested.expect)
  const historical = all.map((task) => ({ task, ...classifyTaskOverlap(requested, task) }))
    .filter((row) => ['done', 'returned', 'aborted', 'rejected'].includes(row.task.status) && row.kind !== 'independent')
    .sort((a, b) => b.similarity - a.similarity).slice(0, 3)
  const factCheck = matterPreflight({ query: `${requested.brief} ${requested.expect}` })
  const experienceHit = queryExperience(role, { text: requested.brief }).items.length > 0
  const historyCheck = historical.length
    ? `【任务前复核】发现 ${historical.length} 条相似历史：${historical.map(({ task, similarity }) => `${task.id}/${task.status}/${similarity}：${String(task.brief).slice(0, 120)}`).join('；')}。先读结果、证据和停留步骤，再决定复用、补做或重开。`
    : '【任务前复核】未命中相似历史任务；这不是“从未做过”的证明，仍需核对台账、经验和现有文件证据。'
  let bookMeta = null
  try { bookMeta = handbookForEmployee({ sessionId, brief, expect: hist.expect }) } catch { bookMeta = null }
  const text = [composeBrief(id, brief, hist.expect, role, { sessionId, book: bookMeta?.text || '' }), conflictText, hist.text, historyCheck, `【统一事实预检】${factCheck.completeness}；${factCheck.warning}`].filter(Boolean).join('\n')
  try { recordFishState(role, { expression: '工作', lastReason: id }) } catch { /* 状态记录不阻断派活 */ }
  await host.send(sessionId, text)

  const task = {
    id,
    role,
    reusedWaiting: Boolean(queued || taskToResume),
    sessionId,
    employee,
    brief: String(brief || ''),
    expect: String(hist.expect || ''),
    created,
    attempts: Number(taskToResume?.attempts || 0) + 1,
    status: 'dispatched',
    result: '',
    createdAt: new Date().toISOString(),
    returnedAt: '',
    handbook: handbookStamp(),
    handbookMeta: bookMeta ? { chapters: bookMeta.chapters, tools: bookMeta.tools, chars: bookMeta.chars, expiresAt: bookMeta.expiresAt } : null,
    experienceHit,
    overlapWith: conflicts.filter((row) => row.kind === 'conflict').map((row) => ({ id: row.task.id, similarity: row.similarity, sharedFile: row.sharedFile || '' })),
  }
  const list = readAll()
  if (taskToResume) {
    const index = list.findIndex((row) => row.id === taskToResume.id)
    if (index >= 0) list[index] = { ...list[index], ...task, review: taskToResume.review, dependsOn: taskToResume.dependsOn }
    else list.unshift(task)
  } else {
    list.unshift(task)
  }
  writeAll(list)
  // 员工档案：这一单、这本书归到她名下。越派越认识她，下次手册才发得准。
  try {
    syncEmployee(sessionId)
    if (bookMeta) recordHandbook(sessionId, { ...bookMeta, jobId: id })
  } catch { /* 档案写不下不影响派活 */ }
  audit({ kind: 'dispatch', id, sessionId, employee, created, chars: text.length })
  return { ok: true, ...task }
}

/** 收工：pass 收，reject 打回并重投。 */
export async function reviewWaitingTask({ id, action, evidence, note } = {}) {
  const list = readAll()
  const task = list.find((item) => item.id === String(id || ''))
  if (!task) throw new Error(`没有这单：${id}`)
  if (task.status !== 'waiting' && task.status !== 'ready-for-review') throw new Error('只有 waiting / ready-for-review 才能复查')
  const proof = String(evidence || '').trim()
  if (!proof) throw new Error('复查必须提供实际证据（文件、测试、哈希、链接或检查输出）')
  const choice = String(action || '')
  if (!['skip', 'continue', 'start'].includes(choice)) throw new Error('action 只能是 skip / continue / start')
  task.review = { action: choice, evidence: proof.slice(0, 2000), note: String(note || '').slice(0, 1000), at: new Date().toISOString() }
  task.status = choice === 'skip' ? 'skipped' : choice === 'continue' ? 'ready' : 'ready-for-review'
  task.result = choice === 'skip' ? `复用前置任务并跳过：${proof.slice(0, 1000)}` : ''
  writeAll(list)
  audit({ kind: 'waiting-review', id: task.id, action: choice, evidenceChars: proof.length })
  return { ok: true, task }
}

export async function verifyTaskEvidence(id, args = {}) {
  const list = readAll()
  const task = list.find((item) => item.id === String(id || ''))
  if (!task || !['dispatched', 'returned', 'redispatched'].includes(task.status)) throw new Error('没有可取证的活动任务')
  const result = await verifyEvidence(args)
  const verified = Boolean(result.ok && (result.syntax ? result.syntax.ok : true))
  const receipt = { ...result, kind: args.kind, ok: verified, verified, attempt: Number(task.attempts || 1), verifiedAt: new Date().toISOString(), scope: '仅证明指定证据可读取/检查，不证明整个任务完成' }
  task.evidence = Array.isArray(task.evidence) ? task.evidence : []
  task.evidence.push(receipt)
  task.lastEvidence = receipt
  writeAll(list)
  return { ok: true, verified, receipt, syntax: result.syntax }
}

// 前置单结束 → 通知所有等它的单去核对（幂等：只标 reviewNotifiedAt，不重复发同一批）
async function notifyWaiting(host, task) {
  const waiting = readAll().filter((row) => row.status === 'waiting' && Array.isArray(row.dependsOn) && row.dependsOn.includes(task.id))
  if (!waiting.length) return waiting
  await host.send(task.sessionId, `【在途重叠任务等待审查】前置单 ${task.id} 已结束。请回到等待单：${waiting.map((row) => row.id).join('、')}。先实际检查本单交付文件/测试/链接与等待单目标，判断冲突是否解决、是否已完成相同项目或仅部分覆盖。不要只看状态或口头结论；写出检查项和证据。完全重复且证据符合等待单验收标准则标记 skipped 并说明证据；部分完成只继续剩余范围；仍冲突继续等待；不冲突则说明理由后开始。`)
  const current = readAll()
  for (const row of current) {
    if (!waiting.some((w) => w.id === row.id)) continue
    row.reviewNotifiedAt = new Date().toISOString()
    // 前置单结束了：等待单进"待审查"（人/管家先核对证据，再决定 skipped / 继续）
    if (row.status === 'waiting') row.status = 'ready-for-review'
  }
  writeAll(current)
  return waiting
}

export async function verdict(host, { id, verdict: v, note } = {}) {
  const list = readAll()
  const task = list.find((item) => item.id === id)
  if (!task) throw new Error(`没有这单：${id}`)
  if (!['pass', 'reject'].includes(v)) throw new Error('verdict 只能是 pass / reject')
  // 2026-10-27：already done 的单再审一次，不重复记录，但**仍要通知等待单**——
  // 否则"前置单早就 done 了"时，等待单永远收不到"去核对"的消息。
  if (['done', 'aborted'].includes(task.status)) {
    if (v === 'pass') await notifyWaiting(host, task)
    return { ok: true, unchanged: true, task }
  }
  const text = String(note || '')
  if (v === 'pass') {
    const evidence = Array.isArray(task.evidence) ? task.evidence : []
    const currentAttempt = Number(task.attempts || 1)
    const valid = evidence.some((row) => Number(row.attempt) === currentAttempt && row.ok === true && (!row.syntax || row.syntax.ok === true))
    if (!valid) throw new Error('先给此单绑定实际取证结果，再 pass')
  }
  task.status = v === 'pass' ? 'done' : 'rejected'
  task.verdict = v
  task.note = text.slice(0, 1000)
  task.closedAt = new Date().toISOString()
  writeAll(list)
  audit({ kind: 'verdict', id, verdict: v, note: text.slice(0, 200) })
  if (v === 'pass') {
    await notifyWaiting(host, task)
  }
  if (v === 'pass') {
    const remaining = readAll().some((row) => row.id !== task.id && row.role === (task.role || 'dayu') && ['dispatched', 'returned', 'redispatched'].includes(row.status))
    try { recordFishState(task.role || 'dayu', { expression: remaining ? '工作' : '完成', lastReason: task.id }) } catch { /* 状态记录不阻断验收 */ }
    try { recordExperience(task.role || 'dayu', { taskId: `${task.id}:pass`, brief: task.brief, outcome: 'success', reason: text, evidence: JSON.stringify(task.lastEvidence || {}), verified: true }) } catch { /* 经验记录不阻断验收 */ }
  }
  if (v === 'reject') {
    const attempts = Number(task.attempts || 1)
    try { recordExperience(task.role || 'dayu', { taskId: `${task.id}:attempt-${attempts}`, brief: task.brief, outcome: 'failed', reason: text, evidence: JSON.stringify(task.lastEvidence || {}), verified: false }) } catch { /* 经验记录不阻断打回 */ }
    if (attempts >= 3) {
      task.status = 'aborted'
      task.maxAttempts = 3
      task.stopReason = '重试上限 3 次'
      writeAll(list)
      try { recordFishState(task.role || 'dayu', { expression: '完成', lastReason: task.id }) } catch { /* noop */ }
      return { ok: true, task }
    }
    try {
      await host.send(task.sessionId, [
        `【打回 ${id}】`,
        `哪对不上：${text || '（没写）'}`,
        `原任务：${task.brief}`,
        '补完再回话；不用问我在不在。',
      ].join('\n'))
      task.attempts = Number(task.attempts || 1) + 1
      task.status = 'redispatched'
      writeAll(list)
    } catch { /* 打回投不出去，至少单子记下了 */ }
  }
  return { ok: true, task }
}
