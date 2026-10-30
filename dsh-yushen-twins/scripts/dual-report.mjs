// 双报告：神版（精确、可回放）+ 人版（大白话、能看懂）
// 读：events/YYYY-MM-DD.jsonl、dispatch.json、incidents.json、inbox.jsonl
// 写：~/.dsh/dayu/reports/YYYY-MM-DD-神版.md / -人版.md

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const OUT = path.join(DATA, 'reports')

const pad = (n) => String(n).padStart(2, '0')
const day = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = day()
const hhmm = (v) => { const d = new Date(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }

function jsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line) } catch { return null }
    }).filter(Boolean)
  } catch { return [] }
}
function json(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

const events = jsonl(path.join(DATA, 'events', `${today}.jsonl`))
const jobs = json(path.join(DATA, 'dispatch.json'), [])
const incidents = json(path.join(DATA, 'incidents.json'), [])
const inbox = jsonl(path.join(DATA, 'inbox.jsonl'))

const todayEvents = events.filter((e) => String(e.at || '').slice(0, 10) === today)
const bySource = new Map()
for (const e of todayEvents) {
  const key = e.cwd ? e.cwd.split(/[\\/]/).slice(-2).join('/') : '未知'
  bySource.set(key, (bySource.get(key) || 0) + 1)
}
const errEvents = todayEvents.filter((e) => /error|fail/i.test(String(e.type || '')))
const openInc = incidents.filter((i) => i.status === 'open' || i.status === 'fixing')
const openJobs = jobs.filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
const doneJobs = jobs.filter((j) => j.status === 'done')
const todayInbox = inbox.filter((m) => String(m.at || '').slice(0, 10) === today)

// ── 神版 ──────────────────────────────────────────────
const divine = [
  `# 神版报告 · ${today}`,
  '',
  `> 生成于 ${new Date().toISOString()}；数据源 events / dispatch / incidents / inbox。`,
  '',
  '## 一、事件',
  '',
  `- 事件总数：${todayEvents.length}`,
  `- 按来源：${[...bySource].map(([k, v]) => `${k}=${v}`).join('；') || '无'}`,
  `- 错误事件：${errEvents.length}`,
  '',
  '## 二、派活',
  '',
  `- 未结：${openJobs.length}；已完成：${doneJobs.length}`,
  ...jobs.slice(0, 10).map((j) => `- ${j.id}｜${j.status}｜${j.employee || '-'}｜${String(j.brief || '').slice(0, 40)}`),
  '',
  '## 三、事故',
  '',
  `- 未结：${openInc.length}`,
  ...openInc.slice(0, 10).map((i) => `- ${i.id}｜${i.title}｜${i.source}｜×${i.count || 1}｜${String(i.text || '').slice(0, 50)}`),
  '',
  '## 四、最近事件（20 条）',
  '',
  ...todayEvents.slice(-20).map((e) => `- ${hhmm(e.at)}｜${e.type}｜${String(e.title || e.id || '').slice(0, 30)}${e.text ? `｜${String(e.text).slice(0, 60)}` : ''}`),
  '',
].join('\n')

// ── 人版 ──────────────────────────────────────────────
const human = [
  `# 今天的报告 · ${today}`,
  '',
  '## 今天发生了什么',
  '',
  todayEvents.length
    ? `今天一共记下 ${todayEvents.length} 件事，主要来自：${[...bySource.keys()].slice(0, 3).join('、')}。`
    : '今天还没有记录。',
  '',
  '## 出过什么问题',
  '',
  errEvents.length || openInc.length
    ? `有 ${errEvents.length} 次报错，其中 ${openInc.length} 件还没结单。`
    : '没有出事，或者出了也当场处理了。',
  ...openInc.slice(0, 5).map((i) => `- ${i.title}：${String(i.text || '').slice(0, 60)}（还没结单）`),
  '',
  '## 现在还有什么没弄完',
  '',
  openJobs.length
    ? `还有 ${openJobs.length} 单没回来：`
    : '没有悬着的活。',
  ...openJobs.slice(0, 5).map((j) => `- 交给 ${j.employee || '新会话'}：${String(j.brief || '').slice(0, 50)}`),
  '',
  '## 明天先做啥',
  '',
  openInc.length ? '1. 先把没结的事故结掉；' : '1. 没有待处理的事故；',
  openJobs.length ? '2. 把没回来的单子催一下；' : '2. 没有要催的单子；',
  '3. 继续 M1：真跑一单，把派活→验收→复盘走完。',
  '',
  '## 一句话',
  '',
  openInc.length ? '今天有点小状况，但都记着，跑不掉。' : '今天挺稳，账都在。',
  '',
].join('\n')

fs.mkdirSync(OUT, { recursive: true })
const f1 = path.join(OUT, `${today}-神版.md`)
const f2 = path.join(OUT, `${today}-人版.md`)
fs.writeFileSync(f1, divine, 'utf8')
fs.writeFileSync(f2, human, 'utf8')
console.log(f1)
console.log(f2)
