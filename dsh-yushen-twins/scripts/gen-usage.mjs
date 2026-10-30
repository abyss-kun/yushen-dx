// 生成《用法档案》：从代码里扫出她有什么工具/接口/脚本/开关，再配上“什么时候用”。
// 不花 token、不靠人写；新增工具后重跑一次，档案就更新。
// 运行：node scripts/gen-usage.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { return '' } }

// 1. 工具
// 2026-10-30：原来只认 dayu_ 前缀，yushen_ 那 18 个整体漏掉；而且 dayu/m1.js 里那些早就不是工具了。
// 现在按 registerTool 扫真名（dayu_ + yushen_），描述优先取代码里的 description。
const toolRows = []
for (const f of ['dayu/index.js']) { // 只认真注册的工具；m1.js 里是旧名单，别算进来
  const text = read(f)
  for (const m of text.matchAll(/name:\s*'((?:dayu|yushen)_[a-z_]+)'[\s\S]{0,500}?description:\s*'([^']{2,160})'/g)) {
    toolRows.push({ name: m[1], desc: m[2].replace(/\s+/g, ' ').trim() })
  }
  for (const m of text.matchAll(/name:\s*'((?:dayu|yushen)_[a-z_]+)'/g)) {
    toolRows.push({ name: m[1], desc: '' })
  }
}
const seenTool = new Map()
for (const row of toolRows) if (!seenTool.has(row.name) || (!seenTool.get(row.name).desc && row.desc)) seenTool.set(row.name, row)
const uniqTools = [...seenTool.keys()].sort()

// 2. 接口
const routes = []
for (const f of ['index.js', 'dayu/index.js', 'xiaoyu/index.js']) {
  const text = read(f)
  for (const m of text.matchAll(/url\.pathname\s*===\s*'([^']+)'/g)) routes.push(`${m[1]}`)
  for (const m of text.matchAll(/route\s*===\s*'([^']+)'/g)) routes.push(`${f.startsWith('dayu') ? '/api/dayu' : '/api/xiaoyu'}${m[1]}`)
}

// 3. 脚本
const scripts = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs')).sort()

// 4. 开关
const switches = [...read('dayu/index.js').matchAll(/^\s+(master|dayu|xiaoyu|autoRepair|selfApply):/gm)].map((m) => m[1])

// 5. 最近工作记录
const HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || '', '.dsh')
let recentWork = []
try {
  recentWork = fs.readFileSync(path.join(HOME, 'dayu', 'worklog.jsonl'), 'utf8').trim().split(/\r?\n/).slice(-8).reverse()
    .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
} catch { /* 还没记录 */ }

const useWhen = {
  dayu_dispatch: '要把活交给别人/别的会话时',
  dayu_tasks: '看派了多少、回没回、卡在哪',
  dayu_verify: '验收取证：读文件、查语法、搜工作区',
  dayu_verdict: '收工或打回；打回会自动重投',
  dayu_patch: '发现要改自己时：先写草案，等老板点落盘',
  dayu_health: '看她还活着没有、今天干了多少',
  dayu_roster: '看装了哪些插件',
  dayu_live: '看现在谁在跑',
  dayu_incidents: '看/结事故单',
  dayu_idea_capture: '老板冒出的好想法，记一条',
  dayu_plan_capture: '老板说“打算/下一步”，记计划',
}

const lines = [
  '# 用法档案（自动生成）',
  '',
  `> 生成：${new Date().toISOString()} · 别手改；改代码后跑 \`node scripts/gen-usage.mjs\` 重生成。`,
  '',
  '## 一、她的工具（什么时候用）',
  '',
  '| 工具 | 什么时候用 |',
  '|---|---|',
  ...uniqTools.map((t) => `| \`${t}\` | ${useWhen[t] || '（待补一句：什么时候用）'} |`),
  '',
  '## 二、接口（谁调、干什么）',
  '',
  '```',
  ...[...new Set(routes)].sort().join('\n') ? [...new Set(routes)].sort() : ['（没扫到）'],
  '```',
  '',
  '## 三、脚本（开发/运维用）',
  '',
  ...scripts.map((s) => `- \`scripts/${s}\``),
  '',
  '## 四、开关',
  '',
  ...switches.map((s) => `- \`${s}\``),
  '',
  '## 五、最近改了什么（工作记录）',
  '',
  ...(recentWork.length ? recentWork.map((w) => `- ${String(w.at).slice(0, 16).replace('T', ' ')} ${w.what}`) : ['- （还没有记录）']),
  '',
  '## 六、怎么用这个开发 Agent',
  '',
  '- 它**只在老板给指令时动**，不会自己在后台改代码；',
  '- 每改一步要入账（`note-work.mjs`），问“改了什么”先搜 worklog；',
  '- 它写代码 → 跑 `smoke`/`regression`/`verify-settings` → 绿了才报；',
  '- 她要改自己：写补丁草案 → 老板点「落盘」→ 备份 + smoke + 不过回滚。',
  '',
]
const out = path.join(ROOT, 'docs', '用法档案.md')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, lines.join('\n'), 'utf8')
console.log(`用法档案：${out}`)
console.log(`工具 ${uniqTools.length} 个，接口 ${new Set(routes).size} 条，脚本 ${scripts.length} 个，开关 ${switches.length} 个`)
