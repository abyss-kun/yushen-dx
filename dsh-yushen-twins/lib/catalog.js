// 鱼神 · 档案目录（助手保管）
// 她要“公司的一切记录都有”——不是把数据复制一份（两个食堂），而是她手里有一本总目录：
// 哪本账、在哪、多少条、最后动过是什么时候。数据仍在各自主位，目录一处可查全部。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { workspace, qqBridgeRoot } from './paths.js'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const DATA = path.join(HOME, 'dayu')
const XIAOYU = path.join(HOME, 'xiaoyu')
const WS = workspace()

function stat(file) {
  try {
    const s = fs.statSync(file)
    return { bytes: s.size, mtime: s.mtime.toISOString() }
  } catch { return null }
}
function countLines(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).length } catch { return 0 }
}
function countJsonList(file) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(v) ? v.length : Object.keys(v || {}).length } catch { return 0 }
}
function latestIn(dir, ext) {
  try {
    const list = fs.readdirSync(dir).filter((n) => n.endsWith(ext)).map((n) => ({ n, m: fs.statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => b.m - a.m)
    return list[0]?.n || ''
  } catch { return '' }
}

/** 总目录：每本“账”一行。 */
export function buildCatalog() {
  const today = new Date().toISOString().slice(0, 10)
  const entries = []
  const add = (id, title, kind, file, count) => {
    const s = stat(file)
    if (!s) return
    entries.push({ id, title, kind, file, count: count ?? 0, ...s })
  }

  add('ledger', '账本（今天）', 'events', path.join(DATA, 'events', `${today}.jsonl`), countLines(path.join(DATA, 'events', `${today}.jsonl`)))
  add('jobs', '派活单', 'jobs', path.join(DATA, 'dispatch.json'), countJsonList(path.join(DATA, 'dispatch.json')))
  add('incidents', '事故单', 'incidents', path.join(DATA, 'incidents.json'), countJsonList(path.join(DATA, 'incidents.json')))
  add('registry', '入职档案（插件）', 'registry', path.join(XIAOYU, 'registry', 'index.json'), countJsonList(path.join(XIAOYU, 'registry', 'index.json')))
  add('charter', '宪章', 'charter', path.join(DATA, 'charter.json'), 0)
  add('owner', '老板偏好', 'owner', path.join(DATA, 'owner.md'), 0)
  add('handbook', '员工手册', 'handbook', path.join(WS, '员工手册.md'), 0)
  add('handoffbook', '交接手册', 'handbook', path.join(WS, '交接手册.md'), 0)
  add('fixindex', '修复档案索引', 'archive', path.join(qqBridgeRoot(), '修复档案', '索引.md'), 0)
  add('archindex', '版本档案索引', 'archive', path.join(WS, 'archive', '档案索引.md'), 0)
  add('settings', '设定集索引', 'setting', path.join(WS, '设定集-索引.md'), 0)
  add('world', '世界观设定', 'setting', path.join(WS, '世界观设定.md'), 0)
  add('duties', '职责清单', 'setting', path.join(WS, '职责清单.md'), 0)
  add('usage', '用法档案（自动生成）', 'manual', path.join(WS, 'dsh-yushen-twins', 'docs', '用法档案.md'), 0)
  add('worklog', '工作记录（我改了什么）', 'work', path.join(DATA, 'worklog.jsonl'), countLines(path.join(DATA, 'worklog.jsonl')))
  add('actions', '动作记录（谁点了什么）', 'work', path.join(DATA, 'actions.jsonl'), countLines(path.join(DATA, 'actions.jsonl')))
  add('narrative', '叙事基线（角色来历/世界观）', 'setting', path.join(WS, '叙事基线.md'), 0)

  const handoffDir = path.join(DATA, 'handoff')
  const latest = latestIn(handoffDir, '.md')
  if (latest) add('handoff', `交接（${latest}）`, 'handoff', path.join(handoffDir, latest), 0)

  const handoffCount = (() => { try { return fs.readdirSync(handoffDir).filter((n) => n.endsWith('.md')).length } catch { return 0 } })()

  return {
    ok: true,
    keeper: '助手',
    at: new Date().toISOString(),
    note: '她保管的是目录，不是副本；数据仍在各自主位，一处可查全部。',
    handoffCount,
    entries: entries.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime))),
  }
}
