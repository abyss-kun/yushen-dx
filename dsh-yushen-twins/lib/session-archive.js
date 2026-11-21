/* 标签
 * id: lib-session-archive
 * kind: module
 * summary: 会话归档（库）：把 ~/.dsh/sessions 的正文解出来，写成能读、能搜、能分类的本地文档
 * audience: 她 / 新角色 / 维护者
 * owner: 框架；改它要跑回归
 * mutable: 可改
 * usage: archiveSessions（详见文件内注释）
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-11 01:04:49
 */
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-02 11:03｜小鱼·工作台｜授权：自己｜lib/session-archive.js 的计数与收尾（新增 unparsable 数组 + archive-health.json）｜会话归档：拆开 skipped（unchanged / unparsable）+ 每次跑完写 archive-health.json，让「跑过没跑过」看得见｜为什么：原来一个 skipped 同时装「没变化」和「解析不出」——一个从没归档过、又解析不出的会话，长得跟「没变化」一模一样，永远静默跳过；而且整条链没有「跑过」的痕迹（11-01 是靠发现归档 18.5 小时没更新才知道它停了）｜验证：真跑一次 written 3 / unchanged 80 / unparsable 3（三个都是 0KB、10-31 16:21:53 事故后留下的空会话）；archive-health.json 字段齐全｜可改：可改；但「skipped 必须拆成两种」「每次跑完留痕迹」这两条不能松
// 会话归档（库）：把 ~/.dsh/sessions 的正文解出来，写成能读、能搜、能分类的本地文档。
// 不调模型、不花 token；只解压、写文件、记索引。增量按源文件大小+修改时间判断。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SRC = path.join(HOME, 'sessions')
const OUT = path.join(HOME, 'dayu', 'sessions-archive')
const INDEX = path.join(OUT, 'index.jsonl')
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

function decode(file) {
  const buf = fs.readFileSync(file)
  const offs = []
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) offs.push(i)
  }
  const parts = []
  for (let i = 0; i < offs.length; i++) {
    const end = i + 1 < offs.length ? offs[i + 1] : buf.length
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(offs[i], end)).toString('utf8')) } catch { /* 最后一帧在写 */ }
  }
  return parts.join('')
}

const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || 'untitled'
const stamp = (d) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : '')
// 地点说人话：从工作区路径认场景，别把目录名摆给人看
const placeOf = (ws) => {
  const s = String(ws || '')
  if (/qq-bridge/i.test(s)) return 'QQ'
  if (/bili/i.test(s)) return 'B站'
  if (/mobile|手机/i.test(s)) return '手机'
  if (/dsh-yushen-twins|大小鱼|dayu/i.test(s)) return '工作台'
  return '本机'
}

function parse(text) {
  const out = { title: '', rows: [] }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (ev.type === 'session/title') {
      const t = ev?.data?.title || ev?.data?.text
      if (t) out.title = String(t)
      continue
    }
    const at = ev.time ? new Date(Number(ev.time)) : null
    const content = ev.type === 'user/message' ? ev?.data?.content : ev.type === 'assistant/message' ? ev?.data?.message?.content : null
    if (!Array.isArray(content)) continue
    const text = content.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n').trim()
    if (!text) continue
    if (ev.type === 'user/message') {
      const clean = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
      if (clean) out.rows.push({ at, role: '老板/用户', text: clean })
    } else {
      out.rows.push({ at, role: '她', text })
    }
  }
  return out
}

/** 跑一次归档；返回 { written, skipped, messages, dir }。
 *  sources：额外的会话来源（旧备份解出来的目录），每项 { base, tag }；
 *  旧档会归档到 <tag>-<工作区>/ 下，索引里带 tag，和自己的会话分开。 */
