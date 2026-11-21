// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 16:12｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜scripts/check-trace.mjs:196｜提交时间那一行改走 clock.fmt｜为什么：手写偏移不是系统时间：换机器或换时区就全错，各处口径还不一致｜验证：node --check 通过；node scripts/regression.mjs 全绿；全仓扫描无手写偏移｜可改：可改（只许换成 lib/clock.js 的其他封装）
// 改｜2026-11-02 14:51｜大鱼·子会话（工作台）｜授权：主人（本次任务书：把「有案可稽」落成可自动检查的规矩）｜scripts/check-trace.mjs:1-190｜新增：查「改过的 .js/.mjs 有没有六要素留痕」；格式不在这里定义，全部从 lib/trace-standard.js 取｜为什么：规矩只写在文档里就没人查，改了没记也看不出来；但也不能逼人每行都写，只要求「这个文件至少有一条六要素齐的留痕」｜验证：node scripts/check-trace.mjs → 退出 0（本次改动 5 个文件全齐）；--files 指定缺项文件时退出 1 并列出缺哪一要素｜可改：范围与输出可改，判据不许放宽（六要素的定义在 lib/trace-standard.js）
//
// 查改动留痕：规矩生效后动过的 .js/.mjs，至少有一条六要素齐的「改｜」注释。
//
//   node scripts/check-trace.mjs                 # 默认：最近一次提交里、规矩生效后动过的文件
//   node scripts/check-trace.mjs --worktree      # 再加上还没提交的改动
//   node scripts/check-trace.mjs --files a.js,b.js
//   node scripts/check-trace.mjs --all           # 全量审计：lib/ core/ dayu/ scripts/ 一个不漏（老账也会红）
//   node scripts/check-trace.mjs --json
//
// 三条边界（老板 2026-11-02）：
//   ① 一个文件有一条就够，不要求每行——太碎会逼人写假话；
//   ② 只改注释/空白的不算改逻辑，不要留痕；
//   ③ 规矩生效（2026-11-02）之前的提交不追溯：补不出真的「谁/为什么/怎么验」，宁可不补。
// 退出码：0 = 范围内全齐；1 = 有文件缺留痕；2 = 用法/环境问题。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FIELDS, REQUIRED_FIELDS, RULE_SINCE, RULE_SINCE_MS, inspectTraceText } from '../lib/trace-standard.js'
import { fmt } from '../lib/clock.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CODE_EXT = /\.(?:js|mjs|cjs)$/i
// 产物/存档/安装副本不查：它们是打包出来的，改了也不算「改源码」。
const SKIP_DIR = /(^|\/)(?:dist|dist-lite|dist-mobile|release|archive|node_modules|\.snapshots|\.state|\.git|repair-helper|blank|kernel|preset|trial)(\/|$)/i
const FALLBACK_DIRS = ['lib', 'core', 'dayu', 'scripts']

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(`--${name}`)
const getOpt = (name) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] || '' : ''
}
const wantJson = hasFlag('json')

/** 跑一条 git 命令；拿不到就返回 null（不是仓库 / 没提交历史）。 */
function git(args) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: ROOT, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch { return null }
}

function relOf(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '')
}
const isCode = (rel) => CODE_EXT.test(rel) && !SKIP_DIR.test(rel)

/** 最近一次提交改了哪些文件（根提交也能取）。 */
// 改｜2026-11-11 01:2x｜大鱼·主代理｜授权：主人（2026-11-11：「暂时不重启，能做先做」）｜scripts/check-trace.mjs:56-61｜删掉的文件不再进"待查"（按 git 状态 D 判，不按文件在不在盘上——移出版本但没删盘的文件也算 D）｜为什么：删除提交不可能在被删文件里写「改｜」行，把它算作"缺留痕"等于要求人给死人签名（今晚删 tmp-mem-dup.mjs 就红在这）｜验证：node scripts/check-trace.mjs 绿；带删除的提交不再报该文件｜可改：只许更准（D 才跳），不许放宽"改动必须有留痕"
function lastCommitFiles() {
  const diff = git(['diff', '--name-status', 'HEAD~1', 'HEAD'])
  if (diff !== null) {
    return diff.split(/\r?\n/).map((line) => line.split('\t')).filter((p) => p.length >= 2)
      .filter((p) => String(p[0]).toUpperCase() !== 'D')   // 删掉的不查（写不进留痕）
      .map((p) => relOf(p[p.length - 1])).filter(Boolean)
  }
  const show = git(['show', '--name-only', '--format=', 'HEAD'])
  return show ? show.split(/\r?\n/).map(relOf).filter(Boolean) : []
}

