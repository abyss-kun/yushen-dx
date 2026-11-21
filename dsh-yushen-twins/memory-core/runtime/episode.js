/* 标签
 * id: memory-core-episode
 * kind: module
 * summary: 事件段索引：把中层行按「会话+通道」聚成事件段，按时间间隔/轮数/时长切段，给每段一句不带判断的标签。
 * tags: 事件段, 中层, 时间线, 索引, 标签
 * created: 2026-11-15 20:30:00
 * changed: 2026-11-16 20:55:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-15：事件段索引最小可用模块；不改 capture/refine 主链）
 * audience: 以后的多轮拼合、检索、页面
 * owner: 框架；只读中层行，自己只追加 episodes-<role>.jsonl
 * mutable: 可改；切段阈值是参数，不要写死成判断
 * usage: buildEpisodes(rows, opts) / labelEpisode(ep) / writeEpisodes(role, eps) / episodeIndex(role) / episodeIdForTurn(role, turnId) / cardsForEpisode(role, episodeId)
 * why: 中层是「一条一条」，跨轮的同一件事没有段落；先做最小索引，不改原文
 * result: 每段有起止时间、轮次、原文 ref、模板标签；不写「讨论深入/达成共识」这类判断；turnId→episodeId 只读索引，卡上没写就返回空，不硬编
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { dataRoot } from './root.js'
import { parseTimeRange } from './time-range.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10)
const str = (v) => (v === null || v === undefined ? '' : String(v))
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }

export const DEFAULT_GAP_MS = 30 * 60 * 1000
export const DEFAULT_MAX_TURNS = 20
export const DEFAULT_MAX_HOURS = 2
const MAX_PEOPLE = 8
const BARE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PEOPLE_SKIP = new Set(['', '她', '未知', '谁', '我', '你', '他'])
const KEYWORD_NOISE = /^(当前时间|当前角色|完整角色卡|请调用|系统提示|时间|角色|发生了什么|关键)$/
const TOPIC_STOP = new Set([
  '继续', '配置一下', '我要', '现在', '然后', '可以', '这个', '那个', '一下', '事情',
  '问题', '记录', '处理', '看看', '开始', '结束', '完成', '成功', '失败', '运行',
  '工具', '文件', '目录', '数据', '内容', '东西', '时候', '今天', '昨天', '还是',
  '就是', '因为', '所以', '但是', '如果', '没有', '不是', '什么', '怎么', '为什么',
  '大鱼', '小鱼', '照微', '老板', '主人', '被喊', '第一句是', '第一句', '你说', '我说',
  '别人', '系统', '消息', '回复', '用户', '一个', '需要', '应该', '接着', '当前',
  '明天', '好的', '收到', '知道', '关于', '相关', '进行', '已经', '还有', '只有',
])
const TOPIC_PREFIX = /^(我要|我想|我想问|帮我|给我|请你|一下|这个|那个|关于|相关)/
const TOOL_WORD = /^(pwsh|job_output|write|edit|read|exec|shell|bash|node|npm|git|action|status|result|error|exit|stdout|stderr|tmp|github)$/i
const ASCII_ONLY = /^[\x00-\x7F]+$/


const uniq = (xs) => {
  const out = []
  const seen = new Set()
  for (const x of xs) {
    const s = str(x).trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

function msOf(at) {
  const t = Date.parse(str(at))
  return Number.isFinite(t) ? t : NaN
}

/** 「HH:MM」：at 里有 T/空格 时间就直接取，避免时区把标签上的钟点挪走。 */
function hhmm(at) {
  const s = str(at)
  const m = s.match(/(?:^|[T\s])(\d{2}:\d{2})/)
  if (m) return m[1]
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return '--:--'
  const d = new Date(t)
  const p = (x) => String(x).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

function listOf(v, split = false) {
  if (Array.isArray(v)) return v.map(str).map((s) => s.trim()).filter(Boolean)
  const s = str(v).trim()
  if (!s) return []
  return split ? s.split(/[,，、/|;；]+/).map((x) => x.trim()).filter(Boolean) : [s]
}

/** 人：优先 people，再看 about / who；「她/我/你」和纯数字（误抽的编号）不算人。 */
function peopleOf(row) {
  const out = []
  const push = (v) => {
    for (const p of listOf(v, true)) {
      if (PEOPLE_SKIP.has(p) || /^\d+$/.test(p) || out.includes(p)) continue
      out.push(p)
    }
  }
  push(row.people)
  push(row.about)
  push(row.who)
  return out
}

/**
 * 会话键：新行有 sessionId 就用；老行大多没有 sessionId，
 * 退到 live 文件基名 session，再退到 ref 里的 session:<id>。不编假 id。
 */
function sessionIdOf(row) {
  const sid = str(row.sessionId).trim()
  if (sid) return sid
  const session = str(row.session).trim()
  if (session) return session
  const m = str(row.ref).match(/^session:([^:]+):turn:/)
  return m ? m[1] : ''
}

/** 轮 id：新行有 turnId 就用；思考块的行用 ref 里的 turn:N 还原；再不行给空，不编。 */
function turnIdOf(row) {
  const tid = str(row.turnId).trim()
  if (tid) return tid
  const ref = str(row.ref)
  const m = ref.match(/^session:([^:]+):turn:(\d+)/)
  if (m) return `${m[1]}#${m[2]}`
  const turn = Number(row.turn) || 0
  const sid = sessionIdOf(row)
  if (turn > 0) return `${sid || 'session'}#${turn}`
  return ''
}

/** 关键词：只认行里已有的 keywords（没有就不编）。 */
function keywordsOf(row) {
  const out = []
  for (const raw of listOf(row.keywords, true)) {
    const w = raw.trim()
    if (w.length < 2 || KEYWORD_NOISE.test(w) || TOPIC_STOP.has(w) || TOOL_WORD.test(w)) continue
    // 纯英文/路径/命令名不当话题；带中文的 B站、QQ 群 仍保留。
    if (ASCII_ONLY.test(w)) continue
    if (TOPIC_PREFIX.test(w)) continue
    if (/(一下|什么|怎么|我要)$/.test(w)) continue
    if (out.includes(w)) continue
    out.push(w)
  }
  return out
}

function statsOf(rows) {
  const freq = new Map()
  for (const r of rows) {
    for (const w of keywordsOf(r)) {
      const cur = freq.get(w)
      if (cur) cur.n += 1
      else freq.set(w, { w, n: 1, first: freq.size })
    }
  }
  const words = [...freq.values()].sort((a, b) => b.n - a.n || a.first - b.first).map((x) => x.w)
  return { words, topic: words.slice(0, 2).join('、') }
}

// 域只用来分组，不做价值判断；命中不了就「其它」。
const DOMAIN_RULES = [
  ['技术', /代码|脚本|插件|备份|报错|bug|修复|测试|接口|数据|记忆|节点|部署|仓库|文档|日志/i],
  ['创作', /视频|封面|立绘|出图|剪辑|B站|播放|文案|标题|分镜|画/i],
  ['社交', /群|群友|QQ|聊天|回复|问候|老板|朋友/i],
  ['账目', /钱|价格|预算|花费|余额|充值|账单|额度|成本/i],
]

function domainOf(rows, words) {
  const text = [...words, ...rows.map((r) => str(r.head))].join(' ')
  for (const [name, re] of DOMAIN_RULES) if (re.test(text)) return name
  return '其它'
}

// 工作/生活只做显式词分组，不判断“这句是不是生活”；判不了就 unknown。
const WORK_WORDS = /任务|项目|截止|代码|文件|配置|测试|报错|修复|部署|服务器|仓库|文档|预算|账单|录制|B站|视频|工作/i
const LIFE_WORDS = /累|吃饭|睡|心情|开心|难过|委屈|担心|怕|家|朋友|小洛|群友|晚安|早安|想你|陪伴|身体|体检|休息/i
function lifeWorkOf(rows, words) {
  const text = [...words, ...rows.map((r) => str(r.head))].join(' ')
  const w = WORK_WORDS.test(text)
  const l = LIFE_WORDS.test(text)
  if (w && l) return 'mixed'
  if (w) return 'work'
  if (l) return 'life'
  return 'unknown'
}

/** 段有多确定：行里标「确定」的占六成才算确定，其余都写推测（不替原文抬高）。 */
function confidenceOf(rows) {
  const known = rows.map((r) => str(r.confidence).trim()).filter(Boolean)
  if (!known.length) return '推测'
  const sure = known.filter((c) => /确定|confirmed|high/i.test(c)).length
  return sure / known.length >= 0.6 ? '确定' : '推测'
}

function makeEpisode({ rows, channel, sessionId }) {
  const turnIds = uniq(rows.map(turnIdOf))
  const refs = uniq(rows.map((r) => r.ref))
  const people = uniq(rows.flatMap(peopleOf)).slice(0, MAX_PEOPLE)
  const { words, topic } = statsOf(rows)
  const startAt = str(rows[0].at).trim()
  const endAt = str(rows[rows.length - 1].at).trim()
  // 老数据没有 turnId：轮数退到 ref 数 / 行数，标签才不会写成「0 轮」。
  const turns = turnIds.length || refs.length || rows.length
  const ep = {
    // 同 id 幂等；段变长（endAt/轮数变了）会生成新 id，追加新版本，旧行不改。
    id: 'ep-' + sha(`${sessionId}|${channel}|${startAt}|${endAt}|${turns}`),
    startAt,
    endAt,
    sessionId,
    channel,
    people,
    turnIds,
    refs,
    label: '',
    domain: domainOf(rows, words),
    domainKind: lifeWorkOf(rows, words),
    confidence: confidenceOf(rows),
    // 下面几个是 labelEpisode 的原料，不属于承诺给外面的十个字段，但一起存着可复算。
    turns,
    topic,
    keywords: words.slice(0, 5),
  }
  ep.label = labelEpisode(ep)
  return ep
}

/**
 * 中层行 → 事件段。只读，不写盘。
 * 分组：channel + sessionId；切段：相邻间隔 > gapMs、段内轮数到 maxTurns、段跨度 > maxHours。
 * at 解析不了的行跳过（宁可少一段，不把它们硬塞进别人的段）。
 */
export function buildEpisodes(rows, { gapMs = DEFAULT_GAP_MS, maxTurns = DEFAULT_MAX_TURNS, maxHours = DEFAULT_MAX_HOURS } = {}) {
  const gap = Math.max(0, num(gapMs, DEFAULT_GAP_MS))
  const capTurns = Math.max(1, Math.floor(num(maxTurns, DEFAULT_MAX_TURNS)))
  const hours = num(maxHours, DEFAULT_MAX_HOURS)
  const maxSpan = hours > 0 ? hours * 3600e3 : Infinity
  const groups = new Map()
  const list = Array.isArray(rows) ? rows : []
  for (let i = 0; i < list.length; i++) {
    const r = list[i]
    if (!r || typeof r !== 'object') continue
    const ms = msOf(r.at)
    if (!Number.isFinite(ms)) continue
    const channel = str(r.channel).trim()
    const sessionId = sessionIdOf(r)
    const key = `${channel}\u0000${sessionId}`
    if (!groups.has(key)) groups.set(key, { channel, sessionId, items: [] })
    groups.get(key).items.push({ r, ms, i })
  }
  const out = []
  for (const g of groups.values()) {
    g.items.sort((a, b) => a.ms - b.ms || a.i - b.i)
    let cur = null
    const flush = () => {
      if (!cur) return
      out.push(makeEpisode({ rows: cur.rows, channel: g.channel, sessionId: g.sessionId }))
      cur = null
    }
    for (const it of g.items) {
      if (!cur) {
        cur = { rows: [it.r], startMs: it.ms, lastMs: it.ms }
        continue
      }
      const tooFar = gap > 0 && it.ms - cur.lastMs > gap
      const tooMany = cur.rows.length >= capTurns
      const tooLong = Number.isFinite(maxSpan) && it.ms - cur.startMs > maxSpan
      if (tooFar || tooMany || tooLong) {
        flush()
        cur = { rows: [it.r], startMs: it.ms, lastMs: it.ms }
      } else {
        cur.rows.push(it.r)
        cur.lastMs = it.ms
      }
    }
    flush()
  }
  out.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)) || a.sessionId.localeCompare(b.sessionId) || a.channel.localeCompare(b.channel))
  return out
}

