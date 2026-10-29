// 鱼神 · 双报告（神版 / 人版）
// 数据：events / dispatch / incidents；同一件事，两种写法。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function jsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  } catch { return [] }
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
const hhmm = (v) => { const d = new Date(v); return isNaN(d) ? '—' : `${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function buildReport(kind = 'human') {
  const today = dayKey()
  const events = jsonl(path.join(DATA, 'events', `${today}.jsonl`))
  const jobs = readJson(path.join(DATA, 'dispatch.json'), [])
  const incidents = readJson(path.join(DATA, 'incidents.json'), [])
  const openJobs = (Array.isArray(jobs) ? jobs : []).filter((j) => j.status === 'dispatched' || j.status === 'redispatched')
  const openInc = (Array.isArray(incidents) ? incidents : []).filter((i) => i.status === 'open' || i.status === 'fixing')
  const done = (Array.isArray(jobs) ? jobs : []).filter((j) => j.status === 'done')

  if (kind === 'divine') {
    const lines = [
      `# 神版报告 · ${today}`,
      '',
      `> 生成于 ${new Date().toISOString()}；events ${events.length} 条，jobs ${jobs.length} 单，incidents ${incidents.length} 件。`,
      '',
      '## 派活',
      ...jobs.slice(0, 20).map((j) => `- ${j.id}｜${j.status}｜${j.employee || '-'}｜${String(j.brief || '').slice(0, 50)}`),
      '',
      '## 事故',
      ...incidents.slice(0, 20).map((i) => `- ${i.id}｜${i.status}｜${i.title}｜×${i.count || 1}`),
      '',
      '## 最近事件',
      ...events.slice(-20).map((e) => `- ${hhmm(e.at)}｜${e.type}｜${String(e.text || e.title || '').replace(/\n/g, ' ').slice(0, 70)}`),
      '',
    ]
    return lines.join('\n')
  }

  const sources = new Map()
  for (const e of events) {
    const src = String(e.cwd || '').split(/[\\/]/).filter(Boolean).slice(-2).join('/') || '其他'
    sources.set(src, (sources.get(src) || 0) + 1)
  }
  const lines = [
    `# 今天的报告 · ${today}`,
    '',
    '## 今天做了什么',
    '',
    events.length ? `一共记下 ${events.length} 件事，主要在：${[...sources.keys()].slice(0, 3).join('、')}。` : '今天还没有记录。',
    done.length ? `做完 ${done.length} 单：${done.slice(0, 3).map((j) => String(j.brief || '').slice(0, 20)).join('；')}。` : '',
    '',
    '## 出过什么问题',
    '',
    openInc.length ? `还有 ${openInc.length} 件没结：` : '没有没结的问题。',
    ...openInc.slice(0, 5).map((i) => `- ${i.title}：${String(i.text || '').slice(0, 60)}`),
    '',
    '## 还有什么没弄完',
    '',
    openJobs.length ? `还有 ${openJobs.length} 单没回话：` : '没有悬着的活。',
    ...openJobs.slice(0, 5).map((j) => `- 交给 ${j.employee || '新会话'}：${String(j.brief || '').slice(0, 40)}`),
    '',
    '## 明天先做啥',
    '',
    openInc.length ? '1. 先把没结的事故结掉；' : '1. 没有待处理事故；',
    openJobs.length ? '2. 把没回话的单子催一下；' : '2. 没有要催的单子；',
    '3. 继续把主线做完。',
    '',
    '## 一句话',
    '',
    openInc.length ? '今天有点小状况，但都记着，跑不掉。' : '今天挺稳，账都在。',
    '',
  ]
  return lines.join('\n')
}