/** 还没提交的改动：modified / staged / untracked（顺带记状态码，判断新文件用）。 */
function worktreeFiles() {
  const out = git(['status', '--porcelain'])
  const map = new Map()
  if (!out) return map
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue
    let p = line.slice(3).trim()
    if (p.includes(' -> ')) p = p.split(' -> ').pop()
    p = p.replace(/^"|"$/g, '')
    map.set(relOf(p), line.slice(0, 2))
  }
  return map
}

function walkCodeDirs() {
  const out = []
  const rec = (abs, rel) => {
    if (!fs.existsSync(abs)) return
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      const a = path.join(abs, e.name)
      if (e.isDirectory()) rec(a, r)
      else if (isCode(r)) out.push(r)
    }
  }
  for (const d of FALLBACK_DIRS) rec(path.join(ROOT, d), d)
  return out.sort()
}

/** 这次改动是不是只动了注释/空白（那就不是改逻辑，不要求留痕）。 */
function commentOnly(file, source, status) {
  if (source === 'worktree' && /^\?\?/.test(status || '')) return false // 新文件：整份都算实质
  const diff = source === 'worktree'
    ? git(['diff', '-U0', 'HEAD', '--', file])
    : git(['show', '-U0', '--format=', 'HEAD', '--', file])
  if (diff === null) return false
  const lines = diff.split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(?:\+\+\+|---)/.test(l))
  if (!lines.length) return true // 只有模式/改名，没有内容行
  return lines.every((l) => {
    const t = l.slice(1).trim()
    return !t || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.endsWith('*/')
  })
}

// ── 定范围 ─────────────────────────────────────────────────────────────────
const explicit = getOpt('files').split(/[,，]/).map((s) => relOf(s.trim())).filter(Boolean)
const wantAll = hasFlag('all')
const wantWorktree = hasFlag('worktree')
const inRepo = git(['rev-parse', '--is-inside-work-tree']) !== null
const headShort = (git(['rev-parse', '--short', 'HEAD']) || '').trim()
const headAt = Number((git(['log', '-1', '--format=%ct']) || '').trim() || 0) * 1000
const headOld = headAt > 0 && headAt < RULE_SINCE_MS

const candidates = [] // { file, source, status }
if (explicit.length) {
  for (const file of explicit) candidates.push({ file, source: 'explicit', status: '' })
} else if (wantAll || !inRepo) {
  for (const file of walkCodeDirs()) candidates.push({ file, source: 'all', status: '' })
} else {
  // 提交里的文件先都收进来：规矩前的进「老账」，规矩后的才判。
  for (const file of lastCommitFiles()) candidates.push({ file, source: 'commit', status: '' })
  if (wantWorktree) for (const [file, status] of worktreeFiles()) candidates.push({ file, source: 'worktree', status })
}

// 去重：同一个文件既在提交里又没提交干净时，按「更具体」的来源算（未提交 > 提交）。
const RANK = { explicit: 4, worktree: 3, commit: 2, all: 1 }
const byFile = new Map()
for (const c of candidates) {
  const prev = byFile.get(c.file)
  if (!prev || RANK[c.source] > RANK[prev.source]) byFile.set(c.file, c)
}
const unique = [...byFile.values()]

