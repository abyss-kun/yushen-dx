// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 量「源码 / 打包 / 安装副本」三处差距。只读，不写任何东西。
//
// 为什么要有它：2026-10-30 发现回归第 31 条绿着，但 dist 里的 mind-tools.js 只有 27 行、
// 连 mindToolDefs 都没有——回归测的是源码，跑的是 dist。绿是绿在源码上，跑的是旧的。
// 这条脚本把「差多少」钉成一个数，只许降不许升；每打包一次就降；降到 0 之后
// regression 里那条断言改成 assert 0（现在留 BASELINE 是为了不把已有的 22 条一次性变红）。
//
// 用法：
//   node scripts/check-dist-sync.mjs            # 人看的
//   node scripts/check-dist-sync.mjs --json     # 给回归吃
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'lib')
const DIST = path.join(ROOT, 'dist', 'dsh-yushen-twins', 'lib')
const INSTALL = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-yushen-twins', 'dist', 'dsh-yushen-twins', 'lib'
)

/** 已知差值的上限：只许降不许升（每打包一次降；降到 0 后改成 0）。 */
export const BASELINE = 0 // 2026-10-30：重新打包后缺口 0，从此只许 0

const hash = (file) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10) } catch { return null }
}

function walk(root) {
  if (!fs.existsSync(root)) return []
  const out = []
  const rec = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) rec(p, prefix + e.name + '/')
      else if (e.name.endsWith('.js')) out.push(prefix + e.name)
    }
  }
  rec(root, '')
  return out.sort()
}

export function checkDistSync() {
  const files = walk(SRC)
  const rows = files.map((rel) => {
    const src = hash(path.join(SRC, rel))
    const dist = hash(path.join(DIST, rel))
    const install = hash(path.join(INSTALL, rel))
    return { rel, src, dist, install }
  })
  const missingInDist = rows.filter((r) => !r.dist).map((r) => r.rel)
  const drift = rows.filter((r) => r.dist && r.src !== r.dist).map((r) => r.rel)
  const installMismatch = rows.filter((r) => r.dist && r.install && r.dist !== r.install).map((r) => r.rel)
  return {
    srcCount: files.length,
    distCount: rows.filter((r) => r.dist).length,
    missingInDist,
    drift,
    installMismatch,
    // 计数只算「源码有、dist 没有」+「源码改过、dist 没跟上」
    gap: missingInDist.length + drift.length,
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const r = checkDistSync()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r))
  } else {
    console.log(`源码 lib 下 .js：${r.srcCount}；dist 有：${r.distCount}`)
    console.log(`缺口：${r.gap}（上限 ${BASELINE}）＝ 缺失 ${r.missingInDist.length} + 不一致 ${r.drift.length}`)
    if (r.missingInDist.length) {
      console.log('\ndist 里根本没有（等于没发布）：')
      for (const f of r.missingInDist) console.log('  ' + f)
    }
    if (r.drift.length) {
      console.log('\n源码改过、dist 没跟上：')
      for (const f of r.drift) console.log('  ' + f)
    }
    if (r.installMismatch.length) {
      console.log('\n安装副本和 dist 不一致（应该不会发生）：')
      for (const f of r.installMismatch) console.log('  ' + f)
    }
    console.log(r.gap > BASELINE ? '\n✗ 缺口涨了：要么打包，要么把 BASELINE 改小之前先说明为什么' : '\n✓ 缺口没涨')
  }
}
