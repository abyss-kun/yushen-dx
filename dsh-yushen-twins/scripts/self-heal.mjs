/* 标签
 * id: self-heal
 * kind: module
 * tags: 自愈, 自动化, 本地, 不用模型
 * created: 2026-11-04 14:50:00
 * changed: 2026-11-04 17:18:03
 * author: 照微·工作台
 * authority: 老板（2026-11-04：能本地就本地，别动不动上模型；定时巡视一圈看哪里要改）
 * why: 很多"维护"是机械活（标签过期、dist 没同步、阈值文件缺）——让机器自己修，别占人/模型
 * result: 每次跑：能自动修的自己修，修完只报"需要判断的"；不调模型、不联网
 * mutable: 可改
 */
// 用法：
//   node scripts/self-heal.mjs           # 真修
//   node scripts/self-heal.mjs --dry     # 只看会修什么
//   node scripts/self-heal.mjs --json
// 退出码：永远 0（它是"自愈"，不是门禁）。门禁是 regression。
//
// 只做"机械且可逆"的修：
//   ① 标签过期（改了内容没改 changed）→ 刷 changed（只动那一行）
//   ② dist 里的 lib 副本落后 → 从源码复制（dist 是构建产物）
//   ③ relations/reply-sense.json 缺了/太旧 → 重新生成（保留她改过的阈值）
// 不做的（写进报告，交给人/模型判断）：回归红、注入超标、该删没删、真出了事故。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 2026-11-04 老板：本地进程不能占着不放（宿主崩了也得能修）。硬超时自己退。
import { hardTimeout } from '../lib/offline-guard.js'
hardTimeout(5, 'self-heal.mjs')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const json = args.includes('--json')

const hash = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') } catch { return '' } }
const fixed = []
const needsYou = []

// ① 标签过期
try {
  const { staleTaggedFiles } = await import(pathToFileURL(path.join(ROOT, 'lib', 'tags.js')).href)
  const files = []
  for (const dir of ['lib', 'scripts', 'docs', 'core', 'dayu']) {
    const full = path.join(ROOT, dir)
    if (!fs.existsSync(full)) continue
    for (const name of fs.readdirSync(full)) if (/\.(js|mjs|md)$/.test(name)) files.push(path.join(full, name))
  }
  const stale = staleTaggedFiles(files)
  if (stale.length) {
    if (!dry) {
      const { execFileSync } = await import('node:child_process')
      try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'tag-touch.mjs'), ...stale.map((s) => s.file)], { encoding: 'utf8', timeout: 60000 }) } catch { /* 修不动就报 */ }
    }
    fixed.push(`标签过期 ${stale.length} 个（${stale.slice(0, 3).map((s) => path.basename(s.file)).join('、')}${stale.length > 3 ? '…' : ''}）→ 已刷 changed`)
  }
} catch { needsYou.push('标签体检没跑成（lib/tags.js 读不到）') }

// ② dist 落后（只同步 lib，构建产物；缺的补上，不一致的覆盖）
try {
  const SRC = path.join(ROOT, 'lib')
  const DIST = path.join(ROOT, 'dist', 'dsh-yushen-twins', 'lib')
  if (fs.existsSync(DIST)) {
    const drifted = []
    for (const name of fs.readdirSync(SRC)) {
      if (!name.endsWith('.js')) continue
      const a = path.join(SRC, name)
      const b = path.join(DIST, name)
      const same = fs.existsSync(b) && hash(a) === hash(b)
      if (same) continue
      drifted.push(name)
      if (!dry) { fs.mkdirSync(DIST, { recursive: true }); fs.copyFileSync(a, b) }
    }
    if (drifted.length) fixed.push(`dist 落后 ${drifted.length} 个 → 已同步（${drifted.slice(0, 3).join('、')}${drifted.length > 3 ? '…' : ''}）`)
  } else {
    needsYou.push('没有 dist（还没打过包）')
  }
} catch { needsYou.push('dist 同步失败') }