const legacy = []   // 规矩生效前动过：不判红，只报数
const skipped = []  // 只改注释/空白，或没这个文件
const scope = []    // 真要查的
for (const c of unique) {
  if (c.source !== 'explicit' && !isCode(c.file)) { skipped.push({ file: c.file, why: '不是源码文件' }); continue }
  const abs = path.join(ROOT, c.file)
  if (!fs.existsSync(abs)) { skipped.push({ file: c.file, why: '文件不在了' }); continue }
  let postRule = false
  if (c.source === 'commit') {
    // 提交本身早于规矩 → 整批老账；提交在规矩之后，再看文件本身是不是规矩后动过
    postRule = !headOld && fs.statSync(abs).mtimeMs >= RULE_SINCE_MS
  } else if (c.source === 'worktree') {
    postRule = fs.statSync(abs).mtimeMs >= RULE_SINCE_MS
  } else {
    postRule = true // --files / --all：明说要查
  }
  if (!postRule) { legacy.push(c.file); continue }
  if (c.source === 'commit' || c.source === 'worktree') {
    if (commentOnly(c.file, c.source, c.status)) { skipped.push({ file: c.file, why: '只改注释/空白' }); continue }
  }
  scope.push(c)
}

// ── 查 ─────────────────────────────────────────────────────────────────────
const passed = []
const missing = []
for (const c of scope) {
  const text = fs.readFileSync(path.join(ROOT, c.file), 'utf8')
  const r = inspectTraceText(text)
  if (r.ok) passed.push({ file: c.file, at: r.fields.at, by: r.fields.by, where: r.fields.where })
  else missing.push({ file: c.file, missing: r.missing, best: r.fields, candidates: r.candidates || 0 })
}

const ok = missing.length === 0
const out = {
  ok,
  checkedAt: new Date().toISOString(),
  since: RULE_SINCE,
  head: headShort || null,
  headOld,
  scope: explicit.length ? 'files' : wantAll ? 'all' : inRepo ? 'commit' : 'no-git',
  checked: passed,
  missing,
  legacy,
  skipped,
}

if (wantJson) {
  console.log(JSON.stringify(out, null, 1))
  process.exit(ok ? 0 : 1)
}

// ── 人看的 ─────────────────────────────────────────────────────────────────
const labels = REQUIRED_FIELDS.map((f) => f.label).join('·')
console.log(`改动留痕检查 · 规矩生效 ${RULE_SINCE.slice(0, 16).replace('T', ' ')} · 六要素：${labels}`)
if (explicit.length) console.log(`· 范围：命令行指定的 ${explicit.length} 个文件`)
else if (wantAll) console.log(`· 范围：全量 ${scope.length} 个 .js/.mjs（lib/ core/ dayu/ scripts/；老账也会判）`)
else if (!inRepo) console.log('· 范围：没找到 git，全量扫 lib/ core/ dayu/ scripts/（分不出老账，可能全红）')
else {
  const when = headAt ? fmt(new Date(headAt), 'YYYY-MM-DD HH:mm') : '?'
  console.log(`· 范围：最近一次提交 ${headShort || '?'}（${when}）${headOld ? '早于规矩生效，整批不追溯' : ''}${wantWorktree ? ' + 未提交改动' : ''}`)
}
console.log(`· 待查 ${scope.length} 个；规矩前老账 ${legacy.length} 个不追溯；跳过 ${skipped.length} 个（只改注释/空白或不是源码）`)

for (const p of passed) console.log(`  ✓ ${p.file} — ${p.at}｜${p.by}`)
if (missing.length) {
  console.log(`\n✗ ${missing.length} 个文件缺留痕：`)
  for (const m of missing) {
    const detail = m.candidates ? `（文件里有 ${m.candidates} 条留痕，但都缺）` : '（一条「改｜」都没有）'
    console.log(`  - ${m.file}：缺「${m.missing.join('、')}」${detail}`)
  }
  console.log('\n补法：在改动处上方贴一行，格式见 docs/改动留痕.md；')
  console.log('      node scripts/note-work.mjs "改了什么" --files … --evidence "怎么验的" 会直接打印现成的一行。')
} else {
  console.log(scope.length
    ? `\n✓ 全绿：待查的 ${scope.length} 个文件都有六要素留痕。`
    : `\n✓ 本次没有需要检查的文件（规矩前的老账 ${legacy.length} 个不追溯）。`)
}
if (!wantWorktree && !explicit.length && !wantAll && inRepo) {
  console.log('（还没提交的改动不在默认范围；跑 --worktree 可一起查。）')
}
process.exit(ok ? 0 : 1)
