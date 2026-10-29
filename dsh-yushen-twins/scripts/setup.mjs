// 一条命令装好：把鱼神挂进 DSH 的某个 profile。
//
//   node scripts/setup.mjs                      装（自动找 profile）
//   node scripts/setup.mjs --profile desktop    指定 profile
//   node scripts/setup.mjs --check              只查：装的那份和源码差在哪
//   node scripts/setup.mjs --update             就地更新（junction 重建 + 补挂载）
//
// 做三件事，别的不做：
//   1. 在 profile 的 node_modules 里建一个指向本仓库的 junction（不改源码、不复制）
//   2. 在 profile 的 cordis.patch.yml 里确保有一段挂载（幂等，改前自动备份）
//   3. 打印"下一步"（重启 DSH；要建角色就跑 first-run）
//
// 它**不碰**：别人的插件条目、DSH 内核、正在跑的数据。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const NAME = PKG.name || 'dsh-yushen-twins'
const VERSION = PKG.version || '0.0.0'

const args = process.argv.slice(2)
const flag = (k, d = '') => { const i = args.indexOf(`--${k}`); return i >= 0 ? String(args[i + 1] || d) : d }
const has = (k) => args.includes(`--${k}`)
const CHECK = has('check')
const UPDATE = has('update')

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const PROFILES = path.join(HOME, 'profiles')
const say = (s = '') => console.log(s)
const die = (s) => { console.error(`\n❌ ${s}\n`); process.exit(1) }

if (!fs.existsSync(PROFILES)) die(`找不到 DSH 的 profiles 目录：${PROFILES}\n（先装 DeepSeek Harness，或设 DSH_HOME）`)

