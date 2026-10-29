// 轻读 DSH：只抽六个关键模块的 package.json + 入口文件前 120 行，落到本地。
// 只读发行包，不改安装目录；升级后重跑对比版本即可。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { asarPath } from './paths.js'

// Electron 里 fs 被 asar 补丁接管；读 app.asar 本体要用 original-fs 绕过去。
const require = createRequire(import.meta.url)
const rawFs = (() => { try { return require('original-fs') } catch { return fs } })()

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const OUT = path.join(HOME, 'dayu', 'dsh-internals')
const ASAR = asarPath()

const TARGETS = [
  'dsh-agent-loop',
  'dsh-compaction',
  'dsh-session',
  'dsh-authorization',
  'dsh-app-boot',
  'dsh-tools',
]
const MAX_LINES = 120
const MAX_BYTES = 24 * 1024

function readHeader(file = ASAR) {
  const fd = rawFs.openSync(file, 'r')
  try {
    const head = Buffer.alloc(16)
    rawFs.readSync(fd, head, 0, 16, 0)
    const jsonLen = head.readUInt32LE(12)
    const buf = Buffer.alloc(jsonLen)
    rawFs.readSync(fd, buf, 0, jsonLen, 16)
    // 文件数据起点：8 + 偏移 4 处的头长度（实测值，已用 package.json 验证）
    const dataStart = 8 + head.readUInt32LE(4)
    return { root: JSON.parse(buf.toString('utf8')), dataStart }
  } finally { rawFs.closeSync(fd) }
}

function readFileAt(file, node, dataStart, maxBytes) {
  const fd = rawFs.openSync(file, 'r')
  try {
    const size = Math.min(Number(node.size || 0), maxBytes)
    const b = Buffer.alloc(size)
    rawFs.readSync(fd, b, 0, size, dataStart + Number(node.offset))
    return b.toString('utf8')
  } finally { rawFs.closeSync(fd) }
}

function findModule(root, name) {
  const nm = root?.files?.dsh?.files?.node_modules?.files || {}
  if (nm['@deepseek-ai']?.files?.[name]) return nm['@deepseek-ai'].files[name]
  if (nm[name]) return nm[name]
  return null
}

/** 按相对路径在 asar 目录树里取节点。 */
function nodeAt(mod, rel) {
  let cur = mod
  for (const part of String(rel).split('/').filter(Boolean)) {
    if (!cur?.files?.[part]) return null
    cur = cur.files[part]
  }
  return cur && cur.files ? null : cur
}

/** 生成笔记；返回摘要 [{name, version, main, bytes}]。 */
export function scanInternals({ write = true } = {}) {
  const { root, dataStart } = readHeader()
  const summary = []
  for (const name of TARGETS) {
    const mod = findModule(root, name)
    if (!mod?.files) continue
    const pkgNode = mod.files['package.json']
    if (!pkgNode) continue
    let pkg = {}
    try { pkg = JSON.parse(readFileAt(ASAR, pkgNode, dataStart, 64 * 1024)) } catch { /* 读不出就空 */ }
    const main = String(pkg.main || pkg.module || 'index.js').replace(/^\.\//, '')
    const entry = nodeAt(mod, main) || nodeAt(mod, 'index.js') || nodeAt(mod, 'lib/index.js')
    let head = ''
    if (entry) {
      const text = readFileAt(ASAR, entry, dataStart, MAX_BYTES)
      head = text.split(/\r?\n/).slice(0, MAX_LINES).join('\n')
    }
    const row = { name, version: String(pkg.version || ''), main, headBytes: head.length, exports: Object.keys(pkg.exports || {}).slice(0, 6) }
    summary.push(row)
    if (write) {
      const dir = path.join(OUT, name)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8')
      if (head) fs.writeFileSync(path.join(dir, 'ENTRY.head.txt'), head, 'utf8')
    }
  }
  if (write) {
    fs.mkdirSync(OUT, { recursive: true })
    const lines = [
      '# DSH 接口真相笔记',
      '',
      `> 生成：${new Date().toISOString()} · 来源：app.asar（只读，不拆包）`,
      '',
      '| 模块 | 版本 | 入口 | 读过 |',
      '|---|---|---|---|',
      ...summary.map((r) => `| ${r.name} | ${r.version} | ${r.main} | ${r.headBytes ? '前 120 行' : '无'} |`),
      '',
      '## 怎么用',
      '',
      '- 改插件前先翻这里：知道 DSH 的回合、压缩、会话、鉴权、启动、工具的接口长什么样；',
      '- **不背实现，只认契约**；升级后重跑 `scanInternals()`，版本变了再重读；',
      '- 安装目录不动，这里只放摘录。',
      '',
    ]
    fs.writeFileSync(path.join(OUT, '笔记.md'), lines.join('\n'), 'utf8')
  }
  return { ok: true, dir: OUT, modules: summary }
}

export function notePath() { return path.join(OUT, '笔记.md') }

/** 按事故症状猜该读哪个模块：平时不读，出事才翻。 */
export function suggestModule(text) {
  const s = String(text || '')
  const rules = [
    ['dsh-agent-loop', /回合|秒结束|没调模型|agent|循环|空转|llm/i],
    ['dsh-compaction', /压缩|上下文|context|token|挤爆|超限/i],
    ['dsh-session', /会话|session|标题|换班|接管|列表|活着/i],
    ['dsh-authorization', /权限|鉴权|401|403|token|授权|cookie/i],
    ['dsh-app-boot', /启动|boot|没挂|加载|插件没|白屏|起不来/i],
    ['dsh-tools', /工具|tool|注册|调用|schema|参数/i],
  ]
  for (const [module, re] of rules) if (re.test(s)) return module
  return ''
}

/** 读某个模块已摘录的入口前 N 行；没有就现扫一遍。 */
export function readExcerpt(module, lines = 80) {
  const name = String(module || '')
  const file = path.join(OUT, name, 'ENTRY.head.txt')
  if (!fs.existsSync(file)) {
    try { scanInternals({ write: true }) } catch { /* 扫不了再说 */ }
  }
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(0, Math.max(1, Math.min(400, Number(lines) || 80))).join('\n')
  } catch { return '' }
}
