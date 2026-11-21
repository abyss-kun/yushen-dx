// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 外面装的插件留一份本地离线包：npm 上删了、网断了、装坏了，都能从本地放回去。
//
// 只处理 profile 里 **spec 是版本号**（npm 装的）依赖；link 的是本地目录，不归它管。
// 备份的是「安装后的整棵目录」（含它自己的 node_modules），恢复时原样拷回去，不需要联网。
//
// 用法：
//   node scripts/backup-external-plugins.mjs           备份到 D:\DSH\库\插件-离线包
//   node scripts/backup-external-plugins.mjs --json    给机器读
//   node scripts/backup-external-plugins.mjs --list    看已备份了什么
//   node scripts/backup-external-plugins.mjs --restore dsh-read-animation --apply
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE = process.env.DSH_PROFILE_DIR || path.join(os.homedir(), '.dsh', 'profiles', 'desktop')
const TARGET = process.env.YUSHEN_PLUGIN_CACHE || 'D:/DSH/库/插件-离线包'
const argv = process.argv.slice(2)
const asJson = argv.includes('--json')
const doList = argv.includes('--list')
const doRestore = argv.includes('--restore')
const apply = argv.includes('--apply')

const npmDeps = () => {
  const j = JSON.parse(fs.readFileSync(path.join(PROFILE, 'package.json'), 'utf8'))
  return Object.entries(j.dependencies || {}).filter(([, spec]) => /^[~^]?\d/.test(String(spec)))
}

const dirOf = (name) => path.join(PROFILE, 'node_modules', name)

function treeSize(dir) {
  let files = 0, bytes = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile()) { files += 1; try { bytes += fs.statSync(p).size } catch { /* 跳过 */ } }
    }
  }
  try { walk(dir) } catch { /* 目录没了 */ }
  return { files, bytes }
}

function hashOf(dir) {
  const h = crypto.createHash('sha256')
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.isFile()) continue
      h.update(path.relative(dir, p).replaceAll('\\', '/'))
      try { h.update(fs.readFileSync(p)) } catch { /* 读不了就不进哈希 */ }
    }
  }
  walk(dir)
  return h.digest('hex').slice(0, 16)
}

if (doList) {
  if (!fs.existsSync(TARGET)) { console.log('还没有离线包目录：' + TARGET); process.exit(0) }
  const rows = fs.readdirSync(TARGET, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
    const man = path.join(TARGET, e.name, 'manifest.json')
    let m = null
    try { m = JSON.parse(fs.readFileSync(man, 'utf8')) } catch { /* 旧目录没有清单 */ }
    return { dir: e.name, name: m?.name || e.name, version: m?.version || '?', files: m?.files, mb: m?.bytes ? (m.bytes / 1048576).toFixed(1) : undefined, at: m?.at }
  })
  if (asJson) console.log(JSON.stringify(rows, null, 1))
  else for (const r of rows) console.log(`${r.name}@${r.version}\t${r.files ?? '?'} 个文件\t${r.mb ?? '?'} MB\t${r.at || ''}`)
  process.exit(0)
}

if (doRestore) {
  const name = argv[argv.indexOf('--restore') + 1]
  if (!name) { console.error('用法：--restore <包名> [--apply]'); process.exit(2) }
  if (!fs.existsSync(TARGET)) { console.error('离线包目录不存在'); process.exit(2) }
  const cands = fs.readdirSync(TARGET).filter((d) => d.startsWith(name + '-') || d === name)
  if (!cands.length) { console.error(`没有 ${name} 的离线包`); process.exit(2) }
  const dir = path.join(TARGET, cands.sort().pop())
  const dest = dirOf(name)
  console.log(`离线包：${dir}`)
  console.log(`目标：${dest}`)
  if (!apply) { console.log('\n这是预览（只读）。加 --apply 才会真拷回去。'); process.exit(0) }
  if (fs.existsSync(dest)) {
    const bak = `${dest}.bak-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`
    fs.renameSync(dest, bak)
    console.log('现网旧目录已改名留档：' + bak)
  }
  fs.cpSync(dir, dest, { recursive: true })
  console.log('✅ 已拷回：' + dest)
  console.log('下一步：在 profile 里跑一次 pnpm install（重建链接），然后重启 DSH')
  process.exit(0)
}

// 默认：备份
if (!fs.existsSync(TARGET)) fs.mkdirSync(TARGET, { recursive: true })
const results = []
for (const [name, spec] of npmDeps()) {
  const src = dirOf(name)
  if (!fs.existsSync(src)) { results.push({ name, spec, ok: false, reason: 'profile 里没有安装目录' }); continue }
  let version = '?'
  try { version = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version } catch { /* 版本读不到 */ }
  const dirName = `${name.replace(/[\\/]/g, "__")}-${version}`
  const dest = path.join(TARGET, dirName)
  const size = treeSize(src)
  // 同名版本已存过且文件数一致就跳过（大目录不反复拷）
  let skip = false
  if (fs.existsSync(dest)) {
    try {
      const old = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8'))
      skip = old.files === size.files && old.hash === hashOf(src) && old.deps !== undefined
    } catch { skip = false }
  }
  if (!skip) {
    fs.rmSync(dest, { recursive: true, force: true })
    fs.cpSync(src, dest, { recursive: true })
  }
  // 把它的依赖也塞进离线包：pnpm 把依赖提升到 profile 顶层，只拷插件目录的话，
  // 装回去时 sharp 之类还是找不到（等于没备）。拷进 dest/node_modules/<dep> 后，
  // 恢复时一起放回去，node 会先在这里找到。
  let depCount = 0
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'))
    const deps = Object.keys(pkg.dependencies || {})
    for (const dep of deps) {
      const from = dirOf(dep)
      if (!fs.existsSync(from)) continue
      const to = path.join(dest, 'node_modules', dep)
      if (fs.existsSync(to)) continue
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.cpSync(from, to, { recursive: true })
      depCount += 1
    }
  } catch { /* 依赖拷不了就只备插件本体，清单里会少依赖 */ }
  try { depCount = Math.max(depCount, fs.readdirSync(path.join(dest, 'node_modules')).length) } catch { /* 没有依赖目录 */ }

  const manifest = { name, version, spec, files: size.files, bytes: size.bytes, hash: hashOf(src), deps: depCount, at: new Date().toISOString(), from: src }
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n', 'utf8')
  results.push({ name, spec, version, ok: true, skipped: skip, dir: dest, files: size.files, mb: Number((size.bytes / 1048576).toFixed(1)) })
}

// 只留每个包最新一份（旧的同包目录删掉，避免堆积）
const keep = new Map()
for (const r of results.filter((x) => x.ok)) keep.set(r.name, path.basename(r.dir))
for (const e of fs.readdirSync(TARGET, { withFileTypes: true })) {
  if (!e.isDirectory()) continue
  const name = [...keep.keys()].find((n) => e.name.startsWith(n + '-'))
  if (name && e.name !== keep.get(name)) fs.rmSync(path.join(TARGET, e.name), { recursive: true, force: true })
}

if (asJson) console.log(JSON.stringify({ target: TARGET, at: new Date().toISOString(), results }, null, 1))
else {
  console.log('离线包目录：' + TARGET)
  for (const r of results) {
    if (r.ok) console.log(`  ✅ ${r.name}@${r.version}  ${r.files} 个文件 / ${r.mb} MB${r.skipped ? '（未变，跳过拷贝）' : ''}`)
    else console.log(`  ⚠ ${r.name}: ${r.reason}`)
  }
  console.log('恢复：node scripts/backup-external-plugins.mjs --restore <包名> --apply')
}
