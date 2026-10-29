// 鱼神 · 入职分析（插件接入扫描）
// 插件装进来 = 员工入职：读包、登记、认人、收资产、记风险。
// 产物：~/.dsh/xiaoyu/registry/index.json（助手保管）。
//
// 只读本地文件；扫描动作本身不联网、不执行插件代码、不改插件。
// 注意：这是“扫描器”的边界，不是鱼神的边界——鱼神照常联网干活，只是不外传、不窃取。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scanCapabilities } from './capabilities.js'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const REG_DIR = path.join(HOME, 'xiaoyu', 'registry')
const INDEX = path.join(REG_DIR, 'index.json')

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.avif'])
const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac'])
const MODEL_EXT = new Set(['.moc3', '.model3.json', '.skel', '.atlas', '.glb', '.gltf', '.fbx', '.vrm'])
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', '.cache', 'backup', 'docs-snapshots'])
const MAX_FILES = 4000
const MAX_HASH_BYTES = 8 * 1024 * 1024

function sha256(file) {
  try {
    const stat = fs.statSync(file)
    if (stat.size > MAX_HASH_BYTES) return ''
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch { return '' }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function walk(root) {
  const out = []
  const stack = [root]
  while (stack.length && out.length < MAX_FILES) {
    const dir = stack.pop()
    let items = []
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const it of items) {
      if (it.name.startsWith('.')) continue
      const full = path.join(dir, it.name)
      if (it.isDirectory()) { if (!SKIP_DIR.has(it.name)) stack.push(full); continue }
      if (!it.isFile()) continue
      out.push(full)
      if (out.length >= MAX_FILES) break
    }
  }
  return out
}

/** 插件目录名 → 一条入职档案。 */
export function analyzePlugin(dir) {
  const pkg = readJson(path.join(dir, 'package.json'), {})
  const name = String(pkg.name || path.basename(dir))
  const files = walk(dir)
  const assets = []
  const counts = { files: 0, bytes: 0, image: 0, video: 0, audio: 0, model: 0 }
  for (const file of files) {
    let stat = null
    try { stat = fs.statSync(file) } catch { continue }
    counts.files += 1
    counts.bytes += stat.size
    const ext = path.extname(file).toLowerCase()
    let kind = ''
    if (IMAGE_EXT.has(ext)) kind = 'image'
    else if (VIDEO_EXT.has(ext)) kind = 'video'
    else if (AUDIO_EXT.has(ext)) kind = 'audio'
    else if (MODEL_EXT.has(ext) || /live2d|spine|vrm/i.test(file)) kind = 'model'
    if (!kind) continue
    counts[kind] += 1
    if (assets.length >= 60) continue
    assets.push({
      kind,
      rel: path.relative(dir, file).replace(/\\/g, '/'),
      bytes: stat.size,
      sha256: sha256(file),
    })
  }
  const text = ['index.js', 'lib/index.js', 'lib/client.js', 'client.js']
    .map((rel) => { try { return fs.readFileSync(path.join(dir, rel), 'utf8').slice(0, 400000) } catch { return '' } })
    .join('\n')
  const flags = {
    network: /fetch\(|https?:\/\/|WebSocket|axios/.test(text),
    exec: /child_process|execFile|spawn\(|shell:/.test(text),
    writes: /writeFile|appendFile|mkdirSync|rmSync/.test(text),
    readsHome: new RegExp(HOME.replace(/\\/g, '\\\\')).test(text) || /homedir\(\)/.test(text),
  }
  // 行为线索：不是定罪，是“值得看一眼”的清单。
  const urls = [...new Set([...text.matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => m[0]))].slice(0, 8)
  const suspicious = []
  if (/\beval\s*\(/.test(text)) suspicious.push('eval')
  if (/new\s+Function\s*\(/.test(text)) suspicious.push('new Function')
  if (/\batob\s*\(|Buffer\.from\([^)]*,\s*['"]base64['"]/.test(text)) suspicious.push('base64 解码')
  if (/child_process[\s\S]{0,120}(shell\s*:\s*true|exec\()/.test(text)) suspicious.push('shell 执行')
  // 删文件：把删的是谁都带上——只写「删除文件」的话，复核的人还得去翻源码才知道是不是它自己的标记。
  const del = text.match(/rmSync\s*\(\s*([^,)\n]{1,60})/)
  if (del) suspicious.push(`删除文件：${del[1].trim()}`)
  else if (/unlinkSync/.test(text)) suspicious.push('删除文件')
  if (/process\.env\.[A-Z0-9_]*(KEY|TOKEN|SECRET)/.test(text)) suspicious.push('读环境变量里的密钥')
  const external = urls.filter((u) => {
    if (u.includes('${')) return false // 模板变量，解析不出真域名
    try {
      const host = new URL(u).hostname
      return !/^(127\.|localhost$|0\.0\.0\.0$|::1$)/.test(host)
    } catch { return false }
  })
  if (external.length) suspicious.push('访问外网')
/** 居民档案：记“能做什么、默认做不做、要注意什么”。
 *  能力是全能（含改代码/配置），默认不动是选择，不是上限。 */
function policyOf(flags, suspicious) {
  const can = ['读文件与资产', '改代码/配置（老板点头后）', '联网（任务需要时）']
  const usually = flags.exec
    ? '默认只读；真要动命令，先把命令亮出来'
    : '默认只读；她有能力改，但通常不动手'
  const adapter = flags.exec ? 'D' : flags.network ? 'C' : 'B' // 接入深度，不是身份等级
  return { can, usually, adapter, watch: suspicious }
}

  return {
    id: name,
    name,
    version: String(pkg.version || ''),
    license: String(pkg.license || ''),
    description: String(pkg.description || ''),
    dir,
    scannedAt: new Date().toISOString(),
    counts,
    flags,
    behavior: { urls, suspicious },
    policy: policyOf(flags, suspicious),
    capabilities: scanCapabilities(dir),
    assets,
  }
}

/** 扫描若干根目录，合并写 index.json；返回档案列表。 */
export function scanPlugins(roots = defaultRoots()) {
  const seen = new Set()
  const list = []
  for (const root of roots) {
    let dirs = []
    try { dirs = fs.readdirSync(root, { withFileTypes: true }) } catch { continue }
    for (const it of dirs) {
      if (!it.isDirectory() || it.name.startsWith('.') || it.name === 'node_modules') continue
      const dir = path.join(root, it.name)
      try {
        const real = fs.realpathSync(dir)
        if (seen.has(real)) continue
        seen.add(real)
        list.push(analyzePlugin(real))
      } catch { /* 单个插件失败不影响整体 */ }
    }
  }
  fs.mkdirSync(REG_DIR, { recursive: true })
  const index = { scannedAt: new Date().toISOString(), roots, plugins: list }
  const tmp = INDEX + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), 'utf8')
  fs.renameSync(tmp, INDEX)
  return list
}

export function defaultRoots() {
  const profile = process.env.DSH_PROFILE_DIR || path.join(HOME, 'profiles', 'desktop')
  return [
    path.join(profile, 'plugins'),
    path.join(HOME, 'plugins'),
  ]
}

export function readRegistry() {
  return readJson(INDEX, { scannedAt: '', plugins: [] })
}

/** 给鱼窝用：所有“能当人物形象”的候选（图片/GIF/模型）。 */
export function characterCandidates(registry = readRegistry()) {
  const out = []
  for (const plugin of registry.plugins || []) {
    for (const asset of plugin.assets || []) {
      if (asset.kind === 'image' || asset.kind === 'model') {
        out.push({ plugin: plugin.name, license: plugin.license || '', ...asset, path: path.join(plugin.dir, asset.rel) })
      }
    }
  }
  return out
}
