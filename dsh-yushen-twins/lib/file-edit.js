// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-file-edit
 * kind: module
 * summary: 文件编辑：读 UTF-8、带版本校验保存、写前备份到 ~/.dsh/dayu/backups，覆盖前先比对。
 * tags: 文件编辑, 版本校验, 备份
 * created: 2026-11-11 01:25:00
 * changed: 2026-11-11 01:25:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 她（工具背后）、面板、维护者
 * owner: 框架；**写入路径要过 safePath**（只许在允许根里）
 * defaults: 备份保留最近 200 份；旧备份轮转删除
 * off: 不编辑就只能看（面板那两个页本来是只读的）
 * mutable: 可改；**版本校验与写前备份**不许省
 * usage: readText/saveText({path,text,version}) → 版本不匹配就拒绝
 * why: DSH 面板只读，客户端 API 也没有写文件的方法；这里补一条能改的路
 * result: 一条带校验和备份的编辑通道
 */
// 改｜2026-11-03 16:48｜大鱼·子会话（文件编辑）｜授权：老板｜lib/file-edit.js:1-285｜新增文件编辑：读 UTF-8 文本、带版本校验保存、写前备份到 ~/.dsh/dayu/backups/file-edit、写完回读；另给本机编辑器打开｜为什么：DSH 右侧「文件 / 第 N 轮改动」是只读预览与 diff，客户端 workspaceFiles 面只有 read/readBytes/stat/list/changes，没有写方法｜验证：node scripts/test-file-edit.mjs 12/0；node scripts/test-dispatch-reply.mjs 过；scanDeadExports dead=0｜可改：可改
// 文件编辑（2026-11-03）：DSH 右侧「文件 / 第 N 轮改动」两个页都是预览与 diff，天生只读，
// 客户端 API 也没有写文件的远程方法。这里补一条能改的路：读 UTF-8 文本、带版本校验地保存、
// 写前把原文件备份到 ~/.dsh/dayu/backups/file-edit/，写完回读校验。
//
// 规矩：
//   1. 根只认 core/jobs.js 的 safePath()（工作区、~/.dsh、deepseekTools），不另开一套；
//   2. safePath 之后再做 realpath 复查——软链接指到根外也拒；
//   3. 保存必须带读的时候拿到的 hash；对不上就拒（STALE），不静默覆盖别人的改动；
//   4. 先写同目录临时文件再 rename，写完回读比 hash；备份统一放自家目录，不在源目录堆 .bak；
//   5. 只认 UTF-8（含 BOM），二进制/编码不对直接说清楚，不硬改。
//
// 谁在用：index.js 的 GET/POST /api/yushen/file-text、POST /api/yushen/file-open；
//         client.js 的「文件编辑」页与预览标题栏的「编辑 / 用编辑器打开」；
//         scripts/open-file.mjs（命令行，现在就能用，不依赖前端改动）。
// 测：node scripts/test-file-edit.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { safePath, safeRoots } from '../core/jobs.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

/** 备份目录（老板定的位置：不放源目录，免得堆一地 .bak）。 */
export const FILE_EDIT_BACKUP_DIR = path.join(HOME, 'dayu', 'backups', 'file-edit')
const BACKUP_KEEP = 200

/** 单文件上限：2MB。再大就不像"随手改一句"，该用正经编辑器。 */
export const MAX_EDIT_BYTES = 2 * 1024 * 1024

/** 带 code 的错误：路由按 code 给 HTTP 状态，前端按 code 说人话。 */
export class FileEditError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'FileEditError'
    this.code = code
    Object.assign(this, details)
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** 允许编辑的根（realpath 后）。直接复用 safePath 的根，别处不再另写一份。 */
export function editableRoots() {
  const out = []
  for (const raw of safeRoots()) {
    const full = path.resolve(raw)
    try { out.push(fs.realpathSync(full)) } catch { out.push(full) }
  }
  return [...new Set(out)]
}

function insideAny(full) {
  // Windows 不区分大小写：realpath 可能把小写盘符原样带回来，别在这里误杀。
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const probe = norm(full)
  return editableRoots().some((root) => {
    const base = norm(root)
    return probe === base || probe.startsWith(base + path.sep)
  })
}

