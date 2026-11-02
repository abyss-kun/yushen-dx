// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 还原演练：把最新一份保护快照还原到隔离家目录，验证"她能不能被救回来"。
//
// 为什么要有这个：2026-10-31 老板点出——做了备份却从没验证过能不能还原；
// 第一次演练就抓到一个真缺口：快照的根是按 id 存的，还原时必须映射回
// `家目录/dayu/<id>` 和 `家目录/repo`，直接平铺会得到一个"看着有文件、读不出人"的家。
//
// 用法：
//   node scripts/restore-drill.mjs            # 用最新快照
//   node scripts/restore-drill.mjs <snapshotId>
//   node scripts/restore-drill.mjs --keep     # 保留临时家目录，方便进去看
//
// 退出码：0 = 三个角色都读得到；1 = 有缺口。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const P = path.resolve(here, '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const store = path.join(HOME, 'dayu', 'protection', 'store')
const cfg = JSON.parse(fs.readFileSync(path.join(HOME, 'dayu', 'protection', 'config.json'), 'utf8').replace(/^\uFEFF/, ''))

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const id = args.find((a) => !a.startsWith('--')) || fs.readdirSync(path.join(store, 'snapshots')).filter((n) => n.endsWith('.json')).sort().pop().replace(/\.json$/, '')

// 还原树必须长成家目录的样子：dayu/<rootId>，插件根进 repo/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-drill-'))
const mapped = cfg.roots.map((r) => ({ id: r.id, path: r.id === 'plugin' ? path.join(tmp, 'repo') : path.join(tmp, 'dayu', r.id) }))

// 2026-11-02 小鱼：演练和定时备份抢同一把写锁——撞上就报 `store busy: live writer owns lock`
// 直接失败、不重试。第一次演练（11-01 12:08）就是这么被挡回去的，等锁释放重跑才过。
// 备份一般几秒就写完，所以这里等一等再试，比"演练白跑一趟"划算。
const busyLock = (e) => /store busy/i.test(String(e?.message || ''))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function withLockRetry(label, fn, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) {
      if (!busyLock(e) || i === tries - 1) throw e
      console.error(`  ${label}：备份正在写，等 5 秒再试（${i + 1}/${tries - 1}）`)
      await sleep(5000)
    }
  }
}

const engine = await import(pathToFileURL(P + '/lib/versioned-backup.js').href)
await withLockRetry('校验快照', () => engine.verifySnapshot({ store, id, maxFileBytes: cfg.maxFileBytes }))
await withLockRetry('还原快照', () => engine.restoreSnapshot({ store, id, roots: mapped, apply: true, maxFileBytes: cfg.maxFileBytes }))

// 核对：快照里每个文件与现网比
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}
let same = 0, diff = 0, gone = 0
for (const r of mapped) {
  if (!fs.existsSync(r.path)) continue
  const liveRoot = cfg.roots.find((x) => x.id === r.id).path
  for (const f of walk(r.path)) {
    const live = path.join(liveRoot, path.relative(r.path, f))
    if (!fs.existsSync(live)) { gone++; continue }
    fs.readFileSync(f).equals(fs.readFileSync(live)) ? same++ : diff++
  }
}

// 用隔离家目录加载她的魂
process.env.DSH_HOME = tmp
const soul = await import(pathToFileURL(P + '/lib/soul.js').href)
const persona = soul.readPersona()
const rows = []
let ok = Boolean(persona)
for (const role of ['dayu', 'xiaoyu', 'dragon']) {
  const card = soul.readCard(role, 'desk')
  const mem = soul.readMemory(role)
  if (!card || !mem.available) ok = false
  rows.push(`${role}: 卡 ${card ? card.chars + ' 字' : '缺失'} / 记忆 ${mem.available ? mem.events.length + ' 条' : '缺失'}`)
}

console.log(`快照 ${id} → ${tmp}`)
console.log(`核对：一样 ${same}，备份后被改过 ${diff}，现网已没有 ${gone}`)
console.log(`本体：${persona ? 'v' + persona.version : '缺失'}`)
for (const row of rows) console.log('  ' + row)
if (!keep) { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* 删不掉留着 */ } }
else console.log('（保留临时家：', tmp, '）')
console.log(ok ? '✓ 演练通过：三个角色都能从备份里读回来' : '✗ 演练失败：有角色读不回来')
process.exit(ok ? 0 : 1)
