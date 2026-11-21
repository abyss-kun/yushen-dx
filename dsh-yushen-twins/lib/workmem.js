/* 标签
 * id: lib-workmem
 * kind: module
 * summary: 工作记忆（2026-11-03）：正在做的事 + 等谁的 + 卡在哪 + 常用作业的入口
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；记忆内容归角色本人
 * mutable: 可改
 * usage: projectWork / workText（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// 工作记忆（2026-11-03）：正在做的事 + 等谁的 + 卡在哪 + 常用作业的入口。
// 老板原话：「应该有个工作记忆分区」「github、密钥、备份这些东西，你要知道而不是我问你才读」。
// 不新建存储——从 doing / dispatch / agenda / 交接 现算；常用作业在 docs/常用作业.md。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
// 2026-11-03 回归「运行期不写死盘符」：仓库根不许硬编码，按本文件位置上溯两级。
const REPO = process.env.YUSHEN_REPO || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const readJsonl = (f) => {
  try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] }
}
const readJsonlSafe = (f) => {
  try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] }
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }

/** 正在做的事：事件账本里最近的 kind='doing'（老板：工作记忆就是"手头在忙什么"）。 */
function doingItems(now) {
  const days = [0, 1].map((d) => new Date(now - d * 86400e3).toISOString().slice(0, 10))
  const rows = []
  for (const d of days) rows.push(...readJsonl(path.join(DATA, 'events', d + '.jsonl')))
  const latest = new Map()
  for (const e of rows) {
    const kind = String(e?.kind || e?.type || '')
    if (kind !== 'doing') continue
    const who = String(e.role || e.by || 'dayu')
    latest.set(who, e)
  }
  return [...latest.values()].map((e) => ({
    what: String(e.text || e.what || '').replace(/\s+/g, ' ').slice(0, 50),
    since: String(e.at || e.time || '').slice(5, 16),
    source: String(e.source || '').slice(0, 20),
    stale: (now - (Date.parse(e.at || e.time) || now)) > 86400e3,
  })).filter((r) => r.what)
}

/** 等谁的 / 派出去的（dispatch 里未收尾）。 */
function dispatchItems(now) {
  const list = readJson(path.join(DATA, 'dispatch.json'), [])
  const out = []
  for (const j of Array.isArray(list) ? list : []) {
    if (String(j.status || '').match(/done|failed|settled|cancel/i)) continue
    const at = Date.parse(String(j.at || '')) || now
    if (now - at > 3 * 86400e3) continue
    // 派活简报前面是一大段模板（【调用者】…），真正要做的事在最后一段
    const parts = String(j.brief || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    const raw = (parts[parts.length - 1] || '').replace(/【[^】]*】/g, ' ').replace(/\s+/g, ' ').trim()
    const brief = raw.slice(0, 30)
    out.push({ who: String(j.employee || j.role || '').slice(0, 12), brief })
  }
  return out.slice(0, 3)
}

/** 常用作业的入口（只给指针 + 三条最常用的命令）。 */
function opsLine() {
  const candidates = [path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', '常用作业.md'), path.join(REPO, 'docs', '常用作业.md')]
  const f = candidates.find((x) => fs.existsSync(x)) || candidates[1]
  const exists = fs.existsSync(f)
  return {
    file: exists ? 'docs/常用作业.md' : '(还没写)',
    hints: [
      '私库 abyss-kun/yushen（云备份在 `云备份` 分支）',
      '密钥在 ~/.dsh/keys.env（不进仓库）；提炼用 DEEPSEEK_API_KEY',
      '备份：云 `python 云备份.py push`｜本地全量 robocopy｜验证每天一次',
    ],
  }
}

/** 待查：问题.jsonl 里还没结的单子（一成一败那种，不是分歧）。 */
function issueItems() {
  const latest = new Map()
  for (const q of readJsonlSafe(path.join(HOME, 'dayu', 'library', '问题.jsonl'))) latest.set(q.id, q)
  return [...latest.values()]   // 只认最新一版（跟分歧一个坑）
    .filter((q) => !q.status || q.status === 'open')
    .map((q) => ({ id: q.id, subject: String(q.subject || '').slice(0, 8), question: String(q.question || '').slice(0, 40) }))
}

export function projectWork({ now = Date.now() } = {}) {
  const doing = doingItems(now)
  const waiting = dispatchItems(now)
  const issues = issueItems()
  return {
    at: new Date(now).toISOString(),
    doing,
    waiting,
    blocked: doing.filter((d) => d.stale).map((d) => d.what),
    issues,
    ops: opsLine(),
    counts: { doing: doing.length, waiting: waiting.length, issues: issues.length },
  }
}

/** 注入用的一段（≤180 字）：正在做 + 等谁 + 常用作业指针。 */
export function workText(p, budget = 180) {
  const ls = ['## 工作记忆']
  if (p.doing.length) ls.push('· 正在做：' + p.doing.slice(0, 2).map((d) => d.what).join('；'))
  if (p.blocked.length) ls.push('· 卡住：' + p.blocked.slice(0, 2).join('；'))
  const waitingText = p.waiting.slice(0, 2).map((x) => `${x.who}：${x.brief}`).filter((s) => s.replace(/[：\s]/g, '')).join('；')
  if (waitingText) ls.push('· 等别人：' + waitingText)
  if (p.issues && p.issues.length) ls.push('· 待查 ' + p.issues.length + ' 件：' + p.issues[0].subject + '（library/问题.jsonl）')
  ls.push('· 常用作业（GitHub/密钥/备份/发布）：' + p.ops.file)
  let text = ls.join('\n')
  while (text.length > budget && ls.length > 3) { ls.splice(1, 1); text = ls.join('\n') }
  // 还是超就裁每一行的正文（不能只丢行：一行长句能顶完整块）
  if (text.length > budget) {
    for (let i = 1; i < ls.length; i++) {
      const room = Math.max(8, budget - (text.length - ls[i].length))
      if (ls[i].length > room) ls[i] = ls[i].slice(0, room - 1) + '…'
      text = ls.join('\n')
    }
  }
  return text
}