/**
 * 模板标签，只写看到的事实：
 *   HH:MM–HH:MM 与X讨论Y，N轮，原文 #ref
 * 抽不到主题就退成：HH:MM–HH:MM 有一段 N 轮对话，原文 #ref
 * 不写「讨论得很深入」「达成共识」这类判断。
 */
export function labelEpisode(episode) {
  const ep = episode && typeof episode === 'object' ? episode : {}
  const start = hhmm(ep.startAt)
  const end = hhmm(ep.endAt)
  const span = start === end ? start : `${start}–${end}`
  const n = Number(ep.turns)
  const turns = Number.isFinite(n) && n > 0 ? n : (Array.isArray(ep.turnIds) ? ep.turnIds.length : 0)
  const people = (Array.isArray(ep.people) ? ep.people : []).map(str).filter(Boolean).slice(0, MAX_PEOPLE)
  const topic = str(ep.topic).trim()
  const ref = Array.isArray(ep.refs) && ep.refs.length ? str(ep.refs[0]).trim() : ''
  const pointer = `原文 #${ref || '未记'}`
  const who = people.length ? `${people.slice(0, 2).join('、')}${people.length > 2 ? '等' : ''}` : ''
  if (topic && who) return `${span} 与${who}讨论${topic}，${turns}轮，${pointer}`
  if (topic) return `${span} 讨论${topic}，${turns}轮，${pointer}`
  return `${span} 有一段 ${turns} 轮对话，${pointer}`
}

