/* 标签
 * id: lib-live-transcript
 * kind: module
 * summary: 实时抄录：逐文落原文；新增按轮落块（原文+思考+工具+标记），同一份文件。
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: appendTurn（逐条，兼容旧路）/ appendTurnBlock（逐轮，带思考与标记）/ liveFileFor
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-13 00:03:03
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-12 01:2x｜大鱼·本班｜授权：主人（「思考和原文对应逐轮抄录，每句每段每轮分别做好对应标记」）｜lib/live-transcript.js｜新增 appendTurnBlock：turn/end 时一次落一整轮（你问/她答/思考/工具，带 turn/msg/step/p/s 标记），并写思考 JSONL；旧 appendTurn 保留｜为什么：逐条写只有原文，思考接不上；逐轮写才能把 step 和思考、原文对上｜验证：node scripts/test-turn-capture.mjs；真会话回放见 projection-v2/报告.md｜可改：可改；正文不改写、标记不丢、同一轮不重复，三条不许破
// 2026-11-15 校正：投影不是“排版层”，是**筛选/压缩视图**——从 raw 滤掉噪声，
// 只留问/答/思考摘要/工具，供中层和检索使用；重建要同 filterVersion，不能每次现排。
// 实时抄录：每说一句就落一份，带标注（哪天的、标题、小标题、发生了什么、关键字）。
// 2026-11-01 主人：存原样 + 做好标注；每次标一点点，以后查就便宜。
//
// 目录：~/.dsh/dayu/live/<年>/<月周>/<通道>/<日期>-<标题>-<会话id8>.md
// 逐条（旧）：
//   ### 02:20:13 · 谁
//   - 发生了什么：<首句 40 字>
//   - 关键：备份, 删除, 验证
//   （原文）
// 逐轮（新）：见 appendTurnBlock 生成的块；标记：
//   <!-- turn=12 ... --> 轮；<!-- msg=221 --> 一条消息；<!-- say=230 step=1 --> 她说；
//   <!-- think=228 step=1 part=1 --> 当时的思考；<!-- p=1 --> 段；<!-- s=1 --> 句；
//   思考用 kp/ks，避免和正文的 p/s 混。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fmtFull, zone } from './time.js'
import { ingestTurn } from './middle.js'
import { classifyEntry, FILTER_VERSION } from './filter.js'
import { dataRoot } from './root.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const BASE = path.join(dataRoot(HOME), 'live')

const placeOf = (cwd) => {
  const s = String(cwd || '')
  if (/qq-bridge/i.test(s)) return 'QQ'
  if (/bili/i.test(s)) return 'B站'
  if (/mobile|手机/i.test(s)) return '手机'
  if (/dsh-yushen-twins|大小鱼|dayu/i.test(s)) return '工作台'
  return '本机'
}
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 50) || 'untitled'
const stamp = (d) => fmtFull(d)
const clock = (d) => stamp(d).slice(11)
// ISO 周号：一个月的文件夹里放几个周（W01…W53）
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const w = Math.ceil((((t - y0) / 86400000) + 1) / 7)
  return `W${String(w).padStart(2, '0')}`
}

// 关键字词表：命中就带上，最多三个
const KEYWORDS = [
  ['备份', /备份|快照|还原|恢复|存档/],
  ['记忆', /记忆|冷档|忘|想起/],
  ['会话', /会话|原文|归档|抄录/],
  ['删除', /删|清掉|移除/],
  ['搬迁', /搬|移动|归档到|移到/],
  ['规则', /规则|手册|宪章|底线|铁律|标记|标注/],
  ['测试', /测试|回归|断言|自检/],
  ['密钥', /密钥|口令|令牌|token/i],
  ['视频', /视频|片子|剪辑|渲染|封面/],
  ['插件', /插件|安装|加载|bundles/],
  ['故障', /崩|坏|报错|失败|事故/],
  ['钱', /钱|花费|预算|成本/],
  ['日记', /日记|感受|心情/],
  ['身份', /身份|本体|名字|我是谁/],
]
const keywordsOf = (text) => KEYWORDS.filter(([, re]) => re.test(text)).map(([k]) => k).slice(0, 3)
const headOf = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40)

const lastSeen = new Map()
// 行号缓存：file → 已写到的换行数。第一次用才读一遍文件（一个进程一次），之后跟着追加累加。
const lineCache = new Map()
const newlines = (s) => (String(s).match(/\n/g) || []).length

/** 这一轮该落到哪个文件：和逐条抄录同一棵树、同一个命名。 */
export function liveFileFor({ sessionId = '', title = '', cwd = '', at = new Date() } = {}) {
  const place = placeOf(cwd)
  const date = stamp(at).slice(0, 10)
  const id8 = String(sessionId).replace(/^session-/, '').slice(0, 8) || 'unknown'
  const [yyyy, mm] = date.split('-')
  const week = isoWeek(at)
  const dir = path.join(BASE, yyyy, `${mm}${week}`, place)
  return { dir, file: path.join(dir, `${date}-${safe(title)}-${id8}.md`), place, date, id8 }
}

