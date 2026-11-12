// 一条命令跑完"交付前必须绿"的两套测试：
//   selftest —— 零件级（按钮、状态、设置、路径、默认值）
//   usertest —— 用户视角（真点、真滚轮、真按 Esc、真改设置）
// 用法：node --experimental-vm-modules scripts/check-all.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const node = process.execPath
const run = (script) => {
  const r = spawnSync(node, ['--experimental-vm-modules', path.join(ROOT, 'scripts', script)], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE || '1' },
  })
  const out = String(r.stdout || '')
  const lines = out.split(/\r?\n/).filter((l) => /✅|❌|===/.test(l))
  const pass = (out.match(/✅/g) || []).length
  const fail = (out.match(/❌/g) || []).length
  return { script, code: r.status, pass, fail, tail: lines.slice(-3) }
}

console.log('=== 交付前检查（改之前 / 改之后各跑一次） ===')
const results = ['selftest.mjs', 'usertest.mjs'].map(run)
let bad = 0
for (const r of results) {
  const ok = r.code === 0 && r.fail === 0
  if (!ok) bad++
  console.log((ok ? '✅ ' : '❌ ') + r.script + '  ' + r.pass + ' 通过 / ' + r.fail + ' 失败')
  for (const line of r.tail) if (line.includes('❌')) console.log('    ' + line)
}
console.log(bad ? '=== 有 ' + bad + ' 套没过，先修 ===' : '=== 两套全绿，可以改/可以交 ===')
process.exit(bad ? 1 : 0)