/** 解析 + 越界检查 + 必须是普通文件。第一道 safePath，第二道 realpath（软链接绕不出去）。 */
export function resolveEditablePath(input) {
  const raw = String(input ?? '').trim()
  if (!raw) throw new FileEditError('NO_PATH', 'path 不能为空')
  let full
  try {
    full = safePath(raw)
  } catch (error) {
    throw new FileEditError('OUTSIDE', String(error?.message || error))
  }
  let real
  try { real = fs.realpathSync(full) } catch { throw new FileEditError('NOT_FOUND', `文件不存在：${full}`) }
  if (!insideAny(real)) {
    throw new FileEditError('OUTSIDE', `只能改工作区、.dsh 和 deepseekTools 下的文件：${real}`)
  }
  let stat
  try { stat = fs.statSync(real) } catch { throw new FileEditError('NOT_FOUND', `读不到文件：${real}`) }
  if (!stat.isFile()) throw new FileEditError('NOT_FILE', `不是普通文件：${real}`)
  return { full: real, stat }
}

/**
 * 读一个文本文件。
 * @returns {{path:string,text:string,hash:string,size:number,mtimeMs:number,bom:boolean,eol:'crlf'|'lf',maxBytes:number}}
 */
export function readTextFile(input, { maxBytes = MAX_EDIT_BYTES } = {}) {
  const { full, stat } = resolveEditablePath(input)
  if (stat.size > maxBytes) {
    throw new FileEditError('TOO_LARGE', `文件 ${stat.size} 字节，超过 ${maxBytes} 字节上限；大文件请用外部编辑器`)
  }
  const buf = fs.readFileSync(full)
  if (buf.includes(0)) throw new FileEditError('BINARY', '看着是二进制文件（含 NUL 字节），不在这里改')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    throw new FileEditError('NOT_UTF8', '不是 UTF-8 文本；先转成 UTF-8 再改，免得存回去变乱码')
  }
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  return {
    path: full,
    text,
    hash: sha256(buf),
    size: buf.length,
    mtimeMs: stat.mtimeMs,
    bom,
    eol: text.includes('\r\n') ? 'crlf' : 'lf',
    maxBytes,
  }
}

