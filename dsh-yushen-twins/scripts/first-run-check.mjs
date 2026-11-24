// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/first-run-check.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
/* 标签
 * id: first-run-check
 * kind: script
 * summary: 首装 10 分钟验收：在 mkdtemp 的临时家里把「装完能不能用」的七件事跑一遍，输出人话报告。
 * tags: 首装, 验收, 自检, 临时家, 干净机器
 * created: 2026-11-24 20:5x
 * author: 大鱼·本班（子会话）
 * authority: 老板（2026-11-24：首装 10 分钟验收自动化）
 * audience: 安装者、维护、出厂检查
 * usage: node scripts/first-run-check.mjs；有 FAIL 时退出码 1
 * why: 新机器装完，七处最容易“看着装好了、其实第一句就崩/说吓人话”
 * result: 每项一行 PASS/FAIL；临时家测完删除；不碰真 ~/.dsh、不碰真桥
 * mutable: 可改；只读真家（真家根本不会被指向），只写自己 mkdtemp 的临时家
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href)
const msg = (e) => String(e?.message || e).replace(/\s+/g, ' ').slice(0, 180)

// 干净机器：临时 DSH_HOME + 临时桥状态（不读这台机器上真的 people-*.json）。
// 必须在任何 lib 模块 import 之前设好——好几个模块在 import 时就把 HOME 定死了。
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-first-run-'))
const BRIDGE = path.join(TMP, 'qq-bridge')
process.env.DSH_HOME = TMP
process.env.QQ_BRIDGE_ROOT = BRIDGE
process.env.QQ_BRIDGE_STATE = path.join(BRIDGE, 'state')

const results = []
const add = (status, name, note = '') => results.push({ status, name, note })

try {
  // 1. 灵魂注入：干净装没点化，空串是正常的，不抛错
  try {
    const soul = await load('lib/soul.js')
    const text = soul.buildSceneText('dayu', 'desk', { task: '你好' })
    if (typeof text !== 'string') add('FAIL', '灵魂注入', `返回值不是字符串（${typeof text}）`)
    else if (!text.trim()) add('PASS', '灵魂注入', '未点化：注入为空（预期）')
    else add('PASS', '灵魂注入', `注入 ${text.length} 字（干净装本不该点化，需留意）`)
  } catch (e) {
    add('FAIL', '灵魂注入', `抛错：${msg(e)}`)
  }

  // 2. 一页现在：不能出现“读不到承诺账”这种吓人话
  try {
    const nowPage = await load('lib/now-page.js')
    const text = nowPage.buildNowPage('dayu')
    if (typeof text !== 'string' || !text.trim()) {
      add('FAIL', '一页现在', '输出为空')
    } else {
      const first3 = text.split(/\r?\n/).slice(0, 3).map((s) => s.trim()).filter(Boolean).join(' / ')
      if (text.includes('读不到承诺账')) add('FAIL', '一页现在', `出现「读不到承诺账」（首装没人建承诺账也不能吓人）；前3行：${first3}`)
      else add('PASS', '一页现在', `前3行：${first3}`)
    }
  } catch (e) {
    add('FAIL', '一页现在', `抛错：${msg(e)}`)
  }

  // 3. 进度视图：空表允许，不抛错
  try {
    const progress = await load('lib/progress.js')
    const text = progress.renderProgress()
    if (typeof text !== 'string' || !text.trim()) add('FAIL', '进度视图', '输出为空')
    else add('PASS', '进度视图', `输出 ${text.length} 字（空表允许：没有在做/答应/派活）`)
  } catch (e) {
    add('FAIL', '进度视图', `抛错：${msg(e)}`)
  }

  // 4. 关系簿：不能把 JSON 的 people / version 键当成人
  try {
    const book = await load('lib/relations-book.js')
    const text = book.renderRelationsBook('dayu')
    if (typeof text !== 'string' || !text.trim()) {
      add('FAIL', '关系簿', '输出为空')
    } else {
      const badKey = /^##\s+(people|version)(\s|（|$)/mi.exec(text)
      if (badKey) add('FAIL', '关系簿', `把键当成人：出现了「## ${badKey[1]}」`)
      else add('PASS', '关系簿', `输出 ${text.length} 字，没把 people / version 当人`)
    }
  } catch (e) {
    add('FAIL', '关系簿', `抛错：${msg(e)}`)
  }

  // 5. 自我记忆注入：空家返回空串，不抛错（必须在第 7 项写入之前跑）
  try {
    const self = await load('lib/self-memory.js')
    const text = self.selfMemoryBlock('dayu')
    if (typeof text !== 'string') add('FAIL', '自我记忆注入', `返回值不是字符串（${typeof text}）`)
    else if (text === '') add('PASS', '自我记忆注入', '空家返回空串（预期）')
    else add('FAIL', '自我记忆注入', `空家不该有内容，却返回 ${text.length} 字：${text.slice(0, 60)}`)
  } catch (e) {
    add('FAIL', '自我记忆注入', `抛错：${msg(e)}`)
  }

  // 6. 层级摘要：没有那天就明说“没有轮次记录”，不抛错
  try {
    const tree = await load('lib/summary-tree.js')
    const r = tree.daySummary('2026-01-01')
    const text = typeof r === 'string' ? r : r?.text
    if (!text) add('FAIL', '层级摘要', `没返回文本（${typeof r}）`)
    else if (!text.includes('没有轮次记录')) add('FAIL', '层级摘要', `没说明「没有轮次记录」：${text.replace(/\s+/g, ' ').slice(0, 80)}`)
    else add('PASS', '层级摘要', '返回「没有轮次记录」（ok=false 也算正常）')
  } catch (e) {
    add('FAIL', '层级摘要', `抛错：${msg(e)}`)
  }

  // 7. 自我记忆写入/读取：写一条再读回
  try {
    const self = await load('lib/self-memory.js')
    const wrote = self.appendSelf({ kind: 'deed', text: '首装验收：写一条就够', emotion: '稳', about: '验收' })
    if (!wrote?.ok) {
      add('FAIL', '自我记忆写入/读取', `没写进去：${wrote?.error || '未知原因'}`)
    } else {
      const rows = self.readSelf({ limit: 5, role: 'dayu' })
      const hit = rows.find((r) => r.text === '首装验收：写一条就够')
      if (!hit) add('FAIL', '自我记忆写入/读取', `写入返回 ok，但读不到（读到 ${rows.length} 条）`)
      else add('PASS', '自我记忆写入/读取', '写入后读回 1 条（临时家的 self-memory.jsonl）')
    }
  } catch (e) {
    add('FAIL', '自我记忆写入/读取', `抛错：${msg(e)}`)
  }
} catch (e) {
  add('FAIL', '验收脚本', `没跑完：${msg(e)}`)
} finally {
  // @safe-delete-exempt: 只删 mkdtemp 临时家
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (e) { add('FAIL', '临时家清理', msg(e)) }
}

const passed = results.filter((r) => r.status === 'PASS').length
const failed = results.filter((r) => r.status === 'FAIL').length

console.log('首装 10 分钟验收（模拟干净机器）')
console.log(`INFO 临时家 — ${TMP}（临时桥状态同目录；测完已删除）`)
for (const r of results) console.log(`${r.status} ${r.name}${r.note ? ` — ${r.note}` : ''}`)
console.log(`总结：${passed} 通过 / ${failed} 失败`)
if (failed) process.exitCode = 1