function ensureHeader(file, { title, who, place, id8, at, role }) {
  const isNew = !fs.existsSync(file)
  let before = lineCache.get(file)
  if (before == null) {
    try { before = newlines(fs.readFileSync(file, 'utf8')) } catch { before = 0 }
  }
  if (isNew) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    // 2026-11-04 主人：「逐轮抄录标签，是不是头顶个说明会更好」——所以文件开头放标签块。
    fs.writeFileSync(file, [
      '<!-- 标签',
      `id: live-${id8}`,
      'kind: transcript',
      `tags: 抄录, ${place}, ${role || '未知'}, 逐轮`,
      `created: ${stamp(at)}`,
      `changed: ${stamp(new Date())}`,
      'author: 实时抄录（自动生成）',
      'authority: 老板（2026-11-03：只要改动/新增都要有标签；2026-11-04：抄录头顶要说明）',
      'why: 逐轮原文落地，带年月日时分秒、谁→对谁、关键字，供以后按人按日期翻',
      'result: 正文每轮一个 turn=N 块，原文与思考按 step 对应，段/句各有标记',
      'mutable: 自动生成，勿手改（要改去改 lib/live-transcript.js）',
      '-->',
      '',
      `# ${title || '(无标题)'}`,
      '',
      `- 谁：${who || '未知'}`,
      `- 地点：${place}`,
      `- 会话：${id8}`,
      `- 时间：${stamp(at)} 起（${zone()}）`,
      `- 来源：实时抄录（逐轮）`,
      `- 生成：live-transcript · ${stamp(new Date())}`,
      '',
      '---',
      '',
    ].join('\n'), 'utf8')
    before = newlines(fs.readFileSync(file, 'utf8'))
    lineCache.set(file, before)
  }
  return { isNew, before }
}

export function appendTurn({ sessionId = '', title = '', cwd = '', who = '', to = '', role = '', text = '', at = new Date() } = {}) {
  if (!text || !String(text).trim()) return { ok: false, reason: '空' }
  if (/^Current runtime context|^Time sampled while preparing/.test(text)) return { ok: false, reason: '运行上下文不算' }
  const { place, date, id8, file } = liveFileFor({ sessionId, title, cwd, at })

  const fp = crypto.createHash('sha256').update(`${stamp(at)}|${who}|${text}`).digest('hex').slice(0, 12)
  if (lastSeen.get(file) === fp) return { ok: false, reason: '重复' }
  lastSeen.set(file, fp)

  const tWrite = performance.now()
  const { before } = ensureHeader(file, { title, who, place, id8, at, role })
  const keys = keywordsOf(text)
  // 2026-11-04 主人：「按标签，年月日时分秒、谁和谁、什么事、关键字」。
  const block = [
    `### ${stamp(at)} · ${who || '未知'}${to ? ` → ${to}` : ''}`,
    `- 发生了什么：${headOf(text)}`,
    `- 关键：${keys.length ? keys.join(', ') : '日常'}`,
    '',
    String(text).trim(),
    '',
  ].join('\n')
  fs.appendFileSync(file, block, 'utf8')
  lineCache.set(file, before + newlines(block))
  const liveMs = performance.now() - tWrite

  // 2026-11-02 主人：每轮写完 live 立刻接一条链——原文先进手抄本（先落地，后面挂了也不丢），
  // 再粗提炼一条 + 一条待提炼指针。纯写文件、不调模型；链挂了也不挡 live（原文已经写完了）。
  const chain = (() => {
    try {
      const rel = path.relative(HOME, file).replace(/\\/g, '/')
      return ingestTurn({
        channel: place,
        day: date,
        session: path.basename(file).replace(/\.md$/, ''),
        role,
        who: who || '未知',
        at: `${date}T${clock(at)}`,
        text: String(text).trim(),
        ref: `${rel}:${before + 1}`,
        line: before + 1,
        base: path.basename(file),
        file,
        body: block,
      })
    } catch (e) { return { ok: false, err: String(e?.message || e).slice(0, 80), at: Date.now() } }
  })()
  return {
    ok: true,
    file,
    line: before + 1,
    ms: {
      live: Number(liveMs.toFixed(2)),
      raw: Number((chain?.rawMs || 0).toFixed(2)),
      coarse: Number((chain?.coarseMs || 0).toFixed(2)),
      chain: Number(((chain?.rawMs || 0) + (chain?.coarseMs || 0)).toFixed(2)),
    },
    chain,
  }
}