function backupOriginal(full, bytes) {
  fs.mkdirSync(FILE_EDIT_BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
  const base = path.basename(full).replace(/[^\w.\u4e00-\u9fa5-]+/g, '_').slice(-60)
  const file = path.join(FILE_EDIT_BACKUP_DIR, `${stamp}-${base}-${sha256(bytes).slice(0, 8)}.bak`)
  fs.writeFileSync(file, bytes, { mode: 0o600 })
  pruneBackups()
  return file
}

function pruneBackups() {
  try {
    const names = fs.readdirSync(FILE_EDIT_BACKUP_DIR)
      .filter((n) => n.endsWith('.bak'))
      .map((n) => ({ n, at: fs.statSync(path.join(FILE_EDIT_BACKUP_DIR, n)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
    for (const { n } of names.slice(BACKUP_KEEP)) {
      try { fs.rmSync(path.join(FILE_EDIT_BACKUP_DIR, n), { force: true }) } catch { /* 删不掉就留着 */ }
    }
  } catch { /* 还没有备份目录 */ }
}

/**
 * 保存文本。
 * @param {{path:string,text:string,baseHash?:string,maxBytes?:number}} args
 *   baseHash = 打开时 readTextFile 返回的 hash；对不上就拒存（409）。
 * @returns {{path:string,hash:string,size:number,backup:string,unchanged:boolean}}
 */
export function saveTextFile({ path: input, text, baseHash, maxBytes = MAX_EDIT_BYTES } = {}) {
  if (typeof text !== 'string') throw new FileEditError('BAD_TEXT', 'text 必须是字符串')
  const { full, stat } = resolveEditablePath(input)
  if (stat.size > maxBytes) {
    throw new FileEditError('TOO_LARGE', `原文件 ${stat.size} 字节，超过 ${maxBytes} 字节上限`)
  }
  const current = fs.readFileSync(full)
  const currentHash = sha256(current)
  const hadBom = current.length >= 3 && current[0] === 0xef && current[1] === 0xbb && current[2] === 0xbf
  const body = hadBom ? Buffer.from('\ufeff' + text, 'utf8') : Buffer.from(text, 'utf8')
  if (body.length > maxBytes) {
    throw new FileEditError('TOO_LARGE', `改动后 ${body.length} 字节，超过 ${maxBytes} 字节上限`)
  }

  const given = String(baseHash || '').trim().toLowerCase()
  if (given && given !== currentHash) {
    if (body.equals(current)) {
      return { path: full, hash: currentHash, size: current.length, backup: '', unchanged: true }
    }
    throw new FileEditError('STALE', '文件在别处被改过了（版本对不上）；先重新读取再保存，免得覆盖别人的改动', { hash: currentHash })
  }
  if (body.equals(current)) {
    return { path: full, hash: currentHash, size: current.length, backup: '', unchanged: true }
  }

  let backup
  try {
    backup = backupOriginal(full, current)
  } catch (error) {
    throw new FileEditError('BACKUP_FAILED', `改动前的备份没写成功，先不覆盖原文件：${error?.message || error}`)
  }
  const tmp = `${full}.ysn-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, body, { mode: stat.mode || 0o600 })
    fs.renameSync(tmp, full)
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }) } catch { /* 临时文件删不掉就留着，反正不覆盖原文件 */ }
    throw new FileEditError('WRITE_FAILED', `写不进去（可能被别的程序占用）：${error?.message || error}`)
  }
  // 回读校验：写进去了不算数，读回来字节对得上才算。
  let back
  try { back = fs.readFileSync(full) } catch (error) {
    throw new FileEditError('VERIFY_FAILED', `写完读不回来：${error?.message || error}`)
  }
  if (back.length !== body.length || sha256(back) !== sha256(body)) {
    throw new FileEditError('VERIFY_FAILED', '写完回读对不上（文件可能被别的程序同时改了）；备份还在，先别继续改')
  }
  return { path: full, hash: sha256(body), size: body.length, backup, unchanged: false }
}

// ── 用系统编辑器打开 ────────────────────────────────────────────────────────
// 零门槛入口：不依赖前端改动。scripts/open-file.mjs 现在就能用；
// 预览标题栏的「用编辑器打开」和 POST /api/yushen/file-open 走同一段逻辑。
function editorCandidates() {
  const local = process.env.LOCALAPPDATA || ''
  const pf = process.env.ProgramFiles || ''
  const list = []
  if (process.platform === 'win32') {
    if (local) {
      list.push({ name: 'vscode', exe: path.join(local, 'Programs', 'Microsoft VS Code', 'Code.exe') })
      list.push({ name: 'cursor', exe: path.join(local, 'Programs', 'cursor', 'Cursor.exe') })
    }
    if (pf) list.push({ name: 'vscode', exe: path.join(pf, 'Microsoft VS Code', 'Code.exe') })
    list.push({ name: 'notepad', exe: path.join(process.env.SystemRoot || '', 'notepad.exe') })
  } else if (process.platform === 'darwin') {
    list.push({ name: 'open', exe: '/usr/bin/open' })
  } else {
    list.push({ name: 'xdg-open', exe: '/usr/bin/xdg-open' })
  }
  return list
}

/**
 * 用本机编辑器打开一个文件。优先 VS Code / Cursor，找不到就记事本（Windows）。
 * @returns {{ok:true,path:string,editor:string}}
 */
export function openInEditor(input) {
  const { full } = resolveEditablePath(input)
  const picked = editorCandidates().find((item) => {
    try { return fs.existsSync(item.exe) } catch { return false }
  })
  if (!picked) throw new FileEditError('NO_EDITOR', '本机没找到可用的编辑器（VS Code / 记事本）')
  try {
    const child = spawn(picked.exe, [full], { detached: true, stdio: 'ignore', windowsHide: false })
    child.on('error', () => { /* 起不来也不拖垮插件进程 */ })
    child.unref()
  } catch (error) {
    throw new FileEditError('OPEN_FAILED', `打不开编辑器：${error?.message || error}`)
  }
  return { ok: true, path: full, editor: picked.name }
}

/** 给面板用的能力说明（只读）。 */
export function fileEditCapabilities() {
  return { roots: editableRoots(), maxBytes: MAX_EDIT_BYTES, backupDir: FILE_EDIT_BACKUP_DIR }
}

function failure(error) {
  const code = String(error?.code || '')
  const status = code === 'STALE' ? 409 : code === 'NOT_FOUND' ? 404 : 400
  return { status, body: { ok: false, code, error: String(error?.message || error), hash: error?.hash || '' } }
}

/** GET /api/yushen/file-text 的纯逻辑：给 index.js 和测试共用，免得两边字段名走样。 */
export function readTextResponse(pathInput, options) {
  try {
    return { status: 200, body: { ok: true, ...readTextFile(pathInput, options) } }
  } catch (error) {
    return failure(error)
  }
}

/** POST /api/yushen/file-text 的纯逻辑（body: { path, text, hash }）。 */
export function saveTextResponse(body = {}, options) {
  try {
    return {
      status: 200,
      body: {
        ok: true,
        ...saveTextFile({
          path: body?.path,
          text: body?.text,
          baseHash: body?.hash || body?.baseHash,
          ...(options || {}),
        }),
      },
    }
  } catch (error) {
    return failure(error)
  }
}

/** POST /api/yushen/file-open 的纯逻辑（body: { path }）。 */
export function openEditorResponse(body = {}) {
  try {
    return { status: 200, body: openInEditor(body?.path) }
  } catch (error) {
    return failure(error)
  }
}
