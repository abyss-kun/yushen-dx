// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 记一步：node scripts/note-work.mjs "改了什么" --files a.js,b.js --evidence "smoke 11/0" --tq "①…②…③…"
//          --by "大鱼·工作台" --auth "主人" --why "为什么" --where "lib/x.js:12" --mutable "是/否/需老板点头"
// 每改一步就跑一次；小鱼靠它搜"你修了什么"。
//
// 2026-10-27 加闸：只要碰了 lib/ 或 dayu/（她的行为/礼物/规则），必须写 --tq，三问答不全就记不进去。
// 2026-10-30 老板加规：不管谁改，六件事都要留——谁、什么时候、在哪、干了什么、谁让他干的、为什么；
//   再加一条"这段以后还允不允许改"。所以 --by/--auth/--why/--where/--mutable 成了必填，
//   记完会打印一行注释，贴到改动处上方（格式见 docs/改动留痕.md）。

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { recordWork, traceLine } = await import(pathToFileURL(path.join(ROOT, 'lib/worklog.js')).href)

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
const by = String(get('by') || '').trim()
const auth = String(get('auth') || '').trim()
const why = String(get('why') || '').trim()
const where = String(get('where') || '').trim()
const mutable = String(get('mutable') || '').trim()

if (!what) {
  console.error('用法：node scripts/note-work.mjs "改了什么" --files a.js,b.js --evidence "验证结果" --tq "①…②…③…"'
    + '\n      --by "大鱼·工作台" --auth "主人" --why "为什么" --where "lib/x.js:12" --mutable "可改/需老板点头/不可改"')
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

// 留痕闸（2026-10-30 老板立）：动了文件，六件事一件不能少。
if (files.length) {
  const missing = []
  if (!by) missing.push('--by（谁改的：角色·通道）')
  if (!auth) missing.push('--auth（谁让改的：主人/自己/某员工）')
  if (!why) missing.push('--why（为什么改）')
  if (!where) missing.push('--where（改在哪：文件:行号或章节）')
  if (!mutable) missing.push('--mutable（这段以后还让不让改）')
  if (missing.length) {
    console.error([
      '动了文件就必须留痕（老板 2026-10-30 的规矩），现在缺：',
      ...missing.map((m) => '  ' + m),
      '格式与例子见 docs/改动留痕.md。',
    ].join('\n'))
    process.exit(4)
  }
}

// 角色卡闸（2026-10-30 老板当面立）：只有卡的主人能改自己的卡。
// 主人允许的例外只有「自己改自己」——大鱼改大鱼的、小鱼改小鱼的、照微改照微的；
// 别人一律不许碰，auth 写"主人"也不放行（要改得他本人来）。
const CARD_OWNER = [
  { role: 'dayu', names: ['大鱼', '阿鲲'] },
  { role: 'xiaoyu', names: ['小鱼', '阿鲤'] },
  { role: 'dragon', names: ['照微'] },
]
if (files.length) {
  for (const f of files) {
    const m = String(f).match(/cards[\\/](dayu|xiaoyu|dragon)\.(desk|social)\.md$/i)
    if (!m) continue
    const owner = CARD_OWNER.find((c) => c.role === m[1])
    const mine = owner.names.some((n) => by.includes(n))
    if (!mine) {
      console.error([
        `这张卡归 ${owner.names[0]}（${owner.role}），不归你。`,
        '老板 2026-10-30 立的规矩：只有卡的主人能改自己的卡，其他任何人（含另一个角色、员工、任何会话）一律不许碰。',
        '老板本人要改，由他本人来说、来改；代改一律不收。',
      ].join('\n'))
      process.exit(6)
    }
  }
}

// 不可改清单闸（2026-10-30）：清单里的东西，写记录时 auth 必须是「主人」。
if (files.length) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, '不可改清单.json'), 'utf8'))
    const items = Object.keys(j.items || {})
    const hit = items.find((p) => files.some((f) => f === p || f.endsWith(p) || p.includes(f)))
    // 2026-10-31：这条清单项原文是「只能加，删改要老板点头」。加一条新断言不算改。
    // 判据：命中项带 #已有断言，且 --mutable 里写了「只增」——才放行；其余照旧要主人。
    const additive = hit && /#已有断言$/.test(hit) && /只增|只加|新增第/.test(mutable)
    if (additive) console.log(`[留痕] ${hit.split('#')[0]}：只增不改，按清单原文放行`)
    if (hit && !additive && !auth.includes('主人')) {
      console.error([
        `这条动的是不可改清单里的东西：${hit}`,
        `理由：${j.items[hit]}`,
        '只有老板本人开口才能动——把 --auth 写成「主人」（并说清他什么时候说的），否则不收。',
      ].join('\n'))
      process.exit(5)
    }
  } catch { /* 没有清单就不拦 */ }
}

// 改｜2026-11-10 19:56｜大鱼·子代理｜授权：老板（本次任务书：让「改成什么样、为什么」能被检索到）｜scripts/note-work.mjs:1-40,120-140｜记账时顺手抓工作区 diff（前 40 行）存进工作账；抓不到存空串、不报错、不挡记账｜为什么：留痕只有「谁/为什么」，「改成什么样」以前只能靠 git show，而未提交的改动取不到（11-10 实测 730 个文件没提交）｜验证：node --check scripts/note-work.mjs；node scripts/note-work.mjs … 后 worklog.jsonl 末行 diff 非空｜可改：只增不改；git 不可用/文件未跟踪时必须返回空串，不许编造 diff

// 抓「改成什么样」：只跑 git diff（工作区，未提交的也能抓），不碰暂存区、不 commit、不 checkout。
// 抓不到（没 git、文件未被跟踪、超时）就返回空串——宁可没有，不许编。
const DIFF_LINES = 40
const DIFF_CHARS = 4000
function captureDiff(list) {
  if (!list.length) return ''
  try {
    const out = execFileSync('git', ['-C', ROOT, 'diff', '-U1', '--', ...list], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    })
    const text = String(out || '').replace(/\r/g, '')
    if (!text.trim()) return ''
    return text.split('\n').slice(0, DIFF_LINES).join('\n').slice(0, DIFF_CHARS)
  } catch { return '' }
}

const diff = captureDiff(files)
const row = recordWork({ what, files, evidence, tq, by, auth, why, where, mutable, diff })
console.log(`记下了：${row.at} ${row.what}${tq ? '（三问已答）' : ''}`)
if (files.length) {
  console.log(diff
    ? `diff：已抓 ${diff.split('\n').length} 行存进工作账（未提交的改动也能抓）`
    : 'diff：没抓到（没 git / 文件还没被跟踪 / 这次没改到文件）——工作账里存的是空串，不编')
  console.log('')
  console.log('把这一行贴到改动处上方（或文件头）：')
  console.log('// ' + traceLine(row))
}