// ── 选 profile ──────────────────────────────────────────────
function listProfiles() {
  return fs.readdirSync(PROFILES, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
}
function installedIn(profile) {
  const p = path.join(PROFILES, profile, 'node_modules', NAME)
  try { return fs.existsSync(p) } catch { return false }
}
function autoProfile() {
  const all = listProfiles()
  const installed = all.filter(installedIn)
  if (installed.length) return installed[0]
  if (all.includes('desktop')) return 'desktop'
  if (all.includes('web')) return 'web'
  return all[0] || ''
}
const profileName = flag('profile') || autoProfile()
const profileDir = path.join(PROFILES, profileName)
if (!profileName || !fs.existsSync(profileDir)) die(`profile 不存在：${profileName || '(空)'}\n可用的：${listProfiles().join(' / ')}`)

const patchFile = path.join(profileDir, 'cordis.patch.yml')
const linkPath = path.join(profileDir, 'node_modules', NAME)
const MARK_BEGIN = '# === yushen-posts BEGIN ==='
const MARK_END = '# === yushen-posts END ==='

// ── 现状 ───────────────────────────────────────────────────
function linkTarget() {
  try {
    const st = fs.lstatSync(linkPath)
    if (!st.isSymbolicLink()) return { kind: 'dir', target: linkPath }
    return { kind: 'link', target: fs.readlinkSync(linkPath) }
  } catch { return null }
}
function patchState() {
  if (!fs.existsSync(patchFile)) return { exists: false, hasBlock: false, hasEntry: false }
  const t = fs.readFileSync(patchFile, 'utf8')
  return { exists: true, hasBlock: t.includes(MARK_BEGIN), hasEntry: new RegExp(`name:\\s*${NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t) }
}
function sourceStamp() {
  const files = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', 'archive'].includes(e.name)) continue
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|mjs|json|yml|md)$/.test(e.name)) files.push(p)
    }
  }
  walk(ROOT)
  let newest = 0
  for (const f of files) { try { newest = Math.max(newest, fs.statSync(f).mtimeMs) } catch { /* 忽略 */ } }
  return { count: files.length, newest: new Date(newest).toISOString() }
}

// ── 动作 ───────────────────────────────────────────────────
function ensureLink() {
  const cur = linkTarget()
  if (cur && cur.kind === 'link') {
    const target = path.resolve(cur.target)
    if (target === ROOT) return { ok: true, action: '已就位' }
    if (!UPDATE) return { ok: false, action: `junction 指向别处：${target}（要改跑 --update）` }
    fs.rmSync(linkPath, { force: true })
  } else if (cur && cur.kind === 'dir') {
    if (!UPDATE) return { ok: false, action: '已存在一个真实目录（不是链接）；要替换跑 --update' }
    fs.rmSync(linkPath, { recursive: true, force: true })
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  // Windows 用目录联接（不需要管理员）；其它平台用软链
  if (process.platform === 'win32') {
    execFileSync('cmd', ['/c', 'mklink', '/J', linkPath, ROOT], { stdio: 'pipe' })
  } else {
    fs.symlinkSync(ROOT, linkPath, 'dir')
  }
  return { ok: true, action: '已建立 junction' }
}

function ensurePatch() {
  const st = patchState()
  if (!st.exists) {
    fs.writeFileSync(patchFile, `${MARK_BEGIN}\n- insert:\n    - id: yushen\n      name: ${NAME}\n${MARK_END}\n`, 'utf8')
    return { ok: true, action: '新建了 patch 文件' }
  }
  const text = fs.readFileSync(patchFile, 'utf8')
  if (st.hasEntry) return { ok: true, action: '挂载已在（没动）' }
  const block = `\n${MARK_BEGIN}\n- insert:\n    - id: yushen\n      name: ${NAME}\n${MARK_END}\n`
  const backup = `${patchFile}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
  fs.copyFileSync(patchFile, backup)
  fs.appendFileSync(patchFile, block, 'utf8')
  return { ok: true, action: `追加了挂载段（原文件备份：${path.basename(backup)}）` }
}

// ── 跑 ─────────────────────────────────────────────────────
const stamp = sourceStamp()
say(`鱼神 setup · v${VERSION}`)
say(`  源：${ROOT}`)
say(`  profile：${profileName}（${profileDir}）`)
say(`  源码：${stamp.count} 个文件，最新改动 ${stamp.newest}`)
say('')

if (CHECK) {
  const link = linkTarget()
  const st = patchState()
  say('检查结果：')
  say(`  ${link ? (link.kind === 'link' && path.resolve(link.target) === ROOT ? '✅' : '⚠️ ') : '❌'} junction：${link ? `${link.kind} → ${link.target}` : '没有装'}`)
  say(`  ${st.hasEntry ? '✅' : '❌'} cordis.patch.yml 挂载：${st.hasEntry ? '在' : '没有'}${st.hasBlock ? '（有 yushen-posts 段）' : ''}`)
  const srcVer = VERSION
  let instVer = ''
  try { instVer = JSON.parse(fs.readFileSync(path.join(linkPath, 'package.json'), 'utf8')).version } catch { /* 没装 */ }
  say(`  版本：源 ${srcVer} / 装的 ${instVer || '(未知)'}`)
  say('')
  const ok = link && link.kind === 'link' && path.resolve(link.target) === ROOT && st.hasEntry
  say(ok ? '→ 装着呢。改了源码不用重装（junction 直接指向源码）。' : '→ 没装好，跑 node scripts/setup.mjs')
  process.exit(ok ? 0 : 1)
}

const r1 = ensureLink()
say(`${r1.ok ? '✅' : '⚠️ '} ${r1.action}`)
if (!r1.ok) die(r1.action)
const r2 = ensurePatch()
say(`${r2.ok ? '✅' : '⚠️ '} ${r2.action}`)
if (!r2.ok) die(r2.action)

say('')
say('下一步：')
say('  1) 重启 DSH（插件是启动时装配的，不热装）')
say('  2) 第一次用：node scripts/first-run.mjs（建空白角色 + 宪章）')
say('  3) 装完自检：node scripts/setup.mjs --check')
