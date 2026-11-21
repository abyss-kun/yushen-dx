/* 标签
 * id: lib-task-coordination
 * kind: module
 * summary: 2026-11-04 修（老板：「写了不代表在用」这次查出来的真堵点）：
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: normalizeTaskText / taskSimilarity / classifyTaskOverlap / activeTasks（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// Detect duplicate/conflicting in-flight work before dispatch; lexical and conservative.
//
// 2026-11-04 修（老板：「写了不代表在用」这次查出来的真堵点）：
//   ① `returned` 原来也算在途——她早回话了、只等验收的单子把新活永远挡成 waiting
//      （10-31 的单子堵到 11-04，dispatch.json 里积了一排 waiting，手册一条没发出去）；
//   ② 派活公共前缀「【调用者】…」每单都一样，判相似时把它也算进去，任何新活都像旧活。
//   现在：在途只认「还没回话」的 dispatched/redispatched；超过一天没动静的僵尸单自动不算在途。
export const ACTIVE_TASK_STATUSES = new Set(['dispatched', 'redispatched'])
/** 派出去超过这么久还没回话（按 dueAt 起算，没有就按 dispatchedAt/createdAt），就不再算在途。 */
export const STALE_TASK_MS = 24 * 3600 * 1000

const STOP = new Set(['以及','然后','进行','完成','实现','一下','一个','相关','任务','工作','修改','优化','处理','看看','检查','验证','要求','使用','基于','当前','已有','提供','里面','项目','功能','模块','系统','在途'])
const FILE_RE = /(?:[A-Za-z]:[\\/][^\s"'`<>|?*]+|(?:[\w.-]+[\\/])+[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|yml|yaml|css|html|py|rs|go|toml|txt))/gi

export function normalizeTaskText(text = '') {
  return String(text || '')
    // 派活公共前缀每单逐字一样，是噪声不是任务内容；不去掉它，任何两单都像。
    .replace(/【调用者】[^\n]*/g, ' ')
    .toLowerCase().replace(FILE_RE, (file) => ` ${file.replace(/\\/g, '/')} `)
    .replace(/[^\p{L}\p{N}._/-]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(text) {
  const normalized = normalizeTaskText(text)
  const out = new Set(normalized.split(' ').filter((part) => part.length > 1 && !STOP.has(part)))
  for (const chunk of normalized.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    const value = chunk[0]
    for (let i = 0; i < value.length - 1; i += 1) {
      const bigram = value.slice(i, i + 2)
      if (!STOP.has(bigram)) out.add(bigram)
    }
  }
  return out
}

export function taskSimilarity(left, right) {
  const a = tokens(`${left?.brief || ''} ${left?.expect || ''}`)
  const b = tokens(`${right?.brief || ''} ${right?.expect || ''}`)
  if (!a.size || !b.size) return 0
  let common = 0
  for (const value of a) if (b.has(value)) common += 1
  return common / (a.size + b.size - common)
}

export function classifyTaskOverlap(candidate, existing, { duplicateThreshold = 0.82, overlapThreshold = 0.28 } = {}) {
  const briefA = normalizeTaskText(candidate?.brief || '')
  const briefB = normalizeTaskText(existing?.brief || '')
  const similarity = taskSimilarity(candidate, existing)
  if (briefA && briefA === briefB && normalizeTaskText(candidate?.expect) === normalizeTaskText(existing?.expect)) return { kind: 'duplicate', similarity: 1 }
  // Similar wording is a review candidate, never sufficient to discard new requirements.
  if (similarity >= duplicateThreshold) return { kind: 'conflict', similarity: Number(similarity.toFixed(3)) }
  if (similarity >= overlapThreshold) return { kind: 'conflict', similarity: Number(similarity.toFixed(3)) }
  const filesA = new Set(`${candidate?.brief || ''} ${candidate?.expect || ''}`.match(FILE_RE) || [])
  const filesB = new Set(`${existing?.brief || ''} ${existing?.expect || ''}`.match(FILE_RE) || [])
  for (const file of filesA) if (filesB.has(file)) return { kind: 'conflict', similarity: Number(similarity.toFixed(3)), sharedFile: file }
  return { kind: 'independent', similarity: Number(similarity.toFixed(3)) }
}

export function activeTasks(tasks = [], { now = Date.now(), staleMs = STALE_TASK_MS } = {}) {
  return tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task?.status) && !isStaleTask(task, { now, staleMs }))
}

/** 单子上最接近"这事还在进行"的那个时间：还没回话看 dueAt，已回话看 returnedAt。 */
function lastActiveAt(task) {
  const keys = task?.status === 'returned' ? ['returnedAt', 'dueAt', 'createdAt'] : ['dueAt', 'dispatchedAt', 'createdAt']
  for (const key of keys) {
    const ms = Date.parse(task?.[key] || '')
    if (Number.isFinite(ms)) return ms
  }
  return null
}

/** 僵尸单判定：有明确时间且超过 staleMs 才算；没有时间戳的单子不敢判死（宁可多问一句）。 */
export function isStaleTask(task, { now = Date.now(), staleMs = STALE_TASK_MS } = {}) {
  const at = lastActiveAt(task)
  return Number.isFinite(at) && now - at > staleMs
}

export function findTaskConflicts(candidate, tasks = [], { now = Date.now(), staleMs = STALE_TASK_MS } = {}) {
  const rows = activeTasks(tasks, { now, staleMs })
    .map((task) => ({ task, ...classifyTaskOverlap(candidate, task) }))
  // 已回话待验收的单子不再占在途位（工作已经做完，不该堵新活）；
  // 但完全相同的一单仍要判重，避免同一件事再派一遍——只认 24 小时内、且只认 duplicate。
  for (const task of tasks) {
    if (task?.status !== 'returned' || isStaleTask(task, { now, staleMs })) continue
    const row = classifyTaskOverlap(candidate, task)
    if (row.kind === 'duplicate') rows.push({ task, ...row })
  }
  return rows
    .filter((row) => row.kind !== 'independent')
    .sort((a, b) => (a.kind === 'duplicate' ? -1 : 0) - (b.kind === 'duplicate' ? -1 : 0) || b.similarity - a.similarity)
}
