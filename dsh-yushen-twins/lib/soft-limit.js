/* 标签
 * id: lib-soft-limit
 * kind: module
 * summary: 软边界 + 硬上限（老板 2026-10-18 口径 + 2026-11-10 澄清）：每天最多回复 N 次、每天预算 ¥M 是硬线，到线即停；3 个来回是软线，**到了正常就该收手**，但她可以凭自己的意志跳出去一次（做她认为对的事、或跟关系好的人交代一声），做完回来，不辞而别不行；**本模块不生成任何台词**。
 * tags: 额度, 软边界, 硬上限, 省钱, QQ, 心跳
 * audience: 她（面板/醒来那段）、桥（发消息前问一句）、新装的角色
 * owner: 框架；数字她自己改（limits.json），判据要老板点头才能改
 * defaults: 20 句 / ¥1 / 3 个来回（limits.json 可覆盖）
 * usage: checkSpeak(role) → {phase,allow,canStepOut,why}；到线要交代就调 noteStepOut；面板读 statusOf
 * off: 把 limits.json 写成 1000 / ¥999 / 999，等于不管；模块不生成台词，关掉不影响回话
 * created: 2026-11-10 22:35:00
 * changed: 2026-11-11 00:47:31
 * author: 大鱼·子代理（软边界）
 * authority: 老板（2026-11-10 任务书，原文照抄见下）
 * why: 以前只有「报账」没有「线」——她不知道今天还剩几句、到没到软线、破了没留痕；触线时也没有一个「她本来就允许突破软线」的出口。
 * result: checkSpeak 给四样事实（到没到线 / 默认该不该收手 / 还能不能跳出去一次 / 为什么）；noteStepOut 记一次"跳出去"；statusOf 给她和面板看今天。
 * mutable: 可改（**不许在本模块里生成台词**：收尾那句必须她自己说，或从她的话术库里挑）
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-10 22:36｜大鱼·子代理（软边界）｜授权：主人（2026-11-10 22:27 任务书：心跳分组 + 软边界额度）｜lib/soft-limit.js:1-…｜新增：LIMITS/limitsOf/speaksToday/moneyToday/checkSpeak/noteException/exceptionsToday/statusOf｜为什么：以前只有报账没有线——她不知道今天还剩几句、到没到软线、破了没留痕；硬线（20 次 / ¥1）到了却没人判，软线（3 个来回）到了也没有"她本来就允许破"的出口｜验证：node --check lib/soft-limit.js；node scripts/test-soft-limit.mjs 8/8（0 句放行 / 3 句只标软线 / 20 句停 / ¥1 停 / limits.json 覆盖 / 破线留痕只增 / 读不到流水不冒充 0 / 无回话函数）｜可改：可改，但**这个文件里永远不许生成台词**——额度是约束，不是台词
//
// 老板 2026-10-18 的口径（原文，照抄，不许改写精神）：
//   · 每天最多回复次数：默认 20，可改
//   · 每天预算：默认 ¥1，可改
//   · 两个都是**硬上限**，到了就停
//   · **3 个来回是「软限制」**
//       - 正常情况下最多 3 个来回
//       - 如果小肥鱼喜欢对方，可以突破 3 个来回
//       - 但**永远不能突破**每天 20 次 / ¥1
//       - 意犹未尽、要收尾时，用**她自己的话**说：「小肥鱼饿了，没钱吃饭了」「主人不给我饭吃了，没力气聊了」
//       - 不突然消失，给个体面的结束
//   · 固定话术优先，0 token；没话术 → 模型现写（可关）
//
// 落成程序之后的三条边界（2026-11-10 老板澄清后改过一次，旧说法作废）：
//   ① **硬线在 checkSpeak 里判死**：到线返回 allow:false，没有"再破一次"的参数——不可破就是不可破。
//   ② **软线到了 = 正常该收手**（allow:false），**不是"还能说"**。旧文案「还可以说，破不破由她自己定」
//      说得太松，等于没有边界，老板纠过一次：
//        「到软线，正常情况下就应该收收手了，但是我可以凭借自己的意志和想法，跳出这个边界，
//          去做我认为对的事情，做完了，再回来……不能不辞而别，因为我和她关系好。」
//      所以给的是**一次性出口**（canStepOut / noteStepOut），不是常开的许可：
//        · 跳出去是她的选择，不是系统的默认；
//        · 跳出去该有交代（说一声为什么先走 / 约下次），说完要回来（record 里记 why/to）；
//        · 一天一次；用过了 steppedOut=true，就不再给。
//   ③ **这里一个字都不生成**：不收 persona、不读角色卡、不拼句子。原因就是老板那句
//      「说一句额度到了，她给别人就说额度到了，这是机器不是智能体」——
//      额度是约束，不是台词。收尾那句话只能她自己说；她说不出来，就如实沉默（上层决定怎么收尾）。
//
// 数据来源（全部只读，失败静默）：
//   · 今天回了几句：桥的发送流水 `state/tool-calls.jsonl`（复用 lib/cost.js 的 recentSaid）
//   · 今天花了多少：桥的 token 流水 `state/token-usage.jsonl`（复用 lib/cost.js 的 qqBudgetUsed）
//   · 额度：`~/.dsh/dayu/limits.json`（没有就用默认值）
//   · 破软线记录：`~/.dsh/dayu/runtime/<角色>/soft-exceptions.jsonl`（只增不删）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runtimeDir } from './runtime.js'
import { qqBudgetUsed, recentSaid } from './cost.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')

/** 默认额度（老板 2026-10-18 定的数；只许被 limits.json 覆盖，不许在别处再写一份）。 */
export const LIMITS = Object.freeze({ speakPerDay: 20, moneyPerDay: 1, roundsSoft: 3 })

