/* 标签
 * id: lib-usage-workbench
 * kind: module
 * summary: 工作台账本（2026-11-02 补）
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: recordWorkbenchTurn（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 工作台账本（2026-11-02 补）。
// 改｜2026-11-02 16:12｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜lib/usage-workbench.js:46｜工作台用量账本的当日改成 clock 的本地日｜为什么：手写偏移不是系统时间：换机器或换时区就全错，各处口径还不一致｜验证：node --check 通过；node scripts/regression.mjs 全绿；全仓扫描无手写偏移｜可改：可改（只许换成 lib/clock.js 的其他封装）
// 为什么存在：余额卡片上写着「工作台那边的账本停了 N 小时，那边的花费看不见」——
// 因为工作台的用量文件 ~/.dsh/.dshw-usage.json 从来没人生成过，账本里只有 QQ 侧。
// 这里把工作台每轮回话折算成用量，写进**同一个账本**（key = workbench），
// 顺手把 .dshw-usage.json 也补齐（插件读的是它）。
//
// 口径：工作台没有逐轮的 usage 回执，只能按注入 + 正文估：
//   缓存命中 ≈ 本轮注入字数（不含本轮新增）、缓存未命中 ≈ 用户这句、
//   输出 ≈ 她这句。价格表在 lib/cost.js 里，这里只写桶。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { qqBridgeRoot } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const QQ_ROOT = process.env.YUSHEN_QQ_ROOT || qqBridgeRoot()
const LEDGER = path.join(QQ_ROOT, 'state', 'token-usage.jsonl')
const DSHW = path.join(HOME, '.dshw-usage.json')

const tokens = (s) => Math.max(1, Math.round(String(s || '').length))   // 中文 1 字 ≈ 1 词元

export function recordWorkbenchTurn({ sessionId = '', role = 'dayu', prompt = '', reply = '', inject = 30000, at = Date.now() } = {}) {
  if (!sessionId) return { ok: false, why: '没有 sessionId' }
  try {
    const row = {
      k: 'turn',
      t: at,
      sid: sessionId,
      key: 'workbench',
      seq: 0,
      author: role,
      turn: 1,
      step: 1,
      retry: 0,
      model: process.env.DSH_MODEL || 'deepseek-flash',
      provider: 'deepseek-account',
      // 工作台没有回执，字段按估算填；note 说明来源，别让后来人以为这是官方数字
      b: { cacheMiss: tokens(prompt), cacheHit: inject, cacheWrite: 0, output: tokens(reply), reasoning: 0 },
      note: 'estimated',
    }
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true })
    fs.appendFileSync(LEDGER, JSON.stringify(row) + '\n', 'utf8')
    // 2026-11-06 修：**不再往 .dshw-usage.json 的 todayUsage 里加东西**。
    // 那个字段宿主按"元"写（还有 accounting 的 1e8 单位块），我们以前往里加词元数，
    // 结果就是 "used 31287 / balance 413" 这种 75 倍缺口。我们只留自己的账簿行。
    // （历史原因：2026-11-02 宿主还没写这个文件，要"补齐"；现在宿主自己在写，补齐已成多余。）
    const used = tokens(prompt) + Number(inject) + tokens(reply)
    return { ok: true, tokens: used, note: 'only token-usage.jsonl; .dshw-usage.json owned by host' }
  } catch (e) {
    return { ok: false, why: String(e?.message || e).slice(0, 120) }
  }
}