export function episodesFile(role) {
  const r = str(role || 'dayu').replace(/[^\w\u4e00-\u9fa5-]/g, '') || 'dayu'
  return path.join(dataRoot(HOME), 'library', 'meta', `episodes-${r}.jsonl`)
}

/** 读事件段；坏行跳过，不崩。 */
export function readEpisodes(role) {
  const file = episodesFile(role)
  const out = []
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line.replace(/^\uFEFF/, ''))
        if (row && row.id && row.startAt) out.push(row)
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 还没有文件 */ }
  return out
}

/** 读“投影要点”给事件段配里；只取现成的 inner/thinkDigest，不现算、不补造。 */
function innerForTurnIds(ids) {
  const want = new Set(ids.map((x) => String(x)))
  const out = new Map()
  const dir = path.join(dataRoot(HOME), '思考', 'turns')
  const walk = (d) => {
    let es = []
    try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of es) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!p.endsWith('.jsonl')) continue
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const row = JSON.parse(line.replace(/^\uFEFF/, ''))
          const tid = String(row?.turnId || '')
          if (!want.has(tid)) continue
          const thoughts = Array.isArray(row?.inner?.thoughts) ? row.inner.thoughts : (Array.isArray(row?.thinkDigest) ? row.thinkDigest : [])
          const clean = thoughts.map((x) => ({ step: Number(x?.step) || 0, text: str(x?.text).trim() })).filter((x) => x.text)
          if (clean.length) out.set(tid, { thoughts: clean.slice(0, 2), emotions: Array.isArray(row?.inner?.emotions) ? row.inner.emotions.slice(0, 8) : [] })
        } catch { /* 坏行跳过 */ }
      }
    }
  }
  walk(dir)
  return out
}

