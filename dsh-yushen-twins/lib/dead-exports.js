// 死出口：一个函数导出了，但没有任何**别的文件把它 import 进去**。
//
// 2026-10-30 从一条真事长的：lib/active.js 的 begin/settle、lib/people.js 的
// rememberPerson/personLine，两套都造好了，一次没被调用过——活跃层只读不写，
// 人物层整个悬空。从外面看一切正常：简报里「手头进行中的」好端端在那，
// 没人看得出它其实谁也写不进去。
//
// 这类事已经第三次了（hand 工具的 target 没接、done/feel 没入口），
// 所以做成一条能跑出来的检查，不再靠谁想起来。
//
// 第一版按"名字在别处出现过"判，结果 195 条噪音——begin/settle 这种通用词
// 在别处满地都是，全被算成"有人接"。改成**看 import 语句**：真被 import 才算接。
//
// 这不是"死代码"判决书：有的导出是给外部（别的插件、以后的人）留的口子。
// 它只回答一句话——**这个出口，现在有没有人接**。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['node_modules', '.git', '.state', 'archive', 'backups', 'dist', '出厂', 'coverage'])
const EXTS = ['.js', '.mjs', '.cjs']

function walk(dir, out = []) {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (EXTS.includes(path.extname(e.name))) out.push(p)
  }
  return out
}

/** 只认函数：常量表（MAX_*、DEFAULT_*）对外露着是正常的，不算死出口。 */
function functionExports(text) {
  const found = new Map()
  let m
  const re1 = /export\s+(?:async\s+)?function\s+\*?\s*([A-Za-z_$][\w$]*)/g
  while ((m = re1.exec(text))) {
    found.set(m[1], { line: text.slice(0, m.index).split('\n').length, kind: 'function' })
  }
  const re2 = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s*)?(\(|function\b|[A-Za-z_$][\w$]*\s*=>)/g
  while ((m = re2.exec(text))) {
    if (!found.has(m[1])) found.set(m[1], { line: text.slice(0, m.index).split('\n').length, kind: 'const-fn' })
  }
  const re3 = /export\s+default\s+(?:async\s+)?(?:function\b|\(|class\b)/g
  while ((m = re3.exec(text))) {
    found.set('default', { line: text.slice(0, m.index).split('\n').length, kind: 'default' })
  }
  return found
}

/** import 语句 → 被引用的名字（按目标文件归拢）。 */
function importsOf(text) {
  const out = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    // const { a, b } = await import('../lib/x.js') —— 动态导入的解构，也算有人接
    const dyn = lines[i].match(/\{([^}]*)\}\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/)
    if (dyn) {
      const names = new Set()
      for (const raw of dyn[1].split(',')) {
        const part = raw.trim()
        if (!part) continue
        const name = (part.split(/\s*:\s*/)[0] || '').trim()
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
      }
      if (dyn[2].startsWith('.')) out.push({ spec: dyn[2], names })
      continue
    }
    // const mod = await import('../lib/x.js') 然后 mod.xxx(...) —— 命名空间用法
    const dynNs = lines[i].match(/([A-Za-z_$][\w$]*)\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\)/)
    if (dynNs) {
      if (dynNs[2].startsWith('.')) out.push({ spec: dynNs[2], names: new Set(), ns: dynNs[1] })
      continue
    }
    if (!/^\s*import\s/.test(lines[i])) continue
    let chunk = lines[i]
    let j = i
    while (!/from\s*['"][^'"]+['"]/.test(chunk) && j < lines.length - 1 && j - i < 12) chunk += `\n${lines[++j]}`
    const mm = chunk.match(/from\s*['"]([^'"]+)['"]/)
    if (!mm) { i = j; continue }
    const spec = mm[1]
    if (!spec.startsWith('.')) { i = j; continue }
    const head = chunk.replace(/^\s*import\s+/, '').replace(/\s*from\s*['"][^'"]+['"][\s\S]*$/, '')
    const names = new Set()
    if (/^\*\s+as\s+/.test(head)) names.add('*')
    else {
      const def = head.match(/^([A-Za-z_$][\w$]*)\s*(,|$)/)
      if (def) names.add(def[1])
      const braced = head.match(/\{([\s\S]*)\}/)
      if (braced) {
        for (const raw of braced[1].split(',')) {
          const part = raw.trim()
          if (!part) continue
          const name = (part.split(/\s+as\s+/)[0] || '').trim()
          if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
        }
      }
    }
    out.push({ spec, names })
    i = j
  }
  return out
}

function resolveSpec(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec)
  if (path.extname(base)) return fs.existsSync(base) ? base : base
  for (const ext of EXTS) if (fs.existsSync(base + ext)) return base + ext
  for (const ext of EXTS) if (fs.existsSync(path.join(base, `index${ext}`))) return path.join(base, `index${ext}`)
  return base
}

/**
 * 扫一遍：哪些函数导出了，却没有任何别的文件 import 它。
 *
 * days：只看最近几天动过的文件（0 = 全都看）。
 * 这个参数是给"刚造完的东西接没接上"用的——全量扫会有很多
 * 本来就留给外部用的口子（adapter、给别的插件的 API），噪音盖住真问题。
 */
export function scanDeadExports({ root = ROOT, days = 0, scope = 'lib/' } = {}) {
  const files = walk(root)
  const texts = new Map()
  for (const f of files) {
    if (days > 0) {
      try {
        const age = (Date.now() - fs.statSync(f).mtimeMs) / 86400000
        if (age > days) continue
      } catch { continue }
    }
    try { texts.set(f, fs.readFileSync(f, 'utf8')) } catch { /* 读不了就跳过 */ }
  }
  const all = walk(root)
  // 引用方要扫全量：三天前写的文件也可能正在用今天新加的东西
  for (const f of all) {
    if (texts.has(f)) continue
    try { texts.set(f, fs.readFileSync(f, 'utf8')) } catch { /* 读不了就跳过 */ }
  }
  const fresh = new Set([...texts.keys()].filter((f) => days > 0 ? (Date.now() - fs.statSync(f).mtimeMs) / 86400000 <= days : true))
  // 目标文件 → 被导入的名字
  const imported = new Map()
  for (const [file, text] of texts) {
    for (const { spec, names, ns } of importsOf(text)) {
      const target = resolveSpec(file, spec)
      if (!imported.has(target)) imported.set(target, new Set())
      const set = imported.get(target)
      for (const n of names) set.add(n)
      if (ns) {
        const re = new RegExp(`\\b${ns.replace(/\$/g, '\\$')}\\.([A-Za-z_$][\\w$]*)`, 'g')
        let m
        while ((m = re.exec(text))) set.add(m[1])
      }
    }
  }
  const rows = []
  for (const [file, text] of texts) {
    if (!fresh.has(file)) continue
    const rel = path.relative(root, file).replace(/\\/g, '/')
    if (/(^|\/)index\.js$/.test(rel)) continue // 入口文件本来就不用被别人 import
    if (scope && !rel.startsWith(scope)) continue // 入口脚本（scripts/）没人 import 是正常的
    const used = imported.get(file) || new Set()
    if (used.has('*')) continue // 有人整个模块拿去用了，不逐名判
    for (const [name, info] of functionExports(text)) {
      if (used.has(name)) continue
      // 自己文件里还在用（定义以外还有引用）＝内部实现，不算死出口
      const inFile = (text.match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length
      if (inFile > 1) continue
      rows.push({ file: rel, line: info.line, name, kind: info.kind })
    }
  }
  rows.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
  return { root, scanned: fresh.size, dead: rows }
}

export default scanDeadExports
