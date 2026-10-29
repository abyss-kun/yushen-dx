// 公告：两个层级
//   board/公告.md       总公告，所有人都看
//   board/<role>.md     自己的板：另一个自己在哪儿、干了什么
//
// 三个档，按 token 花。档位存在 board/config.json，改一个字就换档。
// 只读本地，不调模型。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const BOARD = path.join(DATA, 'board')
const CONFIG = path.join(BOARD, 'config.json')

/** 三档：给多少条、给不给详情、总字数上限。 */
export const LEVELS = Object.freeze({
  low: { globalItems: 8, mineItems: 4, detail: 0, letters: 0, cap: 1500, label: '低' },
  mid: { globalItems: 16, mineItems: 8, detail: 2, letters: 3, cap: 5000, label: '中' },
  high: { globalItems: 40, mineItems: 20, detail: 8, letters: 12, cap: 20000, label: '高' },
})

export function currentLevel() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8').replace(/^\uFEFF/, ''))
    const lv = String(c?.level || 'mid')
    return LEVELS[lv] ? lv : 'mid'
  } catch {
    return 'mid'
  }
}

export function setLevel(level) {
  const lv = String(level || '').toLowerCase()
  if (!LEVELS[lv]) return { ok: false, error: `没有这一档：${lv}；可选 low / mid / high` }
  fs.mkdirSync(BOARD, { recursive: true })
  fs.writeFileSync(CONFIG, JSON.stringify({ level: lv, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
  return { ok: true, level: lv, label: LEVELS[lv].label }
}

/** 把一份公告切成条目：### 日期 时间 · 标题 + 下面的字段行 */
function parse(text) {
  const out = []
  let cur = null
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^###\s*(\d{4}-\d{2}-\d{2})[^\d]*(\d{1,2}:\d{2})?\s*[·・]\s*(.+)$/)
    if (h) {
      if (cur) out.push(cur)
      cur = { at: h[1], time: h[2] || '', title: h[3].trim(), body: [] }
      continue
    }
    if (cur) {
      if (/^##\s/.test(line)) { out.push(cur); cur = null; continue }
      if (line.trim()) cur.body.push(line.trim())
    }
  }
  if (cur) out.push(cur)
  return out
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

function field(body, names) {
  for (const line of body) {
    const m = line.match(/^[-*]\s*\*\*(.+?)\*\*[：:]\s*(.+)$/)
    if (m && names.some((n) => m[1].includes(n))) return m[2].trim()
  }
  return ''
}

export function readBoard({ role = 'dayu', level = '' } = {}) {
  const lv = LEVELS[level] ? String(level) : currentLevel()
  const spec = LEVELS[lv]
  const who = String(role || 'dayu').replace(/[\\/:*?"<>|\s]/g, '_').slice(0, 40)

  const globalItems = parse(readFileSafe(path.join(BOARD, '公告.md')))
  const mineItems = parse(readFileSafe(path.join(BOARD, `${who}.md`)))
  const lettersText = readFileSafe(path.join(DATA, 'letters', who, '收件箱.md'))

  const slim = (it) => ({
    at: it.at,
    time: it.time,
    title: it.title,
    what: field(it.body, ['什么事', '干了什么', '做了什么']),
    why: field(it.body, ['想表达什么', '为什么']),
  })

  const global = globalItems.slice(0, spec.globalItems).map(slim)
  const mine = mineItems.slice(0, spec.mineItems).map(slim)

  const detail = spec.detail > 0
    ? globalItems.slice(0, spec.detail).map((it) => ({ title: it.title, at: it.at, text: it.body.join('\n') }))
    : []

  const letters = spec.letters > 0
    ? lettersText.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^-\s+\S/.test(l) && !/^---/.test(l)).slice(-spec.letters)
    : []

  // 兜底：超了就从尾巴砍，宁可少给，不悄悄烧 token
  let size = JSON.stringify({ global, mine, detail, letters }).length
  const trim = (arr) => { while (size > spec.cap && arr.length) { arr.pop(); size = JSON.stringify({ global, mine, detail, letters }).length } }
  trim(letters); trim(detail); trim(mine); trim(global)

  return {
    ok: true,
    level: lv,
    levelLabel: spec.label,
    role: who,
    cap: spec.cap,
    used: size,
    counts: { global: global.length, mine: mine.length, detail: detail.length, letters: letters.length },
    global,
    mine,
    detail,
    letters,
    note: '低=目录几条；中=加自己板、最近两条详情、三条信箱；高=全量。改档：board/config.json 里的 level。',
  }
}