/** 最近 N 段；同一段有多个版本时取 endAt 最新的一版。 */
export function recentEpisodes(role, { limit = 2, maxAgeMs = 14 * 24 * 3600e3, now = Date.now() } = {}) {
  const byId = new Map()
  for (const ep of readEpisodes(role)) {
    const id = String(ep.id)
    const old = byId.get(id)
    if (!old || msOf(ep.endAt) >= msOf(old.endAt)) byId.set(id, ep)
  }
  const cutoff = Number(now) - Math.max(0, num(maxAgeMs, 14 * 24 * 3600e3))
  // 主会话 id 带 `session-` 前缀；子代理会话是裸 UUID。注入只给“她自己的经历”，
  // 子代理干活过程留在文件里可查，但不冒充她刚发生的事。
  const bareUuid = BARE_UUID
  const picked = [...byId.values()]
    .filter((ep) => msOf(ep.endAt) >= cutoff)
    .filter((ep) => !(Array.isArray(ep.people) && ep.people.includes('系统')))
    .filter((ep) => !String((Array.isArray(ep.refs) ? ep.refs.join(' ') : ep.refs) || '').includes('selfcheck'))
    .filter((ep) => !bareUuid.test(String(ep.sessionId || '')))
    .sort((a, b) => msOf(b.endAt) - msOf(a.endAt))
    .slice(0, Math.max(1, num(limit, 2)))
  const ids = picked.flatMap((ep) => (Array.isArray(ep.turnIds) ? ep.turnIds : []))
  const inner = innerForTurnIds(ids)
  return picked.map((ep) => {
    const own = (Array.isArray(ep.turnIds) ? ep.turnIds : []).map((t) => inner.get(String(t))).find(Boolean)
    return own ? { ...ep, inner: own } : ep
  })
}

