// 鱼神 · Copyright (c) 2026 用户. All rights reserved.
// 桌宠动画体检：只读解析 dsh-dafeiyu 的 assets/pet-manifest.json。
//
// 边界（写死在实现里，别放宽）：
//   · 不执行插件代码（只 readFile / readdir / stat / realpath）；
//   · 不复制素材（不写目标目录、不搬帧文件）；
//   · 不自动绑定（不写 pet.json、不碰 registry、不碰角色卡/人格）；
//   · 不读人格（角色卡、话术库、记忆库一律不打开）；
//   · 不写磁盘、不联网。
//
// 路径安全：帧路径必须是相对 assets/pet 的相对路径；
// 绝对路径（含盘符 / UNC）、`..` 段、空段、ADS 冒号一律拒绝；
// 符号链接只有落到 assets/pet 真实根之内才收，越界算违规。

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/** manifest 相对插件根的位置（dsh-dafeiyu 布局）。 */
export const PET_MANIFEST_REL = 'assets/pet-manifest.json'

const MANIFEST_CANDIDATES = ['assets/pet-manifest.json', 'pet-manifest.json']
const LICENSE_CANDIDATES = [
  'LICENSE',
  'ASSET_LICENSE.md',
  'assets/dsh-pet-LICENSE.txt',
  'NOTICE',
  'COPYING',
]
const MAX_FRAMES_PER_CLIP = 5000
const MAX_TEXT_BYTES = 256 * 1024
const MAX_LICENSE_LINES = 400

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function toPosix(value) {
  return String(value).replace(/\\/g, '/')
}

/** 大小写不敏感地判断 target 是否在 root 之内（含 root 本身）。 */
function insideRoot(root, target) {
  const r = path.resolve(root)
  const t = path.resolve(target)
  const ci = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s
  const rr = ci(r)
  const tt = ci(t)
  if (tt === rr) return true
  const prefix = rr.endsWith(path.sep) ? rr : rr + path.sep
  return tt.startsWith(prefix)
}

/**
 * 帧相对路径的词法体检。
 * 返回 null 表示词法可接受（仍要做落点包含检查），否则返回拒绝原因码。
 */
export function framePathRejectReason(raw) {
  if (typeof raw !== 'string') return 'frame-path-not-string'
  if (raw.length === 0) return 'frame-path-empty'
  if (raw.length > 1024) return 'frame-path-too-long'
  if (raw.includes('\0')) return 'frame-path-nul'
  if (/^[a-zA-Z]:/.test(raw)) return 'absolute-drive-path'
  if (raw.startsWith('/') || raw.startsWith('\\')) return 'absolute-path'
  const norm = toPosix(raw)
  if (norm.includes(':')) return 'path-ads-colon'
  const segments = norm.split('/')
  if (segments.some((seg) => seg === '..')) return 'parent-traversal'
  if (segments.some((seg) => seg === '.')) return 'dot-segment'
  if (segments.some((seg) => seg === '')) return 'empty-segment'
  return null
}

/** 只读读文件字节；失败返回 { ok:false, code }。 */
function readBytes(file) {
  try {
    const buf = fs.readFileSync(file)
    return { ok: true, buf, size: buf.length, sha256: sha256(buf) }
  } catch (error) {
    return { ok: false, code: String(error && error.code ? error.code : 'READ_FAILED') }
  }
}

function readJson(file) {
  const bytes = readBytes(file)
  if (!bytes.ok) return { ok: false, code: bytes.code }
  let text = bytes.buf.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  try {
    return { ok: true, data: JSON.parse(text), size: bytes.size, sha256: bytes.sha256 }
  } catch {
    return { ok: false, code: 'INVALID_JSON', size: bytes.size, sha256: bytes.sha256 }
  }
}

