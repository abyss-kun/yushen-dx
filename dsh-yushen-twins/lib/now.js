// 「现在在发生什么」的快照：正在跑 / 刚做完 / 没做 / 出错 / 重复。
// 只做归类和裁剪，不读盘、不发请求；数据由入口传进来，便于离线测。
const STATUS_ERROR = /error|fail|retry|blocked/i
const TEXT_ERROR = /❌|失败|出错|异常/
const ACTIVE_STATUS = (s) => Boolean(s) && s !== 'turn/end'
const baseName = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || ''
const ROLE_NAME = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }

/** 没标题的会话也要能认人：先看派活，再看工作区 + 谁在跑。 */
export function titleOf(row, role = '') {
  const t = String(row.title || '')
  if (t && !/^session-/i.test(t)) return t
  if (row.jobBrief) return `派活：${brief(row.jobBrief, 36)}`
  const cwd = baseName(row.cwd)
  const who = ROLE_NAME[role] || row.employee || row.source || '会话'
  return `${cwd || '工作区'} · ${who}`
}

function provenanceOf(row) {
  if (row.jobId) return `派活：${row.employee || '员工'}（${String(row.jobId).slice(-6)}）`
  if (row.parentId) return `子代理 ← ${row.parentTitle || String(row.parentId).slice(0, 8)}`
  if (row.source === 'QQ 桥接') return 'QQ 桥接（群里说话）'
  if (row.source === '刷B站') return '刷B站（定时/手动）'
  if (row.source === '鱼神·总台') return '鱼神·总台'
  if (row.source === '派活会话') return '派活会话'
  return '本机窗口（老板开的）'
}

