// 把她的本体同步进刷B站的 personaPrompt。
// 用法：
//   ELECTRON_RUN_AS_NODE=1 "<DeepSeek Harness.exe>" scripts/bili-soul-sync.mjs            # 实际写（自动备份）
//   ... --dry-run / --force / --role=xiaoyu / --config=<path>
import { syncBiliPersona, biliConfigPath } from '../lib/bili-sync.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const role = (args.find((a) => a.startsWith('--role=')) || '--role=xiaoyu').slice(7)
const config = (args.find((a) => a.startsWith('--config=')) || '').slice(9) || biliConfigPath()

const result = syncBiliPersona({ role, force, dryRun, configPath: config })
console.log(JSON.stringify({ config, role, ...result }, null, 2))
if (!result.ok) process.exitCode = 2
