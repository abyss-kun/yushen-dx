// 证明：没有 DSH，她也能活（读魂、记账、看派活单、注册工具、发话）。
// 运行：node scripts/core-demo.mjs

import { soul, ledger, host, CORE_VERSION } from '../core/index.js'
import { attachCli } from '../adapters/cli.js'

const cli = attachCli({ out: (line) => console.log('  ', line) })
console.log(`core ${CORE_VERSION} · 宿主 ${host().name}`)

const p = soul.profile()
console.log('她是谁：', JSON.stringify(p))

ledger.record({ type: 'core-demo', text: '没有 DSH 也能记账' })
const rows = ledger.today(5)
console.log(`今天账本 ${rows.length} 条，最后一条：`, JSON.stringify(rows[rows.length - 1]))

const open = soul.openJobs()
console.log(`未结派活 ${open.length} 件`, open.slice(0, 3).map((j) => j.id))

// 六能力里的“注册工具 / 发话”：CLI 也能跑。
cli.registerTool({ name: 'demo_echo', execute: async (args) => ({ ok: true, echo: args?.text || '' }) })
console.log('工具列表：', cli.listTools().join(','))
const echo = await cli.runTool('demo_echo', { text: '你好' })
console.log('工具结果：', JSON.stringify(echo))
await host().send('demo-session', '这是 CLI 宿主发的一句话')
