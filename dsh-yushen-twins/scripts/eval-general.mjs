// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/eval-general.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
// 出厂通用记忆评测：临时家 + 20 条合成记忆 + 10 道通用题，量 hit@1 / hit@3。
// 只读检索、当场合成数据，不碰真家（DSH_HOME 指向 mkdtemp 出来的临时目录），跑完把这一个删掉。
// 用法：
//   node scripts/eval-general.mjs            # 默认；有 FAIL 就 exitCode=1
//   node scripts/eval-general.mjs --json     # 机器可读（报告里不含题干原文以外的隐私，本来就没隐私）
//   node scripts/eval-general.mjs --keep     # 留下临时家（排错用）；默认删
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { QUESTIONS, judgeHits, seedEvents, seedCards } from '../lib/eval-general.js'

const args = process.argv.slice(2)
const keep = args.includes('--keep')
const asJson = args.includes('--json')

// ① 先造临时家、把 DSH_HOME 指过去——必须在 import memory-core 之前。
//    原因：memory-core/runtime/recall-use.js 在模块顶层就把 DSH_HOME 读死了，
//    谁先 import 谁决定它往哪个家写「被召回」的账。晚一步就会写到真家。
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-eval-general-'))
process.env.DSH_HOME = HOME

/** 只删自己 mkdtemp 的那一个：路径在系统 temp 下、目录名带固定前缀，两条都满足才删。 */
function cleanup() {
  const real = path.resolve(HOME)
  const tmp = path.resolve(os.tmpdir())
  const mine = real.startsWith(tmp + path.sep) && path.basename(real).startsWith('yushen-eval-general-')
  if (!mine) {
    console.error(`没有删：${real} 不是自己 mkdtemp 出来的临时家（不在系统 temp 下或前缀不对）`)
    return false
  }
  fs.rmSync(real, { recursive: true, force: true })
  return true
}

function writeJson(file, doc) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n', 'utf8')
}

/** 落盘：20 条事件进 dayu.json；2 张卡进 library/在用/记忆/。 */
function seed() {
  const now = Date.now()
  const events = seedEvents({ now })
  writeJson(path.join(HOME, 'dayu', 'soul', 'memory', 'dayu.json'), { role: 'dayu', events })
  const cardFile = path.join(HOME, 'dayu', 'library', '在用', '记忆', '合成卡.jsonl')
  fs.mkdirSync(path.dirname(cardFile), { recursive: true })
  fs.writeFileSync(cardFile, seedCards({ now }).map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf8')
  return { events: events.length, cards: 2 }
}

const n2 = (x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 44)

let exitCode = 2
try {
  const seeded = seed()
  // ② 临时家就位之后再动态 import 检索（静态 import 会被提升到最前面，见上面那段注释）。
  const { searchMemory } = await import('../memory-core/search.mjs')

  const rows = []
  for (const item of QUESTIONS) {
    let hits = []
    let error = ''
    try {
      const r = searchMemory(item.q, { role: 'dayu', limit: 3 })
      if (!r || r.ok === false) error = String(r?.error || '检索没返回 ok')
      hits = Array.isArray(r?.hits) ? r.hits : []
    } catch (e) {
      error = String(e?.message || e)
    }
    const at3 = judgeHits(hits, item.expected, { k: 3 })
    const at1 = judgeHits(hits, item.expected, { k: 1 })
    rows.push({
      id: item.id,
      kind: item.kind,
      q: item.q,
      expected: item.expected,
      hit1: at1.hit,
      hit3: at3.hit,
      rank: at3.rank,
      matched: at3.hit ? item.expected[at3.expectedIndex] : '',
      got: hits.map((h) => n2(h?.text)),
      error,
    })
  }

  const total = rows.length
  const hits1 = rows.filter((r) => r.hit1).length
  const hits3 = rows.filter((r) => r.hit3).length
  const fails = rows.filter((r) => !r.hit3)

  if (asJson) {
    console.log(JSON.stringify({ ok: fails.length === 0, total, hit1: hits1, hit3: hits3, seeded, tempHome: HOME, rows }, null, 2))
  } else {
    const lines = [
      `# 出厂通用记忆评测（临时家，${seeded.events} 条合成记忆 + ${seeded.cards} 张卡，${total} 道通用题，limit=3）`,
      '',
    ]
    for (const r of rows) {
      if (r.hit3) {
        lines.push(`PASS ${r.kind}  ${r.q} → 第 ${r.rank + 1} 条命中「${r.matched}」`)
      } else {
        const why = r.error ? `检索报错：${r.error}` : `前 3 条没有「${r.expected.join(' / ')}」`
        const got = r.got.length ? r.got.map((t, i) => `${i + 1}) ${t}`).join('　') : '（一条都没搜到）'
        lines.push(`FAIL ${r.kind}  ${r.q} → ${why}；拿到的是：${got}`)
      }
    }
    lines.push('', `hit@1 ${hits1}/${total}　hit@3 ${hits3}/${total}`, `总结：${hits3}/${total}`)
    if (fails.length) {
      lines.push('', `没中的 ${fails.length} 题：${fails.map((r) => `${r.id} ${r.q}（期望 ${r.expected.join(' / ')}）`).join('；')}`)
    }
    lines.push('', `临时家：${HOME}（${keep ? '--keep，没删' : '已删'}）`)
    console.log(lines.join('\n'))
  }
  exitCode = fails.length ? 1 : 0
} catch (e) {
  console.error(`跑挂了：${String(e?.stack || e?.message || e)}`)
  exitCode = 2
} finally {
  if (!keep) cleanup() // 只删自己 mkdtemp 的那一个（cleanup 里有两条检查）
}
process.exitCode = exitCode
