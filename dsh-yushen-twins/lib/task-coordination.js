// Detect duplicate/conflicting in-flight work before dispatch; lexical and conservative.
export const ACTIVE_TASK_STATUSES = new Set(['dispatched', 'redispatched', 'returned'])

const STOP = new Set(['以及','然后','进行','完成','实现','一下','一个','相关','任务','工作','修改','优化','处理','看看','检查','验证','要求','使用','基于','当前','已有','提供','里面','项目','功能','模块','系统','在途'])
const FILE_RE = /(?:[A-Za-z]:[\\/][^\s"'`<>|?*]+|(?:[\w.-]+[\\/])+[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|yml|yaml|css|html|py|rs|go|toml|txt))/gi

export function normalizeTaskText(text = '') {
  return String(text || '').toLowerCase().replace(FILE_RE, (file) => ` ${file.replace(/\\/g, '/')} `)
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

export function activeTasks(tasks = []) {
  return tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task?.status))
}

export function findTaskConflicts(candidate, tasks = []) {
  return activeTasks(tasks).map((task) => ({ task, ...classifyTaskOverlap(candidate, task) }))
    .filter((row) => row.kind !== 'independent')
    .sort((a, b) => (a.kind === 'duplicate' ? -1 : 0) - (b.kind === 'duplicate' ? -1 : 0) || b.similarity - a.similarity)
}