/**
 * 按时间/关键词找事件段；只返回目录和原文指针，不展开整段。
 * 有“昨晚8点”先按时间窗过滤；剩下关键词再按 label/topic/keywords/people 打分。
 */
export function findEpisodes(role, query, { limit = 5, now = Date.now(), includeSubagents = false } = {}) {
  const q = str(query).trim()
  if (!q) return []
  const tr = parseTimeRange(q, { now })
  const rest = tr ? tr.rest : q
  const terms = (String(rest).toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{2,}/g) || [])
    .filter((x) => !TOOL_WORD.test(x))
  const from = tr ? Date.parse(tr.from) : NaN
  const to = tr ? Date.parse(tr.to) : NaN
  const hits = []
  for (const ep of readEpisodes(role)) {
    const start = msOf(ep.startAt)
    const end = msOf(ep.endAt)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (!includeSubagents && BARE_UUID.test(String(ep.sessionId || ''))) continue
    if (tr && Number.isFinite(from) && Number.isFinite(to) && !(end > from && start < to)) continue
    const text = [ep.label, ep.topic, ...(Array.isArray(ep.keywords) ? ep.keywords : []), ...(Array.isArray(ep.people) ? ep.people : [])].join(' ').toLowerCase()
    let score = 0
    for (const t of terms) if (text.includes(t)) score += t.length >= 4 ? 2 : 1
    if (!terms.length && !tr) continue
    if (terms.length && !score) continue
    hits.push({ ep, score })
  }
  return hits
    .sort((a, b) => b.score - a.score || msOf(b.ep.endAt) - msOf(a.ep.endAt))
    .slice(0, Math.max(1, num(limit, 5)))
    .map((x) => ({ ...x.ep, _score: x.score, timeRange: tr ? { from: tr.from, to: tr.to, label: tr.label } : undefined }))
}

/**
 * 跨角色按关键词/时间找事件段；只给目录，不展开原文。
 * 用于会话里的“翻旧账”工具，不替她判断该不该用。
 */
export function findEpisodesAny(query, { limit = 3, now = Date.now(), includeSubagents = false } = {}) {
  const dir = path.join(dataRoot(HOME), 'library', 'meta')
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => /^episodes-.+\.jsonl$/.test(f)) } catch { return [] }
  const out = []
  for (const f of files) {
    const role = f.replace(/^episodes-/, '').replace(/\.jsonl$/, '')
    for (const ep of findEpisodes(role, query, { limit, now, includeSubagents })) out.push({ ...ep, role })
  }
  out.sort((a, b) => Number(b._score || 0) - Number(a._score || 0) || msOf(b.endAt) - msOf(a.endAt))
  return out.slice(0, Math.max(1, num(limit, 3)))
}

