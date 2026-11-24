// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/test-eval-general.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: test-eval-general
 * kind: module
 * tags: 测试, 评测, 通用
 * created: 2026-11-24 21:4x
 * author: 大鱼·本班
 * authority: 老板（2026-11-24：出厂用通用评测）
 * why: 评测脚本本身也要能被测，数字才可信
 * result: 题面覆盖七类、无自家词；judgeHits 只看前 k 条；合成数据 20 条/2 卡
 * mutable: 可改
 */
import assert from 'node:assert/strict'

const m = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/eval-general.js')

// 1. 题面：10 题、七类都覆盖、没有自家词
assert.ok(m.QUESTIONS.length >= 10, `题目太少：${m.QUESTIONS.length}`)
const kinds = new Set(m.QUESTIONS.map((q) => q.kind))
for (const k of m.REQUIRED_KINDS) assert.ok(kinds.has(k), `缺一类：${k}`)
for (const q of m.QUESTIONS) for (const w of m.SELF_WORDS) assert.ok(!String(q.q).includes(w), `题面混进自家词「${w}」：${q.q}`)

// 2. judgeHits：只看前 k 条；命中任一 expected 算对
assert.equal(m.judgeHits([{ text: '阿川要搬家' }], ['阿川']).hit, true)
assert.equal(m.judgeHits([{ text: '无关' }, { text: '阿川要搬家' }], ['阿川'], { k: 1 }).hit, false)
assert.equal(m.judgeHits([{ text: '无关' }, { text: '阿川要搬家' }], ['阿川'], { k: 3 }).hit, true)
assert.equal(m.judgeHits([], ['阿川']).hit, false)

// 3. 合成数据：20 条事件、2 张卡
assert.equal(m.seedEvents().length, 20)
assert.equal(m.seedCards().length, 2)

console.log('test-eval-general: 通过（七类覆盖 / 无自家词 / judgeHits / 合成数据）')