function ageOf(now, at) {
  const t = Date.parse(String(at || ''))
  return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 1000)) : null
}
const norm = (s) => String(s || '').replace(/\[自修\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)
const byAge = (a, b) => (a.age ?? 1e9) - (b.age ?? 1e9)
const brief = (s, n = 90) => String(s || '').replace(/\s+/g, ' ').slice(0, n)

/**
 * @param {object} input
 * @param {number} input.now            毫秒时间戳
 * @param {Array}  input.sessions       liveSessions 的返回（title/status/lastAt/lastText/source）
 * @param {Array}  input.jobs           派活单（id/status/brief/createdAt/coordination）
 * @param {Array}  input.incidents      事故单（id/status/title/text/lastAt/at）
 * @param {Array}  input.patches        补丁草案（id/title/at）
 * @param {function} [input.roleOf]     会话 id → 角色 id
 */
export function buildNowSnapshot({ now = Date.now(), sessions = [], jobs = [], incidents = [], patches = [], roleOf = () => '', q = '' } = {}) {
  const running = []
  const done = []
  const error = []
  const jobBySession = new Map((Array.isArray(jobs) ? jobs : []).filter((j) => j?.sessionId).map((j) => [String(j.sessionId), j]))
  for (const row of sessions) {
    const age = ageOf(now, row.lastAt)
    const role = roleOf(row.id)
    const job = jobBySession.get(String(row.id))
    const enriched = job ? { ...row, jobId: job.id, employee: job.employee || row.employee, jobBrief: job.brief || row.jobBrief } : row
    const named = titleOf(enriched, role)
    const item = {
      kind: 'session',
      id: String(row.id || '').replace(/^session-/, '').slice(0, 8),
      fullId: String(row.id || ''),
      title: named,
      role: roleOf(row.id),
      status: String(row.status || ''),
      doing: brief(row.lastText || row.jobBrief, 90),
      age,
      source: String(row.source || ''),
      parent: row.parentId ? String(row.parentId).slice(0, 8) : '',
      provenance: provenanceOf(enriched),
    }
    if (STATUS_ERROR.test(item.status) || TEXT_ERROR.test(item.doing)) { error.push(item); continue }
    if (ACTIVE_STATUS(item.status) && age !== null && age < 180) running.push(item)
    else if (age !== null && age < 1800) done.push(item)
  }
  const pending = []
  for (const job of jobs) {
    if (!['waiting', 'dispatched', 'redispatched'].includes(String(job.status))) continue
    pending.push({
      kind: 'job',
      id: String(job.id || ''),
      title: brief(job.brief, 60),
      status: String(job.status),
      age: ageOf(now, job.createdAt),
      doing: brief(job.coordination || job.expect, 80),
      provenance: job.employee ? `派活 → ${job.employee}` : '派活单（未开工/在跑）',
    })
  }
  for (const inc of incidents) {
    if (!['open', 'fixing'].includes(String(inc.status))) continue
    error.push({
      kind: 'incident',
      id: String(inc.id || ''),
      title: brief(inc.title, 60),
      status: String(inc.status),
      age: ageOf(now, inc.lastAt || inc.at),
      doing: brief(inc.text, 90),
      provenance: `事故单${inc.source ? ` · ${inc.source}` : ''}`,
    })
  }

  // 重复：同一份简报派了多次的单；同标题的补丁草案。
  const duplicate = []
  const jobGroups = new Map()
  for (const job of jobs) {
    const key = norm(job.brief)
    if (!key) continue
    jobGroups.set(key, [...(jobGroups.get(key) || []), job])
  }
  for (const [key, rows] of jobGroups) {
    if (rows.length < 2) continue
    duplicate.push({ kind: 'job', id: rows.map((r) => r.id).slice(0, 3).join(' / '), title: `${rows.length} 单同内容：${key.slice(0, 50)}`, status: 'duplicate', age: ageOf(now, rows[rows.length - 1].createdAt), provenance: '同内容派单（需合并/只做一份）' })
  }
  const patchGroups = new Map()
  for (const p of patches) {
    const key = String(p.title || '').trim()
    if (!key) continue
    patchGroups.set(key, [...(patchGroups.get(key) || []), p])
  }
  for (const [key, rows] of patchGroups) {
    if (rows.length < 2) continue
    duplicate.push({ kind: 'patch', id: rows.map((r) => r.id).slice(0, 3).join(' / '), title: `${rows.length} 份同类补丁草案：${key.slice(0, 40)}`, status: 'proposed', age: ageOf(now, rows[rows.length - 1].at), provenance: '同类补丁草案（需选一份落地）' })
  }

  // 会话树：谁开的、底下几个子窗口、各自在干什么。
  const nodeById = new Map()
  for (const row of sessions) {
    const age = ageOf(now, row.lastAt)
    if (age === null || age > 1800) continue
    const id = String(row.id || '')
    if (!id) continue
    const role = roleOf(id)
    const job = jobBySession.get(id)
    const enriched = job ? { ...row, jobId: job.id, employee: job.employee || row.employee, jobBrief: job.brief || row.jobBrief } : row
    nodeById.set(id, {
      id: id.replace(/^session-/, '').slice(0, 8),
      fullId: id,
      parentId: String(row.parentId || ''),
      title: titleOf(enriched, role),
      role,
      source: String(row.source || ''),
      status: String(row.status || ''),
      doing: brief(row.lastText || row.jobBrief, 80),
      age,
      provenance: provenanceOf(enriched),
      children: [],
    })
  }
  for (const node of nodeById.values()) {
    const parent = node.parentId ? nodeById.get(node.parentId) : null
    if (parent) parent.children.push(node)
  }
  const roots = [...nodeById.values()]
    .filter((node) => !(node.parentId && nodeById.has(node.parentId)))
    .sort(byAge)
    .slice(0, 6)
  for (const node of nodeById.values()) node.children.sort(byAge)

  // 搜索：跨会话（不限 30 分钟）、派活、事故、补丁；按标题/在做什么/来源/id 命中。
  const needle = String(q || '').trim().toLowerCase()
  const search = []
  if (needle) {
    const push = (kind, id, title, doing, provenance, age, status) => {
      const hay = [title, doing, provenance, id, status].join(' ').toLowerCase()
      if (!hay.includes(needle)) return
      search.push({ kind, id: String(id || ''), title: brief(title, 60), doing: brief(doing, 80), provenance, age, status })
    }
    for (const row of sessions) {
      const age = ageOf(now, row.lastAt)
      const id = String(row.id || '')
      if (!id) continue
      const role = roleOf(id)
      const job = jobBySession.get(id)
      const enriched = job ? { ...row, jobId: job.id, employee: job.employee || row.employee, jobBrief: job.brief || row.jobBrief } : row
      push('session', id.replace(/^session-/, '').slice(0, 8), titleOf(enriched, role), row.lastText || row.jobBrief, provenanceOf(enriched), age, row.status)
    }
    for (const job of jobs) {
      push('job', job.id, job.brief, job.expect || job.coordination, job.employee ? `派活 → ${job.employee}` : '派活单', ageOf(now, job.createdAt), job.status)
    }
    for (const inc of incidents) {
      push('incident', inc.id, inc.title, inc.text, `事故单${inc.source ? ` · ${inc.source}` : ''}`, ageOf(now, inc.lastAt || inc.at), inc.status)
    }
    for (const p of patches) {
      push('patch', p.id, p.title, p.note || '', '补丁草案', ageOf(now, p.at), p.status)
    }
  }

  return {
    ok: true,
    at: new Date(now).toISOString(),
    q: String(q || '').trim(),
    counts: { running: running.length, done: done.length, pending: pending.length, error: error.length, duplicate: duplicate.length, search: search.length },
    search: search.sort(byAge).slice(0, 24),
    tree: roots,
    running: running.sort(byAge).slice(0, 8),
    done: done.sort(byAge).slice(0, 8),
    pending: pending.sort(byAge).slice(0, 8),
    error: error.sort(byAge).slice(0, 8),
    duplicate: duplicate.sort(byAge).slice(0, 8),
  }
}