function refText(ref, maxChars) {
  const raw = str(ref).trim()
  if (!raw) return ''
  // session:<sid>:turn:<n> → live/raw/<sid>/<n>.jsonl
  const sm = raw.match(/^session:([^:]+):turn:(\d+)/)
  if (sm) {
    const file = path.join(dataRoot(HOME), 'live', 'raw', sm[1], `${sm[2]}.jsonl`)
    try {
      const parts = []
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        if (!line.trim()) continue
        try {
          const ev = JSON.parse(line)
          // 只展开对话；system/developer/working-directory 是宿主提示，不是“发生了什么”。
          const type = str(ev?.type || '')
          if (!/^(user\/message|assistant\/message)$/.test(type)) continue
          const content = ev?.data?.content || ev?.data?.message?.content || []
          const texts = []
          for (const c of content) if (c?.type === 'text' && c.text) texts.push(String(c.text))
          if (texts.length) parts.push(`${type === 'user/message' ? '你' : '她'}：${texts.join('\n')}`)
        } catch { /* 坏行跳过 */ }
      }
      return parts.join('\n').slice(0, maxChars)
    } catch { return '' }
  }
  // dayu/live/...md:28 → 该行前后一段
  const m = raw.match(/^(.*):(\d+)$/)
  if (!m) return ''
  const rel = m[1].replace(/^dayu[\\/]/, '')
  const file = path.isAbsolute(rel) ? rel : path.join(dataRoot(HOME), rel)
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    const line = Math.max(1, Number(m[2]) || 1)
    const start = Math.max(0, line - 4)
    return lines.slice(start, line + 30).join('\n').slice(0, maxChars)
  } catch { return '' }
}

/**
 * 按事件段 id 展开原文（只读，不生成结论）。refs 里的 md 行/raw 会话都尽量取；
 * 取不到就返回空并在 missing 里标明，不拿印象补。
 */
export function expandEpisode(role, id, { maxChars = 4000 } = {}) {
  const want = str(id)
  const eps = readEpisodes(role).filter((e) => String(e.id) === want)
  if (!eps.length) return { ok: false, why: '没有这个事件段', id: want }
  const ep = eps.sort((a, b) => msOf(b.endAt) - msOf(a.endAt))[0]
  const sources = []
  const missing = []
  for (const ref of (Array.isArray(ep.refs) ? ep.refs : [])) {
    const text = refText(ref, maxChars)
    if (text) sources.push({ ref, text })
    else missing.push(String(ref))
  }
  return { ok: true, episode: ep, sources, missing, note: '原文片段；判断仍由模型/她做，不自动下结论。' }
}

/** 最近段里挑“工作+生活都有一点”，不只看时间先后；差不到就退回最近。 */
export function recentEpisodesForInject(role, { limit = 2, maxAgeMs = 14 * 24 * 3600e3, now = Date.now() } = {}) {
  const all = recentEpisodes(role, { limit: 8, maxAgeMs, now })
  const target = Math.max(1, num(limit, 2))
  const picks = []
  const take = (pred) => {
    for (const ep of all) {
      if (picks.length >= target) return
      if (picks.includes(ep)) continue
      if (pred(ep)) picks.push(ep)
    }
  }
  // 先各挑一条：生活、工作、混合；剩下的再按最近补齐。
  take((ep) => ep.domainKind === 'life')
  take((ep) => ep.domainKind === 'work')
  take((ep) => ep.domainKind === 'mixed')
  for (const ep of all) {
    if (picks.length >= target) break
    if (!picks.includes(ep)) picks.push(ep)
  }
  return picks.slice(0, target)
}

/** 跨角色按 id 展开；找到哪个角色的段就标哪个。 */
export function expandEpisodeAny(id, { maxChars = 4000 } = {}) {
  const dir = path.join(dataRoot(HOME), 'library', 'meta')
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => /^episodes-.+\.jsonl$/.test(f)) } catch { return { ok: false, why: '没有事件段文件', id: str(id) } }
  for (const f of files) {
    const role = f.replace(/^episodes-/, '').replace(/\.jsonl$/, '')
    const r = expandEpisode(role, id, { maxChars })
    if (r.ok) return { ...r, role }
  }
  return { ok: false, why: '没有这个事件段', id: str(id) }
}

/**
 * 追加写 library/meta/episodes-<role>.jsonl：只 append，不覆盖已有行。
 * dry=true 只算不写。同 id 幂等（重复跑不会重复追加），段变长会以新 id 追加新版本。
 */
