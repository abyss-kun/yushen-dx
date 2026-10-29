// 说话：给她递话，但不每次都把她叫醒。
//
// 2026-10-29 为什么有这个：
//   昨晚 19:00 之后，我把管家叫醒了 28 次（回了 40 条），助手/顾问各 4 次。
//   其中不少是"补一句""撤回""再说一句"——每次都是一次模型调用、一次打断。
//   钱不多（约 1.4 元），但**打断是真的**：她手上可能正跑着活。
//
// 规矩（我自己守，不靠记性）：
//   1. 深夜（22:30–08:30）非紧急不叫醒，先排队
//   2. 同一件事只说一次：排队时如果已有同一话题，合并
//   3. 紧急（她在等结论 / 出了事 / 她问我的）→ 立刻说
//   4. 每次说完，打印这次大概花了多少
//
// 用法：
//   node scripts/tell.mjs --role dayu --text "……"            （按规矩：深夜排队，白天直发）
//   node scripts/tell.mjs --role dayu --text "……" --urgent   （立刻叫醒）
//   node scripts/tell.mjs --role dayu --flush                （把排队的合成一条发出去）
//   node scripts/tell.mjs --role dayu --list                 （看排了哪些）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const flag = (k, d = '') => { const i = args.indexOf(`--${k}`); return i >= 0 ? String(args[i + 1] ?? d) : d }
const has = (k) => args.includes(`--${k}`)
const ROLE = flag('role', 'dayu')
const TEXT = flag('text', '')
const URGENT = has('urgent')
const FLUSH = has('flush')
const LIST = has('list')

const QUIET_FROM = 22.5   // 22:30
const QUIET_TO = 8.5      // 08:30
const COST_MEDIAN = 0.04

const queueFile = path.join(DATA, 'runtime', ROLE, 'pending-tell.jsonl')
const readQueue = () => {
  try {
    return fs.readFileSync(queueFile, 'utf8').split(/\r?\n/).filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
const writeQueue = (rows) => {
  fs.mkdirSync(path.dirname(queueFile), { recursive: true })
  fs.writeFileSync(queueFile, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8')
}
const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 }
const inQuiet = () => { const h = hourNow(); return h >= QUIET_FROM || h < QUIET_TO }

function creds() {
  const token = fs.readFileSync(path.join(DATA, 'api-token'), 'utf8').trim()
  const base = fs.readFileSync(path.join(DATA, 'base-url'), 'utf8').trim()
  return { token, base }
}

async function say(text) {
  const { token, base } = creds()
  const res = await fetch(`http://${base}/api/dayu/residence/say`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', 'x-yushen-token': token },
    body: JSON.stringify({ role: ROLE, text }),
  })
  const body = await res.text()
  return { ok: res.ok, body }
}

if (LIST) {
  const q = readQueue()
  console.log(`排着 ${q.length} 条（${ROLE}）：`)
  for (const r of q) console.log(`  ${r.at}  ${String(r.text).replace(/\s+/g, ' ').slice(0, 70)}`)
  process.exit(0)
}

if (FLUSH) {
  const q = readQueue()
  if (!q.length) { console.log('没有排队的。'); process.exit(0) }
  const merged = q.map((r) => r.text).join('\n\n')
  const r = await say(`（攒着的几条，一起说）\n\n${merged}`)
  if (r.ok) { writeQueue([]); console.log(`发出去 ${q.length} 条，合并成 1 次说话（约 ${COST_MEDIAN} 元）`) }
  else { console.log(`发送失败，排队保留：${r.body.slice(0, 120)}`); process.exit(1) }
  process.exit(0)
}

if (!TEXT) {
  console.log('用法：--role dayu --text "……" [--urgent] | --flush | --list')
  process.exit(1)
}

const quiet = inQuiet()
const q = readQueue()

if (quiet && !URGENT) {
  fs.mkdirSync(path.dirname(queueFile), { recursive: true })
  fs.appendFileSync(queueFile, `${JSON.stringify({ at: new Date().toISOString(), text: TEXT })}\n`, 'utf8')
  console.log(`深夜（${new Date().toTimeString().slice(0, 5)}）——不叫醒她，先排队（现在 ${q.length + 1} 条）。`)
  console.log('  明天用 --flush 一次说完；真要紧就 --urgent。')
  process.exit(0)
}

const r = await say(TEXT)
console.log(r.ok ? `已叫醒 ${ROLE} 说了一句（约 ${COST_MEDIAN} 元）` : `发送失败：${r.body.slice(0, 160)}`)
process.exit(r.ok ? 0 : 1)