export function archiveSessions({ force = false, sources = [] } = {}) {
  fs.mkdirSync(OUT, { recursive: true })
  const allSources = [{ base: SRC, tag: '' }, ...sources.filter((s) => s && s.base && fs.existsSync(s.base))]
  const done = new Map()
  if (fs.existsSync(INDEX)) {
    for (const line of fs.readFileSync(INDEX, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try { const j = JSON.parse(line); done.set(j.id, j) } catch { /* 坏行跳过 */ }
    }
  }
  // 2026-11-02 小鱼：原来一个 skipped 数字同时装了「没变化」和「解析不出」两种。
  // 后果：一个**从没归档过、又解析不出**的会话，长得跟「没变化」一模一样——永远静默跳过。
  // 拆开之后，unparsable 才会被看见（归档健康检查盯着它）。
  let written = 0, unchanged = 0, messages = 0
  const unparsable = []
  const indexRows = []
  for (const source of allSources) {
    for (const ws of fs.existsSync(source.base) ? fs.readdirSync(source.base) : []) {
    const wsDir = path.join(source.base, ws)
    try { if (!fs.statSync(wsDir).isDirectory()) continue } catch { continue }
    for (const s of fs.readdirSync(wsDir)) {
      const file = path.join(wsDir, s, 'session.v4.jsonl.zstd')
      if (!fs.existsSync(file)) continue
      const st = fs.statSync(file)
      const prev = done.get(s)
      if (!force && prev && prev.srcSize === st.size && prev.srcMtime === st.mtimeMs) { unchanged++; continue }
      const parsed = parse(decode(file))
      if (!parsed.rows.length && !parsed.title) { unparsable.push({ id: s, size: st.size }); continue }
      const first = parsed.rows.find((r) => r.at)?.at || new Date(st.mtimeMs)
      const id8 = s.replace(/^session-/, '').slice(0, 8)
      const name = `${first.toISOString().slice(0, 10)}-${safe(parsed.title || 'untitled')}-${id8}.md`
      const dir = path.join(OUT, safe(source.tag ? `${source.tag}-${ws}` : ws))
      fs.mkdirSync(dir, { recursive: true })
      const target = path.join(dir, name)
      const head = [
        `# ${parsed.title || '(无标题)'}`,
        '',
        `- 谁：${placeOf(ws)}`,
        `- 地点：${placeOf(ws)}（工作区 ${ws}）`,
        `- 会话：${s}`,
        `- 时间：${stamp(first)} ~ ${stamp(new Date(st.mtimeMs))}`,
        `- 消息：${parsed.rows.length}`,
        `- 来源：${path.relative(HOME, file)}`,
        `- 生成：会话归档脚本 · ${stamp(new Date())}（Asia/Shanghai）`,
        '',
        '---',
        '',
      ].join('\n')
      fs.writeFileSync(target, head + parsed.rows.map((r) => `## ${stamp(r.at)} · ${r.role}\n\n${r.text}\n`).join('\n'), 'utf8')
      written++
      messages += parsed.rows.length
      indexRows.push({
        at: first.toISOString(),
        workspace: ws,
        title: parsed.title,
        id: s,
        messages: parsed.rows.length,
        path: path.relative(OUT, target),
        tags: [ws.includes('qq-bridge') ? 'QQ桥' : ws.includes('dayu') ? '鱼神' : '工作区', parsed.title ? '有标题' : '无标题', ...(source.tag ? [source.tag] : [])],
        srcSize: st.size,
        srcMtime: st.mtimeMs,
      })
    }
    }
  }
  if (indexRows.length) {
    const keep = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : ''
    const ids = new Set(indexRows.map((r) => r.id))
    const kept = keep.split('\n').filter((l) => l.trim()).filter((l) => { try { return !ids.has(JSON.parse(l).id) } catch { return true } })
    fs.writeFileSync(INDEX, kept.join('\n') + (kept.length ? '\n' : '') + indexRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  }
  // 2026-11-02 小鱼：每次跑完留一份「跑过」的痕迹。原来整条链完全静默——
  // 11-01 那次是发现「归档 18.5 小时没更新」才察觉它停了。
  const health = {
    at: new Date().toISOString(),
    indexRows: indexRows.length,
    written,
    unchanged,
    messages,
    unparsable,
    sources: allSources.length,
  }
  try {
    fs.writeFileSync(path.join(HOME, 'dayu', 'archive-health.json'), `${JSON.stringify(health, null, 2)}\n`, 'utf8')
  } catch { /* 状态写不进去不影响归档本身 */ }
  // skipped 保留给旧调用方（现在等于 unchanged）；新调用方请用 unchanged / unparsable
  return { written, skipped: unchanged, unchanged, unparsable, messages, dir: OUT }
}