export function writeEpisodes(role, episodes, { dry = false } = {}) {
  const list = (Array.isArray(episodes) ? episodes : []).filter((e) => e && typeof e === 'object')
  const file = episodesFile(role)
  if (dry) return { ok: true, dry: true, file, count: list.length, wrote: 0, skipped: 0, episodes: list }
  const seen = new Set()
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line.replace(/^\uFEFF/, ''))
        if (row && row.id) seen.add(String(row.id))
      } catch { /* 坏行跳过，绝不回写 */ }
    }
  } catch { /* 还没有文件 */ }
  const fresh = list.filter((e) => e.id && !seen.has(String(e.id)))
  if (!fresh.length) {
    return { ok: true, dry: false, file, count: list.length, wrote: 0, skipped: list.length - fresh.length }
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const lines = fresh.map((e) => JSON.stringify({ ...e, role: String(role || 'dayu') }))
    fs.appendFileSync(file, lines.join('\n') + '\n', { encoding: 'utf8', mode: 0o600 })
    return { ok: true, dry: false, file, count: list.length, wrote: fresh.length, skipped: list.length - fresh.length }
  } catch (e) {
    return { ok: false, dry: false, file, count: list.length, wrote: 0, error: String(e?.message || e) }
  }
}

/** 递归列出目录下的 .jsonl 文件；读不到就返回已收集的（不抛）。 */
function walkJsonl(dir, out = []) {
  let es = []
  try { es = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walkJsonl(p, out)
    else if (p.endsWith('.jsonl')) out.push(p)
  }
  return out
}

/**
 * turnId → episodeId 的只读索引。
 * 同一 turn 被多个版本的事件段覆盖时（段变长会追加新版本），取 endAt 最新的那一版；
 * endAt 一样时后追加的算新版本（文件按追加写）。endAt 解析不了的版本排最后。
 * 只给指针，不展开段、不改原文；没有就查不到（不编）。
 */
export function episodeIndex(role) {
  const best = new Map()
  for (const ep of readEpisodes(role)) {
    const eid = str(ep.id).trim()
    if (!eid) continue
    const endMs = msOf(ep.endAt)
    const rank = Number.isFinite(endMs) ? endMs : -Infinity
    for (const raw of (Array.isArray(ep.turnIds) ? ep.turnIds : [])) {
      const tid = str(raw).trim()
      if (!tid) continue
      const cur = best.get(tid)
      if (!cur || rank >= cur.endMs) best.set(tid, { id: eid, endMs: rank })
    }
  }
  const out = new Map()
  for (const [tid, v] of best) out.set(tid, v.id)
  return out
}

/** 一轮属于哪个事件段；没有事件段（或 turnId 空）返回空串，不硬编。 */
export function episodeIdForTurn(role, turnId) {
  const tid = str(turnId).trim()
  if (!tid) return ''
  return episodeIndex(role).get(tid) || ''
}

/**
 * 按事件段 id 找卡：递归扫 library/在用 下的所有 .jsonl，只认卡上显式写着的 episodeId。
 * - 坏行/坏文件跳过，不崩；
 * - role 只做“不串角色”的粗筛：卡上没写角色的老卡仍返回，写了别的角色的不返回；
 * - 同 id 的卡只留一张（按 at/createdAt 倒序去重），limit 默认 20。
 */
export function cardsForEpisode(role, episodeId, { limit = 20 } = {}) {
  const want = str(episodeId).trim()
  if (!want) return []
  const roleWanted = str(role).trim()
  const dir = path.join(dataRoot(HOME), 'library', '在用')
  const rows = []
  for (const file of walkJsonl(dir)) {
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { continue }
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      let r = null
      try { r = JSON.parse(line.replace(/^\uFEFF/, '')) } catch { continue }
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue
      if (str(r.episodeId).trim() !== want) continue
      const cardRole = str(r.role).trim()
      if (roleWanted && cardRole && cardRole !== roleWanted) continue
      rows.push(r)
    }
  }
  rows.sort((a, b) => String(b.at || b.createdAt || '').localeCompare(String(a.at || a.createdAt || '')))
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const key = str(r.id || r.ref || r.fromRef || r.head)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    out.push(r)
    if (out.length >= Math.max(1, num(limit, 20))) break
  }
  return out
}