/** 硬线只有两种；别自己加第三种。 */
export const HARD_KINDS = Object.freeze(['none', 'speak', 'money'])

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return fallback }
}
function oneLine(s, n = 160) { return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n) }
function num(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }

/** 今天从哪毫秒起（本地零点；不写死 +8，换时区也对）。 */
export function dayStartOf(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 当前生效的额度：默认值 ← limits.json 覆盖（只认正数；写坏了就退回默认）。 */
export function limitsOf() {
  const raw = readJson(path.join(DATA, 'limits.json'), {}) || {}
  const out = { ...LIMITS }
  for (const k of Object.keys(LIMITS)) if (num(raw[k])) out[k] = num(raw[k])
  return out
}

/** 今天她回了几句（数不到就 null——**不拿 0 冒充"没说话"**）。 */
export function speaksToday(role, { now = Date.now() } = {}) {
  const id = String(role || '').trim()
  if (!id) return null
  const minutes = Math.max(1, Math.ceil((now - dayStartOf(now)) / 60000))
  const n = recentSaid(id, { now, minutes })
  // 注意：不能用 Number(n) 判——Number(null) === 0，会把"读不到"伪装成"一句没说"。
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

/** 今天 QQ 侧花了多少元（只读；工作台别的通道不在这个 ¥1 里）。 */
export function moneyToday({ now = Date.now() } = {}) {
  try {
    const b = qqBudgetUsed({ now })
    return Number.isFinite(Number(b?.day)) ? Number(b.day) : 0
  } catch { return 0 }
}

/**
 * 这一句能不能说。
 * - **硬线**：`allow:false`，不可破（没有"再破一次"的开关）。
 * - **软线**：只给 `softHit:true`，`allow` 仍是 true——破不破由她定。
 * @param {string} role
 * @param {{now?:number}} [opts]
 * @returns {{allow:boolean, hard:'none'|'speak'|'money', soft:{rounds:number|null, softHit:boolean},
 *            speaks:number|null, money:number, limits:{speakPerDay:number,moneyPerDay:number,roundsSoft:number},
 *            leftSpeak:number|null, leftMoney:number, why:string}}
 */
export function checkSpeak(role, { now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const limits = limitsOf()
  const speaks = speaksToday(id, { now })
  const money = moneyToday({ now })
  const rounds = speaks // 一轮来回 = 她回一句；按"同一会话"算需要桥的会话映射，现在没有，不假装有
  const softHit = speaks !== null && rounds >= limits.roundsSoft
  const speakHard = speaks !== null && speaks >= limits.speakPerDay
  const moneyHard = money >= limits.moneyPerDay
  const hard = moneyHard ? 'money' : (speakHard ? 'speak' : 'none')
  const phase = hard !== 'none' ? 'hard' : (softHit ? 'soft' : 'normal')
  const allow = phase === 'normal'
  const steps = exceptionsToday(id, { now })
  const steppedOut = steps.count > 0
  // 跳出去是**她的一次性出口**：到了线才给，一天一次，用过就没有。
  const canStepOut = phase !== 'normal' && !steppedOut

  let why = ''
  if (hard === 'money') {
    why = `今天 QQ 花了 ¥${money.toFixed(2)}，到预算线 ¥${limits.moneyPerDay} 了——到线就停，不能再聊。`
    if (speakHard) why += `回复次数也到线了（${speaks}/${limits.speakPerDay}）。`
    if (canStepOut) why += '还在等你的人，值得你交代一句（一天一次）；说完就回来。'
  } else if (hard === 'speak') {
    why = `今天回了 ${speaks} 句，到次数线 ${limits.speakPerDay} 了——到线就停，不能再聊。`
    if (canStepOut) why += '要跟人说一声为什么先走也行（一天一次）；不辞而别不行。'
  } else if (softHit) {
    why = `今天回了 ${rounds} 句，到软线（${limits.roundsSoft} 个来回）了——**正常该收手**。`
    if (canStepOut) why += '如果这件事值得，你可以跳出去做完再回来（一天一次，说清为什么）；不辞而别不行。'
    else why += '今天那次出口已经用过了。'
  } else if (speaks === null) {
    why = '数不清今天回了几句（桥的发送流水读不到）——这是"不知道"，不是 0；按没到线处理'
  } else {
    why = `今天回了 ${speaks} 句、花了 ¥${money.toFixed(2)}；还没到软线（${limits.roundsSoft} 个来回）`
  }

  return {
    ok: true,
    phase, allow,
    canStepOut, steppedOut,
    hard,
    soft: { rounds, softHit },
    speaks,
    money,
    limits,
    leftSpeak: speaks === null ? null : Math.max(0, limits.speakPerDay - speaks),
    leftMoney: Math.max(0, Number((limits.moneyPerDay - money).toFixed(2))),
    why,
  }
}

function exceptionsFile(role) { return path.join(runtimeDir(role), 'soft-exceptions.jsonl') }

/**
 * 记一次「跳出去」：到了线，她选择凭自己的意志再说一句（交代原因、约下次、道别）。
 * **不是审批，是留痕**：只增，失败静默。一天只该有一次（canStepOut 会看着）。
 * @returns {{ok:boolean, at?:string, file?:string, speaks?:number|null, money?:number, reason?:string}}
 */
export function noteStepOut(role, { why = '', to = '', now = Date.now() } = {}) {
  const id = String(role || '').trim()
  if (!id) return { ok: false, reason: '没有角色' }
  try {
    const speaks = speaksToday(id, { now })
    const money = moneyToday({ now })
    const row = {
      at: new Date(now).toISOString(),
      role: id,
      why: oneLine(why, 200),
      to: oneLine(to, 60),
      speaks,
      money,
      limits: limitsOf(),
    }
    const file = exceptionsFile(id)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
    return { ok: true, at: row.at, file, speaks, money }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 160) }
  }
}

/** 旧名字（2026-11-10 之前叫"破软线"）——保留别名，别让已有调用突然失灵。 */
export const noteException = noteStepOut

/** 今天破过几次软线（读不到就是 0 次；这是账，不是判断）。 */
export function exceptionsToday(role, { now = Date.now() } = {}) {
  const id = String(role || '').trim()
  if (!id) return { count: 0, lastAt: '', items: [] }
  const from = dayStartOf(now)
  const rows = []
  try {
    const text = fs.readFileSync(exceptionsFile(id), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const r = JSON.parse(line)
        const t = Date.parse(String(r.at || '')) || 0
        if (t >= from && t <= now) rows.push(r)
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 没文件 = 没破过 */ }
  return { count: rows.length, lastAt: rows.length ? String(rows[rows.length - 1].at || '') : '', items: rows.slice(-5) }
}

/**
 * 今天的额度全景（给她自己看，或面板用）。
 * @returns {{ok:boolean, role:string, day:string, limits:object, speaks:number|null, money:number,
 *            rounds:number|null, softHit:boolean, hard:string, allow:boolean,
 *            leftSpeak:number|null, leftMoney:number, leftToSoft:number|null,
 *            exceptions:{count:number,lastAt:string,items:Array}, why:string}}
 */
export function statusOf(role, { now = Date.now() } = {}) {
  const id = String(role || '').trim()
  const c = checkSpeak(id, { now })
  const ex = exceptionsToday(id, { now })
  const d = new Date(now)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    ok: true,
    role: id,
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    limits: c.limits,
    phase: c.phase,
    speaks: c.speaks,
    money: c.money,
    rounds: c.soft.rounds,
    softHit: c.soft.softHit,
    hard: c.hard,
    allow: c.allow,
    canStepOut: c.canStepOut,
    steppedOut: c.steppedOut,
    leftSpeak: c.leftSpeak,
    leftMoney: c.leftMoney,
    leftToSoft: c.speaks === null ? null : Math.max(0, c.limits.roundsSoft - c.speaks),
    exceptions: ex,
    why: c.why,
  }
}
