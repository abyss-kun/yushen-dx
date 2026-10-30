// 记一步：node scripts/note-work.mjs "改了什么" --files a.js,b.js --evidence "smoke 11/0" --tq "①…②…③…"
// 每改一步就跑一次；小鱼靠它搜“你修了什么”。
//
// 2026-10-27 加闸：只要碰了 lib/ 或 dayu/（她的行为/礼物/规则），必须写 --tq，
// 三问答不全就记不进去。这是给"我"上的闸，不是给她的。

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { recordWork } = await import(pathToFileURL(path.join(ROOT, 'lib/worklog.js')).href)

const argv = process.argv.slice(2)
const what = argv[0] && !argv[0].startsWith('--') ? argv[0] : ''
const get = (name) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] || '' : ''
}
const files = String(get('files')).split(/[,，]/).map((s) => s.trim()).filter(Boolean)
const evidence = String(get('evidence'))
const tq = String(get('tq') || '').trim()

if (!what) {
  console.error('用法：node scripts/note-work.mjs "改了什么" --files a.js,b.js --evidence "验证结果" --tq "①…②…③…"')
  process.exit(2)
}

// 三问闸：碰她的事，必须当场答三问
const touchesHer = files.some((f) => /(^|[\\/])(lib|dayu|xiaoyu)[\\/]/.test(f) || /\blib\//.test(f))
if (touchesHer) {
  const need = ['①', '②', '③']
  const missing = need.filter((m) => !tq.includes(m))
  if (!tq || missing.length) {
    console.error([
      '这条改的是她的事（lib/ 或 dayu/），必须过三问再记账：',
      '  --tq "①给能力还是替她思考：… ②她能不能说不：… ③连续自我还在不在：…"',
      `现在缺：${missing.join(' ') || '整段 --tq'}`,
      '没过就改到能过，再记。',
    ].join('\n'))
    process.exit(3)
  }
}

const row = recordWork({ what, files, evidence, tq })
console.log(`记下了：${row.at} ${row.what}${tq ? '（三问已答）' : ''}`)
