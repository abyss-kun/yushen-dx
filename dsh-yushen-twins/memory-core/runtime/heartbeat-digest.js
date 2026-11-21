/* 标签
 * id: memory-core-heartbeat-digest
 * kind: module
 * summary: 把心跳、新卡、待办、未读、B站/内部群/自己想做的事合成事实清单；纯函数，不替她判断。
 * tags: 心跳, 简报, 摘要, 接口, 纯函数, 事实
 * created: 2026-11-13 21:05:00
 * changed: 2026-11-14 19:19:48
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：心跳留口子；2026-11-13 审阅：只给事实，不替她判断）
 * audience: 其他窗口、未来 dsh-memory、面板
 * owner: 框架；只汇总事实，不判断重大语义
 * mutable: 可改；**不许再输出 decision/建议**；输出必须带 refs，能回跳
 * usage: digestHeartbeats({role,heartbeats,cards,tasks,unread,biliMentions,internalGroupMentions,selfWants,lastSpokeAt,now}) → {facts,refs}
 * why: 心跳只存不判，其他窗口需要统一“发生了什么”的口径，但不能替她决定要不要看/回
 * result: 事实清单 + 出处；不写记忆、不循环、不输出提醒/沉默
 */

const atOf = (x) => String(x?.at || x?.startedAt || '')
const hhmm = (ms) => {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

export function digestHeartbeats({
  role = '',
  since = '',
  heartbeats = [],
  cards = [],
  tasks = [],
  unread = 0,
  biliMentions = [],
  internalGroupMentions = [],
  selfWants = [],
  lastSpokeAt = '',
  now = new Date().toISOString(),
} = {}) {
  const hbs = (heartbeats || []).filter((r) => !since || atOf(r) >= since)
  const newCards = (cards || []).filter((r) => !since || atOf(r) >= since)
  const openTasks = (tasks || []).filter((r) => String(r?.status || 'open') === 'open')
  const dueTasks = openTasks.filter((r) => String(r?.due || '').trim())
  const errors = hbs.filter((r) => r?.landed === false || /失败|报错|异常|缺口|对不上|超时|断了/.test(String(r?.did || '')))
  const waiting = hbs.filter((r) => Number(r?.unanswered) > 0)

  const facts = []
  // 绝对时间 / 距上次说话：只报事实，不说“该不该回”。
  const nowMs = Date.parse(now)
  facts.push(Number.isFinite(nowMs) ? `现在 ${hhmm(nowMs)}` : '现在（时间未知）')
  const lastMs = Date.parse(String(lastSpokeAt || ''))
  if (Number.isFinite(lastMs) && Number.isFinite(nowMs)) {
    const mins = Math.max(0, Math.round((nowMs - lastMs) / 60000))
    facts.push(`距上次说话 ${mins < 60 ? `${mins} 分钟` : `${Math.floor(mins / 60)} 小时 ${mins % 60} 分钟`}`)
  }
  if (hbs.length) facts.push(`心跳 ${hbs.length} 跳`)
  if (errors.length) facts.push(`出事 ${errors.length} 次`)
  if (waiting.length) facts.push(`有人等 ${waiting.length} 次`)
  if (newCards.length) facts.push(`新卡 ${newCards.length} 张`)
  if (dueTasks.length) facts.push(`待办有期限 ${dueTasks.length} 条`)
  if (Number(unread) > 0) facts.push(`未读 ${Number(unread)} 条`)
  if ((biliMentions || []).length) facts.push(`B站有人找 ${biliMentions.length} 条`)
  if ((internalGroupMentions || []).length) facts.push(`内部群有人找 ${internalGroupMentions.length} 条`)
  if ((selfWants || []).filter(Boolean).length) facts.push(`她自己想做 ${selfWants.filter(Boolean).length} 件`)
  if (facts.length === 1) facts.push('没有新变化')

  const refs = [
    ...hbs.slice(-3).map((r) => r.beatId || atOf(r)).filter(Boolean),
    ...newCards.slice(-3).map((r) => r.turnId || r.id || '').filter(Boolean),
    ...dueTasks.slice(-3).map((r) => r.id || r.turnId || '').filter(Boolean),
    ...(biliMentions || []).slice(-2).map((r) => r?.key || r?.id || '').filter(Boolean),
    ...(internalGroupMentions || []).slice(-2).map((r) => r?.id || r?.turnId || '').filter(Boolean),
  ].slice(0, 10)

  return {
    at: now,
    role: String(role || ''),
    kind: 'digest',
    facts,
    // 只给问句，不给判断；要不要看、要不要回，由她自己定。
    question: '要不要回？你定。',
    refs,
    counts: {
      heartbeats: hbs.length,
      errors: errors.length,
      waiting: waiting.length,
      cards: newCards.length,
      tasksDue: dueTasks.length,
      unread: Number(unread) || 0,
      biliMentions: (biliMentions || []).length,
      internalGroupMentions: (internalGroupMentions || []).length,
      selfWants: (selfWants || []).filter(Boolean).length,
    },
  }
}