// ── 逐轮：正文 + 思考 + 工具，一次落一整块 ─────────────────────────────
const ROLE_NAME = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' }
const TURN_STATE = path.join(BASE, '.turn-state.json')
let turnState = null
function readTurnState() {
  if (turnState) return turnState
  try { turnState = JSON.parse(fs.readFileSync(TURN_STATE, 'utf8').replace(/^\uFEFF/, '')) } catch { turnState = {} }
  if (!turnState || typeof turnState !== 'object') turnState = {}
  return turnState
}
function writeTurnState() {
  try {
    // 只留 90 天：状态是去重用的，不是历史；原文在 live，删状态不删原文。
    const cutoff = Date.now() - 90 * 86400000
    for (const [k, v] of Object.entries(turnState || {})) {
      const t = Date.parse(v?.at || '')
      if (Number.isFinite(t) && t < cutoff) delete turnState[k]
    }
    fs.mkdirSync(path.dirname(TURN_STATE), { recursive: true })
    const tmp = `${TURN_STATE}.${crypto.randomBytes(4).toString('hex')}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(turnState || {}, null, 0), 'utf8')
    fs.renameSync(tmp, TURN_STATE)
  } catch { /* 写不了状态就多写一次，不丢原文 */ }
}

/** 这一轮落过没有：补抄前先问一句，落过就别再补。 */
export function turnBlockState(key) {
  return readTurnState()[key] || null
}

/**
 * 落一整轮。markdown 里已含全部标记；这里只负责放对文件、去重、接记忆链。
 * @returns {{ok:boolean, file?:string, line?:number, skipped?:boolean, error?:string}}
 */
export function appendTurnBlock({
  sessionId = '', title = '', cwd = '', role = '', at = new Date(), turn = 0,
  markdown = '', json = null, summaryText = '', status = 'completed',
} = {}) {
  if (!String(markdown).trim()) return { ok: false, error: '空块' }
  const { place, date, id8, file } = liveFileFor({ sessionId, title, cwd, at })
  const key = `${sessionId}#${turn}`
  const rawHash = crypto.createHash('sha256').update(`${status}\n${markdown}`).digest('hex').slice(0, 16)
  const state = readTurnState()
  if (state[key]?.hash === rawHash) return { ok: true, file: state[key].file, line: state[key].line, skipped: true }
  const { before } = ensureHeader(file, { title, who: ROLE_NAME[role] || '她', place, id8, at, role })
  fs.appendFileSync(file, `${markdown.trimEnd()}\n\n`, 'utf8')
  lineCache.set(file, before + newlines(`${markdown.trimEnd()}\n\n`))
  // ref 要指向 ### 轮次头，不指前面的 <!-- turn=... --> 标记；old refine 的 readTurn 只认 ###。
  const headOffset = String(markdown).split(/\r?\n/).findIndex((l) => /^###/.test(l))
  const line = before + 1 + Math.max(0, headOffset)
  state[key] = { hash: rawHash, file, line, at: new Date().toISOString(), status }
  writeTurnState()

  // 过渡筛选：决定这一轮要不要进待提炼；手抄本仍记，投影仍全。
  const filter = classifyEntry({ text: summaryText, who: ROLE_NAME[role] || '她' })
  if (json) json.filter = { ...filter, version: FILTER_VERSION }

  // 先接粗提链，拿到它写下的 coarse/pending 指针；turns 这一行要把所有指针一次写全。
  const chain = (() => {
    try {
      const rel = path.relative(HOME, file).replace(/\\/g, '/')
      return ingestTurn({
        channel: place,
        day: date,
        session: path.basename(file).replace(/\.md$/, ''),
        role,
        who: ROLE_NAME[role] || '她',
        at: `${date}T${clock(at)}`,
        text: String(summaryText || '').trim(),
        ref: `${rel}:${line}`,
        line,
        base: path.basename(file),
        file,
        // 手抄本只留索引卡，别把整块标记灌进去；正文仍只在 live 一份。
        body: `### 第 ${turn} 轮\n${String(summaryText || '').trim()}`,
        turnId: `${sessionId}#${turn}`,
        sessionId,
        turn: Number(turn) || 0,
        keep: filter.keep,
        filterWhy: filter.why,
      })
    } catch (e) { return { ok: false, err: String(e?.message || e).slice(0, 80), at: Date.now() } }
  })()

  // 思考 JSONL：一行一轮；refs 把 raw/live/coarse/pending 一次指全，之后 inuse 再补。
  if (json) {
    try {
      const rel = path.relative(HOME, file).replace(/\\/g, '/')
      const refs = {
        raw: String(json.source?.rawFile || ''),
        live: `${rel}#L${line}`,
        coarse: chain?.refs?.coarse ? [chain.refs.coarse] : [],
        pending: chain?.refs?.pending ? [chain.refs.pending] : [],
        inuse: [],
      }
      const dir = path.join(dataRoot(HOME), '思考', 'turns')
      fs.mkdirSync(dir, { recursive: true })
      fs.appendFileSync(path.join(dir, `${date}.jsonl`), `${JSON.stringify({ ...json, refs, ref: { file, line } })}\n`, 'utf8')
    } catch { /* 记不下不影响原文 */ }
  }
  return { ok: true, file, line, chain }
}
