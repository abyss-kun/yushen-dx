/* 标签
 * id: build-reply-sense
 * kind: module
 * tags: 关系档位, 阈值, 回不回
 * created: 2026-11-04 14:15:00
 * changed: 2026-11-04 14:15:00
 * author: 照微·工作台
 * authority: 老板（2026-11-04：回不回靠关系好感，不摇骰子）
 * why: 桥要判断"群里这个人熟不熟"，阈值得有个双方都看得到的地方，不能写死在桥里
 * result: 写 ~/.dsh/dayu/relations/reply-sense.json（阈值 + 她自己的调整），桥读它判断
 * mutable: 可改
 */
// 用法：node scripts/build-reply-sense.mjs [--dry]
// 输出：~/.dsh/dayu/relations/reply-sense.json
//   { at, policy: { closeMin, knownMin, fatigueQuiet }, by, note }
// 她可以改这个文件里的阈值（那是她的手感）；桥只读。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const D = path.join(HOME, 'dayu')
const dry = process.argv.includes('--dry')

const { DEFAULT_SENSE } = await import(pathToFileURL(path.join(ROOT, 'lib', 'reply-sense.js')).href)

const file = path.join(D, 'relations', 'reply-sense.json')
let prev = {}
try { prev = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* 第一次 */ }

// 她改过的阈值保留（这是她的手感，不能被脚本冲掉）；没改的用默认。
const policy = { ...DEFAULT_SENSE, ...(prev.policy || {}) }
const { fmtFull } = await import(pathToFileURL(path.join(ROOT, 'lib', 'clock.js')).href)
const out = {
  at: fmtFull(),
  policy,
  by: 'plugin',
  note: '回不回按档位：主人/被点名/私聊必回；群里按熟人程度；她写「这轮不说」优先。改这里的数字就是改她的手感。',
}

if (dry) {
  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}
fs.mkdirSync(path.dirname(file), { recursive: true })
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8')
console.log(`写好了：${file}（closeMin=${policy.closeMin} knownMin=${policy.knownMin} fatigueQuiet=${policy.fatigueQuiet}）`)