/** 同一路径判定（Windows 大小写不敏感）。 */
function samePath(a, b) {
  const norm = (value) => {
    const resolved = path.resolve(value)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  return norm(a) === norm(b)
}

/**
 * 解析一个帧：拒绝非法路径 / 越界路径 / 越界符号链接（含祖先目录的 junction）。
 * 祖先目录的真实路径按目录缓存，避免逐帧 realpath（真实插件 3444 帧、16 个目录）。
 */
function resolveFrame(root, rootReal, raw, linkCache) {
  const reason = framePathRejectReason(raw)
  if (reason) {
    return { rel: typeof raw === 'string' ? raw : null, accepted: false, reason }
  }
  const rel = toPosix(raw)
  const abs = path.resolve(root, ...rel.split('/'))
  if (!insideRoot(root, abs)) {
    return { rel, accepted: false, reason: 'outside-root' }
  }

  let lst = null
  try {
    lst = fs.lstatSync(abs)
  } catch {
    return { rel, accepted: true, path: abs, exists: false, bytes: null, symlink: false }
  }

  // 祖先目录（含 junction / 目录符号链接）不允许越界
  const dir = path.dirname(abs)
  const cacheKey = process.platform === 'win32' ? dir.toLowerCase() : dir
  let dirInfo = linkCache.get(cacheKey)
  if (!dirInfo) {
    dirInfo = { real: null, inside: true, linked: false }
    try {
      dirInfo.real = fs.realpathSync(dir)
      dirInfo.inside = insideRoot(rootReal, dirInfo.real)
      dirInfo.linked = !samePath(dir, dirInfo.real)
    } catch {
      dirInfo.real = null
    }
    linkCache.set(cacheKey, dirInfo)
  }
  if (!dirInfo.inside) {
    return { rel, accepted: false, reason: 'symlink-escape', symlink: true, link: 'ancestor' }
  }

  const leafLink = lst.isSymbolicLink()
  if (leafLink) {
    let real = null
    try {
      real = fs.realpathSync(abs)
    } catch {
      return { rel, accepted: false, reason: 'symlink-broken', symlink: true }
    }
    if (!insideRoot(rootReal, real)) {
      return { rel, accepted: false, reason: 'symlink-escape', symlink: true, link: 'leaf' }
    }
  }

  let st = null
  try {
    st = fs.statSync(abs)
  } catch {
    return { rel, accepted: false, reason: 'stat-failed', symlink: leafLink || dirInfo.linked }
  }
  if (!st.isFile()) {
    return { rel, accepted: false, reason: 'not-a-file', symlink: leafLink || dirInfo.linked }
  }
  return {
    rel,
    accepted: true,
    path: abs,
    exists: true,
    bytes: st.size,
    symlink: leafLink || dirInfo.linked,
  }
}

function sanitizeText(value, limit = 300) {
  if (typeof value !== 'string') return null
  const text = value.replace(/[\u0000-\u001f]/g, ' ').trim()
  return text ? text.slice(0, limit) : null
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 许可证据：只看文本，不解释法律含义。 */
function collectLicense(pluginDir) {
  const evidence = []
  let mitMentioned = false
  for (const rel of LICENSE_CANDIDATES) {
    const file = path.join(pluginDir, ...rel.split('/'))
    let st = null
    try {
      st = fs.statSync(file)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const entry = { rel, path: file, sizeBytes: st.size, sha256: null, mitLines: [], readLimited: false }
    if (st.size > MAX_TEXT_BYTES) entry.readLimited = true
    let text = ''
    if (!entry.readLimited) {
      const bytes = readBytes(file)
      if (bytes.ok) {
        entry.sha256 = bytes.sha256
        text = bytes.buf.toString('utf8')
      }
    }
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length && i < MAX_LICENSE_LINES; i += 1) {
      if (/MIT|permission is hereby granted|\bSPDX\b/i.test(lines[i])) {
        entry.mitLines.push({ line: i + 1, text: lines[i].trim().slice(0, 200) })
        if (entry.mitLines.length >= 8) break
      }
    }
    if (entry.mitLines.length > 0) mitMentioned = true
    evidence.push(entry)
  }

  let declared = null
  const pkg = readJson(path.join(pluginDir, 'package.json'))
  if (pkg.ok && pkg.data && typeof pkg.data === 'object') {
    declared = sanitizeText(pkg.data.license, 200)
  }

  return {
    declared,
    evidence,
    mitMentioned,
    status: mitMentioned || declared ? 'declared' : 'unknown',
  }
}

function checkPluginDir(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return { ok: false, reason: 'pluginDir 无效：不是非空字符串' }
  }
  if (input.includes('\0')) return { ok: false, reason: 'pluginDir 无效：含 NUL 字符' }
  const rawSegments = toPosix(input).split('/')
  if (rawSegments.includes('..')) {
    return { ok: false, reason: 'pluginDir 无效：含 .. 段（拒绝）' }
  }
  const abs = path.resolve(input)
  let st = null
  try {
    st = fs.statSync(abs)
  } catch {
    return { ok: false, reason: `pluginDir 不存在或不可读：${abs}` }
  }
  if (!st.isDirectory()) return { ok: false, reason: `pluginDir 不是目录：${abs}` }
  let real = null
  try {
    real = fs.realpathSync(abs)
  } catch {
    return { ok: false, reason: `pluginDir 无法 realpath：${abs}` }
  }
  return { ok: true, dir: abs, real }
}

/**
 * 只读体检一个桌宠插件的动画清单。
 *
 * @param {string} pluginDir 插件根目录（读到 package.json / assets/pet-manifest.json）
 * @returns 结构化结果：plugin / manifest / canvas / clips / license / missing / limitations / valid
 *   · ok    = 分析跑完了（目录与 manifest 可读、manifest 能解析）；
 *   · valid = 全部过检（无缺帧、无路径违规、canvas 完整、至少一个片段）。
 */
export function inspectPetAnimation(pluginDir) {
  const result = {
    ok: false,
    valid: false,
    plugin: null,
    manifest: null,
    canvas: null,
    assetSource: null,
    characterId: null,
    formatVersion: null,
    clips: [],
    license: { declared: null, evidence: [], mitMentioned: false, status: 'unknown' },
    missing: [],
    violations: [],
    limitations: [],
    checked: { clips: 0, frames: 0, existingFrames: 0, missingFrames: 0, rejectedFrames: 0 },
    safety: {
      executedPluginCode: false,
      copiedAssets: false,
      autoBound: false,
      readPersona: false,
      wroteDisk: false,
      network: false,
    },
  }

  const dirCheck = checkPluginDir(pluginDir)
  if (!dirCheck.ok) {
    result.missing.push(dirCheck.reason)
    result.limitations.push('pluginDir 未通过校验：未做任何文件读取')
    return result
  }
  const pluginDirAbs = dirCheck.dir
  const pluginReal = dirCheck.real

  // ---- 插件身份：只认 package.json 的 name/version，不 import ----
  const pkgPath = path.join(pluginDirAbs, 'package.json')
  const pkg = readJson(pkgPath)
  const identity = { name: null, version: null, license: null }
  const identityEvidence = []
  if (pkg.ok && pkg.data && typeof pkg.data === 'object') {
    identity.name = sanitizeText(pkg.data.name, 200)
    identity.version = sanitizeText(pkg.data.version, 100)
    identity.license = sanitizeText(pkg.data.license, 200)
    identityEvidence.push({
      source: 'package.json',
      path: pkgPath,
      sha256: pkg.sha256,
      sizeBytes: pkg.size,
      fields: { name: identity.name, version: identity.version, license: identity.license },
    })
    if (!identity.name) result.missing.push('package.json: 缺少 name')
    if (!identity.version) result.missing.push('package.json: 缺少 version')
  } else {
    result.missing.push(`package.json 不可用（${pkg.code || 'READ_FAILED'}）：${pkgPath}`)
  }
  result.plugin = { dir: pluginDirAbs, realDir: pluginReal, ...identity, evidence: identityEvidence }

  // ---- manifest 定位（限插件根内） ----
  let manifestPath = null
  for (const rel of MANIFEST_CANDIDATES) {
    const candidate = path.join(pluginDirAbs, ...rel.split('/'))
    if (!insideRoot(pluginDirAbs, candidate)) continue
    if (fs.existsSync(candidate)) {
      manifestPath = candidate
      break
    }
  }
  if (!manifestPath) {
    result.missing.push(`manifest 不存在：尝试过 ${MANIFEST_CANDIDATES.join(' / ')}`)
    result.limitations.push('没有 manifest：无法给出画布与片段，未做任何写入')
    return result
  }

  let manifestReal = null
  try {
    manifestReal = fs.realpathSync(manifestPath)
  } catch {
    result.missing.push(`manifest 无法 realpath：${manifestPath}`)
    return result
  }
  if (!insideRoot(pluginReal, manifestReal)) {
    result.violations.push({ scope: 'manifest', reason: 'symlink-escape', path: manifestPath })
  }

  const manifestRead = readJson(manifestPath)
  result.manifest = {
    path: manifestPath,
    realPath: manifestReal,
    sizeBytes: manifestRead.size ?? null,
    sha256: manifestRead.sha256 ?? null,
    format: 'dsh-dafeiyu/pet-manifest',
    parsed: manifestRead.ok === true,
  }
  if (!manifestRead.ok) {
    result.missing.push(`manifest 解析失败（${manifestRead.code}）：${manifestPath}`)
    return result
  }

  const data = manifestRead.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    result.missing.push('manifest 顶层不是对象')
    return result
  }

  // ---- 画布 / 素材来源 / 角色 ----
  const maxFrameWidth = finiteNumber(data.maxFrameWidth)
  const maxFrameHeight = finiteNumber(data.maxFrameHeight)
  const baseSize = finiteNumber(data.baseSize)
  result.canvas = {
    width: maxFrameWidth,
    height: maxFrameHeight,
    baseSize,
    complete: maxFrameWidth > 0 && maxFrameHeight > 0,
  }
  if (!result.canvas.complete) {
    result.missing.push('manifest: maxFrameWidth/maxFrameHeight 缺失或非正数')
  }

  const src = data.assetSource && typeof data.assetSource === 'object' ? data.assetSource : null
  result.assetSource = src
    ? {
      repository: sanitizeText(src.repository, 400),
      commit: sanitizeText(src.commit, 100),
      directory: sanitizeText(src.directory, 400),
      fps: finiteNumber(src.fps),
      crop: Array.isArray(src.crop) ? src.crop.map(finiteNumber) : null,
      webpQuality: finiteNumber(src.webpQuality),
      pathUsed: 'assets/pet（帧相对此目录）',
    }
    : null
  if (!result.assetSource) result.missing.push('manifest: assetSource 缺失')

  result.characterId = sanitizeText(data.characterId, 200)
  result.formatVersion = finiteNumber(data.formatVersion)

  // ---- 帧根目录 ----
  // dsh-dafeiyu 布局：manifest 在 assets/pet-manifest.json，帧在 assets/pet/。
  // 兼容 manifest 直接放在帧目录里的情况。
  const manifestBase = path.dirname(manifestPath)
  const frameRootCandidates = path.basename(manifestPath) === 'pet-manifest.json'
    ? [path.join(manifestBase, 'pet'), manifestBase]
    : [manifestBase]
  const frameRoot = (() => {
    for (const candidate of frameRootCandidates) {
      if (!insideRoot(pluginDirAbs, candidate)) continue
      try {
        if (fs.statSync(candidate).isDirectory()) return candidate
      } catch {
        // 继续看下一个候选
      }
    }
    return frameRootCandidates[0]
  })()
  if (!fs.existsSync(frameRoot)) {
    result.missing.push(`帧根目录不存在：${frameRoot}`)
  }
  let frameRootReal = null
  try {
    frameRootReal = fs.realpathSync(frameRoot)
  } catch {
    frameRootReal = frameRoot
  }
  const frameRootIsLink = (() => {
    try {
      return fs.lstatSync(frameRoot).isSymbolicLink()
    } catch {
      return false
    }
  })()
  if (!insideRoot(pluginReal, frameRootReal)) {
    result.violations.push({
      scope: 'frame-root',
      reason: frameRootIsLink ? 'symlink-escape' : 'outside-root',
      path: frameRoot,
    })
    result.limitations.push('帧根真实路径在插件目录之外：已按违规记录，帧仍以该根做包含检查')
  }

  // ---- 片段 ----
  const clipsObj = data.clips
  if (!clipsObj || typeof clipsObj !== 'object' || Array.isArray(clipsObj)) {
    result.missing.push('manifest: clips 不是对象')
  } else if (Object.keys(clipsObj).length === 0) {
    result.missing.push('manifest: clips 为空')
  } else {
    let totalFrames = 0
    let existingFrames = 0
    let missingFrames = 0
    let rejectedFrames = 0
    const windowMismatches = []
    const linkCache = new Map()

    for (const [name, rawClip] of Object.entries(clipsObj)) {
      const clip = {
        name,
        loop: null,
        frameMs: null,
        durationMs: null,
        frames: [],
        frameCount: 0,
        existingCount: 0,
        missing: [],
        rejected: [],
        source: null,
        issues: [],
      }

      if (!rawClip || typeof rawClip !== 'object' || Array.isArray(rawClip)) {
        clip.issues.push('clip 不是对象')
        result.missing.push(`clip "${name}": 不是对象`)
        result.clips.push(clip)
        continue
      }

      clip.frameMs = finiteNumber(rawClip.frameMs)
      if (clip.frameMs === null || clip.frameMs <= 0) {
        clip.issues.push('frameMs 缺失或非正数')
        result.missing.push(`clip "${name}": frameMs 缺失或非正数`)
      }
      clip.loop = typeof rawClip.loop === 'boolean' ? rawClip.loop : null
      if (clip.loop === null) clip.issues.push('loop 缺失或非布尔')

      const srcClip = rawClip.source && typeof rawClip.source === 'object' ? rawClip.source : null
      if (!srcClip) {
        clip.issues.push('source 缺失')
      } else {
        clip.source = {
          file: sanitizeText(srcClip.file, 300),
          sha256: typeof srcClip.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(srcClip.sha256)
            ? srcClip.sha256.toLowerCase()
            : null,
          startFrame: finiteNumber(srcClip.startFrame),
          endFrame: finiteNumber(srcClip.endFrame),
          frameCount: finiteNumber(srcClip.frameCount),
        }
        if (!clip.source.sha256) clip.issues.push('source.sha256 缺失或格式不对')
        if (clip.source.startFrame !== null && clip.source.endFrame !== null) {
          clip.sourceWindowFrames = clip.source.endFrame - clip.source.startFrame
        }
      }

      const frames = Array.isArray(rawClip.frames) ? rawClip.frames : null
      if (!frames) {
        clip.issues.push('frames 不是数组')
        result.missing.push(`clip "${name}": frames 不是数组`)
        result.clips.push(clip)
        continue
      }
      if (frames.length === 0) {
        clip.issues.push('frames 为空')
        result.missing.push(`clip "${name}": frames 为空`)
      }
      if (frames.length > MAX_FRAMES_PER_CLIP) {
        clip.issues.push(`frames 超过上限 ${MAX_FRAMES_PER_CLIP}`)
        result.limitations.push(`clip "${name}": 帧数 ${frames.length} 超过上限，只体检前 ${MAX_FRAMES_PER_CLIP} 帧`)
      }

      const limit = Math.min(frames.length, MAX_FRAMES_PER_CLIP)
      for (let i = 0; i < limit; i += 1) {
        const resolved = resolveFrame(frameRoot, frameRootReal, frames[i], linkCache)
        if (!resolved.accepted) {
          rejectedFrames += 1
          clip.rejected.push({ index: i, rel: resolved.rel, reason: resolved.reason })
          continue
        }
        clip.frames.push({
          index: i,
          rel: resolved.rel,
          path: resolved.path,
          exists: resolved.exists,
          bytes: resolved.bytes,
          symlink: resolved.symlink,
        })
        totalFrames += 1
        if (resolved.exists) {
          existingFrames += 1
          clip.existingCount += 1
        } else {
          missingFrames += 1
          clip.missing.push(resolved.rel)
        }
      }

      clip.frameCount = clip.frames.length
      if (clip.sourceWindowFrames != null && clip.sourceWindowFrames !== clip.frameCount) {
        windowMismatches.push({ name, window: clip.sourceWindowFrames, frames: clip.frameCount })
      }
      clip.durationMs = clip.frameMs && clip.frameMs > 0 ? clip.frames.length * clip.frameMs : null
      if (clip.durationMs !== null) clip.durationMs = Math.round(clip.durationMs * 1000) / 1000

      for (const rel of clip.missing) {
        result.missing.push(`缺失帧: ${rel} (clip ${name})`)
      }
      for (const rej of clip.rejected) {
        result.violations.push({
          scope: 'frame',
          clip: name,
          index: rej.index,
          rel: rej.rel,
          reason: rej.reason,
        })
      }

      result.clips.push(clip)
    }

    result.checked = {
      clips: result.clips.length,
      frames: totalFrames,
      existingFrames,
      missingFrames,
      rejectedFrames,
    }
    if (windowMismatches.length > 0) {
      const sample = windowMismatches.slice(0, 3).map((m) => `${m.name}: 窗口 ${m.window} / 帧 ${m.frames}`)
      result.limitations.push(
        `source 窗口（endFrame-startFrame）与 frames.length 不等：${sample.join('；')}`
        + '（源视频窗口与剪辑帧的差异，仅记录，不判失败）',
      )
    }
  }

  // ---- 许可 ----
  result.license = collectLicense(pluginDirAbs)
  if (result.license.evidence.length === 0) {
    result.missing.push('未找到许可文件（LICENSE / ASSET_LICENSE.md / assets/dsh-pet-LICENSE.txt）')
  }
  if (!result.license.mitMentioned && !result.license.declared) {
    result.limitations.push('许可：未在扫描到的文本里找到 MIT/许可声明，不能据此判断授权范围')
  }

  // ---- 通用限制（有证据才下结论） ----
  result.limitations.push('只读：未执行插件代码、未复制素材、未自动绑定、未读取人格')
  result.limitations.push('帧文件只核对存在性与字节数，未解码画面，不校验分辨率/透明度/内容')
  result.limitations.push('硬链接不区分（同一 inode）：只按路径与目录真实路径判定越界')
  result.limitations.push('许可仅摘录文件中的声明行，不构成法律意见')
  if (result.license.declared && /SEE LICENSE/i.test(result.license.declared)) {
    result.limitations.push(`package.json 的 license 是转指（${result.license.declared}），实质条款看文件正文`)
  }

  // ---- 判定 ----
  result.ok = true
  const canvasOk = result.canvas && result.canvas.complete
  const clipsOk = result.clips.length > 0
  const framesOk = result.checked.missingFrames === 0
  const noViolations = result.violations.length === 0
  const manifestOk = result.manifest.parsed === true
  result.valid = Boolean(manifestOk && canvasOk && clipsOk && framesOk && noViolations)

  return result
}

export default inspectPetAnimation
