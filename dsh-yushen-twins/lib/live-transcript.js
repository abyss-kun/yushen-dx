// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 实时抄录：每说一句就落一份，带标注（哪天的、标题、小标题、发生了什么、关键字）。
// 2026-11-01 主人：存原样 + 做好标注；每次标一点点，以后查就便宜。
//
// 目录：~/.dsh/dayu/live/<通道>/<日期>-<标题>-<会话id8>.md
// 每条：
//   ### 02:20:13 · 谁
//   - 发生了什么：<首句 40 字>
//   - 关键：备份, 删除, 验证
//   （原文）
//
// 标注不用模型：标题取会话标题，小标题是时间+说话人，关键字用词表匹配。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const BASE = path.join(HOME, 'dayu', 'live')

const placeOf = (cwd) => {
  const s = String(cwd || '')
  if (/qq-bridge/i.test(s)) return 'QQ'
  if (/bili/i.test(s)) return 'B站'
  if (/mobile|手机/i.test(s)) return '手机'
  if (/dsh-yushen-twins|大小鱼|dayu/i.test(s)) return '工作台'
  return '本机'
}
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 50) || 'untitled'
const stamp = (d) => new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')
const clock = (d) => stamp(d).slice(11)
// ISO 周号：一个月的文件夹里放几个周（W01…W53）
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const w = Math.ceil((((t - y0) / 86400000) + 1) / 7)
  return `W${String(w).padStart(2, '0')}`
}

// 关键字词表：命中就带上，最多三个
const KEYWORDS = [
  ['备份', /备份|快照|还原|恢复|存档/],
  ['记忆', /记忆|冷档|忘|想起/],
  ['会话', /会话|原文|归档|抄录/],
  ['删除', /删|清掉|移除/],
  ['搬迁', /搬|移动|归档到|移到/],
  ['规则', /规则|手册|宪章|底线|铁律|标记|标注/],
  ['测试', /测试|回归|断言|自检/],
  ['密钥', /密钥|口令|令牌|token/i],
  ['视频', /视频|片子|剪辑|渲染|封面/],
  ['插件', /插件|安装|加载|bundles/],
  ['故障', /崩|坏|报错|失败|事故/],
  ['钱', /钱|花费|预算|成本/],
  ['日记', /日记|感受|心情/],
  ['身份', /身份|本体|名字|我是谁/],
]
const keywordsOf = (text) => KEYWORDS.filter(([, re]) => re.test(text)).map(([k]) => k).slice(0, 3)
const headOf = (text) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40)

const lastSeen = new Map()

export function appendTurn({ sessionId = '', title = '', cwd = '', who = '', text = '', at = new Date() } = {}) {
  if (!text || !String(text).trim()) return { ok: false, reason: '空' }
  if (/^Current runtime context|^Time sampled while preparing/.test(text)) return { ok: false, reason: '运行上下文不算' }
  const place = placeOf(cwd)
  const date = stamp(at).slice(0, 10)
  const id8 = String(sessionId).replace(/^session-/, '').slice(0, 8) || 'unknown'
  // 2026-11-01 主人：不要一股脑塞——年/月/周 分层，一个月的里面放几个周的。
  const [yyyy, mm] = date.split('-')
  const week = isoWeek(at)
  const dir = path.join(BASE, yyyy, `${mm}${week}`, place)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${date}-${safe(title)}-${id8}.md`)

  const fp = crypto.createHash('sha256').update(`${stamp(at)}|${who}|${text}`).digest('hex').slice(0, 12)
  if (lastSeen.get(file) === fp) return { ok: false, reason: '重复' }
  lastSeen.set(file, fp)

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, [
      `# ${title || '(无标题)'}`,
      '',
      `- 谁：${who || '未知'}`,
      `- 地点：${place}`,
      `- 会话：${id8}`,
      `- 时间：${stamp(at)} 起（Asia/Shanghai）`,
      `- 来源：实时抄录（逐轮）`,
      `- 生成：live-transcript · ${stamp(new Date())}`,
      '',
      '---',
      '',
    ].join('\n'), 'utf8')
  }
  const keys = keywordsOf(text)
  fs.appendFileSync(file, [
    `### ${clock(at)} · ${who || '未知'}`,
    `- 发生了什么：${headOf(text)}`,
    `- 关键：${keys.length ? keys.join(', ') : '日常'}`,
    '',
    String(text).trim(),
    '',
  ].join('\n'), 'utf8')
  return { ok: true, file }
}
