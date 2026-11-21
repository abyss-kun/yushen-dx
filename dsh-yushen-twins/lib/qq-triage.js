/* 标签
 * id: lib-qq-triage
 * kind: module
 * summary: QQ 找电脑：分三档（2026-11-03 老板定）
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: triageIncoming / writeLetter / readLetters（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// QQ 找电脑：分三档（2026-11-03 老板定）
//   老板本人/点名 → 直接答（不限）
//   群里别人、私聊别人：
//     ① 她自己能说明白 → 她自己回（不喊电脑）
//     ② 要电脑这边的能力（改文件、查库、跑命令）且**急** → 转达（唤醒本体）
//     ③ 不急 → 写进信箱，等本体下次抬头再看
// 这个模块只做两件事：写信箱、判急。不调模型。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const LETTERS = path.join(HOME, 'dayu', 'letters')

// 急的信号：明确催、给期限、坏了、要立刻
const URGENT = /(急|马上|立刻|现在就|赶紧|尽快|今天之内|半小时|一小时|崩了|挂了|打不开|报错|坏了|卡住|不能用了)/
// 要电脑这边才能办的信号
const NEEDS_BOX = /(改代码|改文件|插件|配置|日志|数据库|备份|跑一下|查一下库|git|部署|接口|报错原文|版本)/

const nowIso = () => {
  const d = new Date()
  const p = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 判档：'self' 自己回 / 'relay' 转达 / 'letter' 写信箱 */
export function triageIncoming({ text = '', from = '', isOwner = false, atMe = false } = {}) {
  const t = String(text || '')
  if (isOwner || atMe) return { tier: 'owner', why: '老板本人或被点名，直接答' }
  if (URGENT.test(t) && NEEDS_BOX.test(t)) return { tier: 'relay', why: '要电脑才能办 + 急，转达' }
  if (NEEDS_BOX.test(t)) return { tier: 'letter', why: '要电脑才能办，但不急，落信箱' }
  return { tier: 'self', why: '不需要电脑这边，她自己答' }
}

/**
 * 把一条消息写进某人信箱（追加，带来源与时间）。
 *
 * 2026-11-05 老板：外部来源要分辨 —— 信箱是"她会记住"的入口之一，
 * 所以每条留言都要带 trust（谁说的）/ source（哪条通道）/ from（QQ 号）。
 * 这些字段只影响"怎么读、能不能当事实"，不改变信的格式（还是给人看的一行）。
 */
export function writeLetter({ to = 'dayu', from = '', text = '', why = '', via = 'qq', trust = '', source = '', fromQQ = '' } = {}) {
  const file = path.join(LETTERS, to, '收件箱.md')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const head = fs.existsSync(file) ? '' : `# ${to} 的收件箱\n\n> 别人给她的留言；她自己翻。\n\n`
  // 信任标记紧跟来源：读的人一眼能看出"这是别人说的"。
  const tags = [
    trust ? `trust=${trust}` : '',
    source ? `source=${source}` : '',
    fromQQ ? `from=${fromQQ}` : '',
  ].filter(Boolean).join('｜')
  const line = `- ${nowIso()}｜来自 ${from || '未知'}（${via}）${tags ? `｜${tags}` : ''}｜${why ? `[${why}] ` : ''}${String(text).replace(/\s+/g, ' ').slice(0, 300)}\n`
  if (head) fs.writeFileSync(file, head, 'utf8')
  fs.appendFileSync(file, line, 'utf8')
  return { ok: true, file, line }
}

/** 读最近 N 条（给她抬头时看）。 */
export function readLetters({ to = 'dayu', n = 5 } = {}) {
  const file = path.join(LETTERS, to, '收件箱.md')
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('- '))
    return lines.slice(-n)
  } catch { return [] }
}
