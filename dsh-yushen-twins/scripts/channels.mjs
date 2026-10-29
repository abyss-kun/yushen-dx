// 管家的自检：通道在不在、缺什么、怎么补一条命令。
//
//   node scripts/channels.mjs           看状态
//   node scripts/channels.mjs --wire    能找到的自动接上（写 adapters/qq.json）
//
// 2026-10-28 老板定的口径：**「既然是管家，就没有让主人费心的道理。」**
// 所以这里的原则是：
//   1. 能自己找到的，自己接（不问主人路径）
//   2. 找不到的，只给一条命令，不给一段文档
//   3. 一样都没接上，也要能跑（降级到只有工作台），不能卡住主人
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { dshHome, dayuHome, qqBridgeRoot, qqBridgeState, pluginPresetsDir, localLlmDir } from '../lib/paths.js'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const WIRE = process.argv.includes('--wire')
const D = dayuHome()
const exists = (p) => { try { return Boolean(p) && fs.existsSync(p) } catch { return false } }
const rows = []
const add = (name, ok, detail, fix) => rows.push({ name, ok, detail, fix })

// 1) 工作台 / 本体（永远要有）
add('工作台 · 本体', exists(path.join(D, 'soul')), path.join(D, 'soul'), '跑 node scripts/first-run.mjs')

// 2) QQ 桥（外部可选）
const bridge = qqBridgeRoot()
const bridgeOk = exists(bridge) && exists(path.join(bridge, 'src', 'bridge.js'))
add('QQ 通道 · 桥', bridgeOk, bridge || '没找到', bridgeOk ? '' : '装 qq-bridge（或设 QQ_BRIDGE_ROOT）')

// 3) 桥的状态（连没连上 QQ）
const state = path.join(qqBridgeState() || '', 'social-v2.json')
add('QQ 通道 · 状态', exists(state), state || '没有', bridgeOk ? '启动桥：npm start（在桥目录）' : '')

// 4) QQ 工具（MCP）
const patch = path.join(dshHome(), 'profiles', 'desktop', 'cordis.patch.yml')
let mcpOk = false
try { mcpOk = /snowluma/i.test(fs.readFileSync(patch, 'utf8')) } catch { /* 忽略 */ }
add('QQ 通道 · 工具', mcpOk, mcpOk ? 'cordis.patch.yml 里有 snowluma MCP' : '没有挂 MCP', mcpOk ? '' : '跑 node scripts/setup.mjs（会补挂载）')

// 5) B站（可选；用 bili CLI）
let biliOk = false
try {
  const { execFileSync } = await import('node:child_process')
  execFileSync('where', ['bili'], { stdio: 'pipe', timeout: 5000 })
  biliOk = true
} catch { biliOk = false }
add('B站通道 · CLI', biliOk, biliOk ? 'bili 在 PATH' : '没装 bili CLI', biliOk ? '' : 'npm i -g bili-cli（或不用这条通道）')

// 6) 本地嗓子（可选）
const llm = localLlmDir()
add('本地模型（可选）', exists(llm), llm || '没装', exists(llm) ? '' : 'node scripts/local-setup.mjs（不装也能跑，走云端）')

// 7) 预设（给 QQ 会话用）
add('QQ 预设', exists(pluginPresetsDir()), pluginPresetsDir(), exists(pluginPresetsDir()) ? '' : '装 qq-agent-presets')

// 自动接线：写 adapters/qq.json（只写找到的，不瞎编）
let wired = ''
if (WIRE && bridgeOk) {
  const dir = path.join(D, 'adapters')
  const file = path.join(dir, 'qq.json')
  fs.mkdirSync(dir, { recursive: true })
  const payload = {
    bridgeRoot: bridge,
    statePath: path.join(bridge, 'state', 'social-v2.json'),
    note: '2026-10-28 由 scripts/channels.mjs --wire 自动写入（可手改）',
    at: new Date().toISOString(),
  }
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  wired = file
}

const ok = rows.filter((r) => r.ok).length
const must = rows.filter((r) => ['工作台 · 本体'].includes(r.name))
console.log(`通道自检：${ok} / ${rows.length} 通`)
for (const r of rows) {
  console.log(`${r.ok ? '✅' : '⚠️ '} ${r.name.padEnd(18)} ${r.detail}`)
  if (!r.ok && r.fix) console.log(`     → ${r.fix}`)
}
if (wired) console.log(`\n已接线：${wired}`)
console.log('\n原则：**能接的自己接，不能接的只给一条命令；全都不通也能用（只剩工作台）。**')
process.exit(must.every((r) => r.ok) ? 0 : 2)
