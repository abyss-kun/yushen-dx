// 上下文用量守卫：到阈值就留一张提醒，让她在下一句里说“该换会话了”。
// 用法：
//   node scripts/check-context.mjs           # 算一次，必要时写 runtime/context-notice.json
//   node scripts/check-context.mjs --json    # 只输出数字
// 口径（2026-11-02）：按当前会话的逐轮原文大小估词元（中文约 1 字 ≈ 1 词元，
// 字节 /3 得字数，再加每轮注入的固定开销）。窗口默认 128k，可用 --window 覆盖。
// 阈值：70% 提醒一次，85% 再提醒一次（同一会话同一档只提醒一次）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const arg = (n, d = '') => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? String(process.argv[i + 1] || d) : i >= 0 ? '' : d }
const WINDOW = Number(arg('window', '128000')) || 128000
const SESSION = String(process.env.DSH_SESSION_ID || '').trim()
// 2026-11-03：回归会带着真 DSH_HOME 跑这个脚本（要读真会话量），但**测试不许往真家里写**——
// 沙箱当场会拦（context-notice.json 写到真家）。所以测试态把两个写盘路径挪到临时目录，
// 读还是读真会话。这条以前没触发，是因为上下文一直没到 70%；今天到了才炸出来。
const TEST_MODE = process.env.YUSHEN_TEST === '1'
const WRITE_HOME = TEST_MODE ? path.join(os.tmpdir(), `yushen-context-${process.pid}`) : HOME
const NOTICE = path.join(WRITE_HOME, 'dayu', 'runtime', 'context-notice.json')
const STATE = path.join(WRITE_HOME, 'dayu', 'runtime', 'context-levels.json')

// 1) 找本会话的逐轮原文（按会话 id 或最近修改）
const live = path.join(HOME, 'dayu', 'live')
const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.md')) files.push(p)
  }
}
let target = null
try {
  walk(live)
  const withId = SESSION ? files.filter((f) => f.includes(SESSION.slice(0, 8))) : []
  target = withId[0] || files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null
} catch { /* 没有原文 */ }

if (!target) {
  console.log('没有找到会话原文（临时家/新装环境），这次不量')
  process.exit(0)
}
const bytes = target ? fs.statSync(target).size : 0
const chars = Math.round(bytes / 3)            // 中文 UTF-8 约 3 字节/字
const transcriptTokens = Math.round(chars)     // 中文 1 字 ≈ 1 词元（保守）
const INJECT = 30000                           // 每轮注入的固定开销（实测约 2.9 万）
const tokens = transcriptTokens + INJECT
const ratio = tokens / WINDOW
const pct = Math.round(ratio * 100)

const level = ratio >= 0.85 ? 3 : ratio >= 0.70 ? 2 : ratio >= 0.50 ? 1 : 0
const labels = { 0: '宽裕', 1: '过半', 2: '该准备换会话', 3: '很紧，尽快换' }

let seen = {}
try { seen = JSON.parse(fs.readFileSync(STATE, 'utf8').replace(/^\uFEFF/, '')) } catch { /* 首次 */ }
const key = target ? path.basename(target) : 'unknown'
const prev = Number(seen[key] || 0)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: true, file: key, bytes, tokens, window: WINDOW, pct, level, label: labels[level] }, null, 1))
  process.exit(0)
}

if (level >= 2 && level > prev) {
  fs.mkdirSync(path.dirname(NOTICE), { recursive: true })
  fs.writeFileSync(NOTICE, JSON.stringify({
    at: new Date().toISOString(),
    pct,
    level,
    label: labels[level],
    line: level >= 3
      ? `我这边的上下文到 ${pct}% 了，很紧——建议现在就换会话（交接文档已经写好）。`
      : `我这边的上下文到 ${pct}% 了，再聊一阵就该换会话了（交接在 docs/交接-*.md）。`,
  }, null, 2) + '\n', 'utf8')
  seen[key] = level
  fs.writeFileSync(STATE, JSON.stringify(seen, null, 1) + '\n', 'utf8')
  console.log(`上下文 ${pct}%（${labels[level]}）→ 已写提醒`)
} else {
  console.log(`上下文 ${pct}%（${labels[level]}，本档已提醒过：${prev >= level ? '是' : '否'}）`)
}