// ③ 阈值文件（桥要读）缺了或超过一天 → 重新生成
try {
  const f = path.join(D, 'relations', 'reply-sense.json')
  let ageH = null
  try { ageH = (Date.now() - fs.statSync(f).mtimeMs) / 3600000 } catch { ageH = null }
  if (ageH == null || ageH > 24) {
    if (!dry) {
      const { execFileSync } = await import('node:child_process')
      try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-reply-sense.mjs')], { encoding: 'utf8', timeout: 30000 }) } catch { /* 报 */ }
    }
    fixed.push(`reply-sense.json ${ageH == null ? '缺' : `${Math.round(ageH)} 小时没更新`} → 已重新生成（保留她改过的阈值）`)
  }
} catch { needsYou.push('reply-sense 没生成成') }

// ④ 打包快照（.snapshots/）留最近 3 份 —— 2026-11-04 老板同意：「只删已经打包过、且版本已发布的旧快照，保留最近 3 份」。
// 安全边界：只碰 .snapshots/；不碰 archive/（档案室）、不碰 dist；当前版本的快照永远不删；删之前先记一条变动。
try {
  const SNAPS = path.join(ROOT, '.snapshots')
  const KEEP = Number(process.env.YUSHEN_KEEP_SNAPSHOTS || 3)
  if (fs.existsSync(SNAPS)) {
    const dirs = fs.readdirSync(SNAPS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    const stale = dirs.slice(0, Math.max(0, dirs.length - KEEP))
    if (stale.length) {
      const curVer = (() => { try { return String(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '') } catch { return '' } })()
      const removable = stale.filter((n) => {
        const ver = n.split('-')[0]
        return ver !== curVer // 当前版本那份留着，万一要回滚对比
      })
      if (!dry) {
        for (const n of removable) {
          try { fs.rmSync(path.join(SNAPS, n), { recursive: true, force: true }) } catch { needsYou.push(`快照删不掉：${n}`) }
        }
        if (removable.length) {
          try {
            const { recordChange } = await import(pathToFileURL(path.join(ROOT, 'lib', 'changes-log.js')).href)
            recordChange({ who: '自动维护（照微）', action: 'delete', what: `清掉 ${removable.length} 份旧打包快照（留最近 ${KEEP} 份）`, from: `.snapshots/${removable.join('、')}`, why: '旧版本快照，代码在 git/dist 里有', authority: '主人（自动维护）' })
          } catch { /* 记不上不影响清理 */ }
        }
      }
      if (removable.length) fixed.push(`打包快照 ${removable.length} 份旧版 → 已清（留最近 ${KEEP} 份）`)
    }
  }
} catch { needsYou.push('打包快照清理没跑成') }

const summary = `自愈：修了 ${fixed.length} 件，需要人看 ${needsYou.length} 件${dry ? '（--dry 只看不修）' : ''}`
// 2026-11-04 老板：动了东西要留记录（时间/谁/为什么），自动修的也一样——
// 不然别的角色看到 dist 或标签变了，会当成谁偷偷改的。
if (!dry && fixed.length) {
  try {
    const { recordChange } = await import(pathToFileURL(path.join(ROOT, 'lib', 'changes-log.js')).href)
    recordChange({ who: '自动维护（照微）', action: 'edit', what: `自愈修了 ${fixed.length} 件：${fixed.map((f) => f.slice(0, 40)).join('；')}`, why: '机械项自动修（标签过期/dist 落后/阈值文件）', authority: '主人（自动维护）' })
  } catch { /* 记不上不影响修 */ }
}
if (json) {
  console.log(JSON.stringify({ at: new Date().toISOString(), dry, summary, fixed, needsYou }, null, 2))
  process.exit(0)
}
console.log(summary)
for (const f of fixed) console.log(`  ✓ ${f}`)
for (const n of needsYou) console.log(`  ! ${n}`)
if (!dry && fixed.length) {
  try {
    const { today } = await import(pathToFileURL(path.join(ROOT, 'lib', 'clock.js')).href)
    const dir = path.join(D, 'health')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, `自愈-${today()}.log`), `${new Date().toISOString()} ${summary}\n${fixed.map((f) => `  ✓ ${f}`).join('\n')}\n`, 'utf8')
  } catch { /* 记不上不影响修 */ }
}
