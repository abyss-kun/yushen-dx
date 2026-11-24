// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/test-now-page.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: test-now-page
 * kind: module
 * tags: 测试, 注入, 现在, 议程
 * created: 2026-11-21 20:0x
 * author: 大鱼·本班
 * authority: 老板（2026-11-21：一页现在，换会话第一句能接上）
 * why: 没有这一页，换会话就靠检索猜
 * result: 手上/答应/决定/家里/心情 都出现；≤320 字；没数据不崩；别处只看别的会话；空账不说“读不到”
 * mutable: 可改
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-now-'))
process.env.DSH_HOME = TMP
const D = path.join(TMP, 'dayu')
fs.mkdirSync(path.join(D, 'runtime', 'dayu'), { recursive: true })
fs.mkdirSync(path.join(D, 'relations'), { recursive: true })

fs.writeFileSync(path.join(D, 'runtime', 'dayu', 'agenda.json'), JSON.stringify({
  items: [
    { id: 'a1', what: '修字典', state: 'doing', updatedAt: '2026-11-21T10:00:00' },
    { id: 'a2', what: '写周报', state: 'want', updatedAt: '2026-11-21T10:00:00' },
    { id: 'a3', what: '每天背单词', state: 'doing', updatedAt: '2026-11-21T10:00:00' },
  ],
}), 'utf8')
fs.writeFileSync(path.join(D, 'runtime', 'dayu', 'mood.json'), JSON.stringify({ value: 66, updatedAt: '2026-11-21T10:00:00' }), 'utf8')
fs.writeFileSync(path.join(D, 'relations', 'promises.jsonl'), JSON.stringify({
  id: 'p1', what: '把报告发他', status: 'open', madeAt: '2026-11-21T09:00:00',
}) + '\n', 'utf8')
fs.writeFileSync(path.join(D, 'capmap.json'), JSON.stringify({ items: [{}, {}, {}] }), 'utf8')
fs.writeFileSync(path.join(D, 'definitions.jsonl'), JSON.stringify({
  at: '2026-11-20T00:00:00', text: '图书馆收整个软件', source: '测试',
}) + '\n', 'utf8')

const { buildNowPage } = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/now-page.js')
const t = buildNowPage('dayu')
for (const s of ['现在', '手上：修字典', '答应：把报告发他', '决定：图书馆收整个软件', '家里：3 条', '心情：']) {
  assert.ok(t.includes(s), `缺「${s}」：\n${t}`)
}
assert.ok(t.length <= 320, `一页现在太长：${t.length}`)
assert.ok(!t.includes('每天背单词'), '日常习惯不该占“手上”')

// 聊到定义话题时，“决定”让给“长期决定”块，不在现在里重复
const t2 = buildNowPage('dayu', { task: '图书馆收什么' })
assert.ok(!t2.includes('决定：'), `定义话题下不该重复“决定”：\n${t2}`)

// 只有日常在跑时，说人话，不硬充“在做”
fs.writeFileSync(path.join(D, 'runtime', 'dayu', 'agenda.json'), JSON.stringify({
  items: [{ id: 'b1', what: '每日巡检', state: 'doing', updatedAt: '2026-11-21T10:00:00' }],
}), 'utf8')
assert.match(buildNowPage('dayu'), /没有在做的（日常照旧）/)

// 别处：别的会话最近在做、还没写进议程的临时活（1 小时前那条要出现，本会话那条不能顶上来）
const WL = path.join(D, 'worklog.jsonl')
const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
fs.writeFileSync(WL, [
  JSON.stringify({ at: hourAgo, session: 'session-a', kind: 'change', what: '本会话在改的东西' }),
  JSON.stringify({ at: hourAgo, session: 'session-b', kind: 'change', what: '别的会话在改的东西' }),
].join('\n') + '\n', 'utf8')
const t3 = buildNowPage('dayu', { sessionId: 'session-a' })
assert.ok(t3.includes('别处：别的会话在改的东西'), `别处没取到别的会话那条：\n${t3}`)
assert.ok(!/别处：本会话/.test(t3), `别处不该是本会话自己：\n${t3}`)
assert.match(t3, /别处：别的会话在改的东西（\d+ 分钟前）/, `别处缺“几分钟前”：\n${t3}`)
assert.ok(t3.length <= 320, `带别处的一页现在太长：${t3.length}`)

// 没有 worklog 就不出“别处”这一行（宁可少一行，不编“暂无”）
fs.rmSync(WL, { force: true })
const t4 = buildNowPage('dayu', { sessionId: 'session-a' })
assert.ok(!t4.includes('别处：'), `没有 worklog 却出了别处：\n${t4}`)

// 新装机：没有 promises.jsonl 就说“没有欠着的”，不说“读不到承诺账”
fs.rmSync(path.join(D, 'relations', 'promises.jsonl'), { force: true })
const t5 = buildNowPage('dayu')
assert.match(t5, /答应：没有欠着的/, `空承诺账说得吓人：\n${t5}`)
assert.ok(!t5.includes('读不到承诺账'), `空承诺账还在喊读不到：\n${t5}`)

// 没数据的角色不崩，也说人话
const w = buildNowPage('workbench')
assert.match(w, /手上：/)
assert.ok(w.length <= 320)

fs.rmSync(TMP, { recursive: true, force: true })
console.log('test-now-page: 通过（五行齐 / ≤320 / 别处只认别的会话 / 空账不喊读不到）')
