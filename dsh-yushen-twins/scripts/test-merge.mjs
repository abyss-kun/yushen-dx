// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 两端合并的验收（2026-11-02，方案 v1 §5 P0/P1 + §6 兜底）。
//
// 为什么单独一个进程：lib/memory.js / sync/*.mjs 在 import 那一刻就把 DSH_HOME 定死了
// （见 test-memory-cold.mjs 的教训：假事件写进过真实记忆）。所以先改 DSH_HOME 到临时家，再动态 import。
//
// 七组：
//   ① 身份键：id 含 device + session（两台设备同一句 = 2 条；同设备同分钟重放 = 1 条）
//   ② 旧数据：老 id 不改写、不删，memoryView / recallNow 两种 id 都能读
//   ③ 兜底全量：export --all 含冷档 → 清空 → import --replace 重建，条数对得上（P0 §6）
//   ④ 合并幂等：同一份 jsonl 跑两次，第二次 added:0、水位不动、日志不涨
//   ⑤ 分歧清单：状态冲突进 disputes.jsonl、两边都保留、落选那条留 supersede 痕迹
//   ⑥ 拆 s.jsonl 两份跑（CLI 真跑）：可复现，重复跑无新增
//   ⑦ 定型文档不进合并 + 睡眠窗口只合并一次
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-merge-'))
process.env.DSH_HOME = tmp
process.env.YUSHEN_DEVICE = 'desktop'

const lib = (rel) => pathToFileURL(path.join(ROOT, rel)).href + '?t=' + Date.now()
const { appendEvent, SEQ_FILE } = await import(lib('lib/memory.js'))
const { merge, mergeFromFile, WATERMARK_FILE, MERGE_LOG, DISPUTES_FILE } = await import(lib('sync/merge.mjs'))
const { exportAll, importReplace, fullStatus } = await import(lib('sync/full.mjs'))
const { memoryView } = await import(lib('lib/soul.js'))
const { recallNow } = await import(lib('lib/recall-now.js'))

const MEM = path.join(tmp, 'dayu', 'soul', 'memory')
const dayuFile = path.join(MEM, 'dayu.json')
const out = []
const say = (line) => { out.push(line); console.log(line) }
const readMem = (role = 'dayu') => JSON.parse(fs.readFileSync(path.join(MEM, `${role}.json`), 'utf8'))
const lines = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) } catch { return [] } }
const T0 = '2026-11-02T02:00:00.000Z'
const minute = (n) => new Date(Date.parse(T0) + n * 60e3).toISOString()

// ── ① 身份键：id 带 device + session ───────────────────────────────
{
  process.env.YUSHEN_DEVICE = 'desktop'
  const a = appendEvent('dayu', { channel: '工作台', text: '同一句话：封面改成两栏', at: minute(0) })
  process.env.YUSHEN_DEVICE = 'phone'
  const b = appendEvent('dayu', { channel: '工作台', text: '同一句话：封面改成两栏', at: minute(0) })
  process.env.YUSHEN_DEVICE = 'desktop'
  const again = appendEvent('dayu', { channel: '工作台', text: '同一句话：封面改成两栏', at: minute(0) })
  const otherSession = appendEvent('dayu', { channel: '工作台', text: '同一句话：封面改成两栏', at: minute(0), session: 'session-abc12345' })
  assert.equal(a.appended, true, '第一条没写进去')
  assert.equal(b.appended, true, `第二台设备那条被去重掉了（id=${b.id || '无'}）`)
  assert.notEqual(a.id, b.id, '两台设备同一句的 id 一样——id 没含 device')
  assert.equal(again.duplicate, true, '同设备同文本同分钟重放应该去重')
  assert.equal(otherSession.appended, true, '换一个 session 就应该是另一条（id 要含 session）')
  const events = readMem().events
  assert.equal(events.length, 3, `应该是 3 条（desktop / phone / 另一分身），实际 ${events.length}`)
  const desk = events.filter((e) => e.device === 'desktop')
  const phone = events.filter((e) => e.device === 'phone')
  assert.equal(desk.length, 2, 'desktop 的设备标不对')
  assert.equal(phone.length, 1, 'phone 的设备标不对')
  for (const e of events) {
    assert.match(String(e.id), /^m-[0-9a-f]{10}$/, `id 格式不对：${e.id}`)
    assert.ok(Number.isFinite(e.seq) && e.seq > 0, `seq 没分配：${e.text}`)
  }
  const seqs = events.map((e) => e.seq)
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y), 'seq 不是单调递增')
  // 逻辑时钟落盘：按 role 分
  const clock = JSON.parse(fs.readFileSync(SEQ_FILE, 'utf8'))
  assert.equal(clock.dayu, seqs.at(-1), `seq.json 里的号 ${clock.dayu} 和最后一条 ${seqs.at(-1)} 对不上`)
  say(`① 身份键：同一句两台设备 = 2 条（id ${a.id} / ${b.id}），同设备重放 = 1 条，换 session = 新一条；seq 1..${seqs.at(-1)} 落盘`)
}

// ── ② 旧数据兼容：老 id 不改写、不删，两种 id 都能读 ───────────────
{
  const legacyId = 'm-' + crypto.createHash('sha1').update('2026-11-01T00:00:00.000Z|工作台|旧数据').digest('hex').slice(0, 10)
  const doc = readMem()
  doc.events.push({ at: '2026-11-01T00:00:00.000Z', channel: '工作台', kind: 'say', text: '旧数据：那本蓝底封面图放在抽屉第二层', source: '', verified: false, tier: 'normal', clarity: 'clear', pinned: false, recallCount: 0, by: '', id: legacyId })
  fs.writeFileSync(dayuFile, JSON.stringify(doc, null, 2) + '\n', 'utf8')
  const view = memoryView('dayu', { limit: 20 })
  assert.ok(view.available, 'memoryView 读不出记忆')
  assert.ok(view.events.some((e) => String(e.text).includes('旧数据')), 'memoryView 没列出旧事件')
  const rec = recallNow('还记得那本蓝底封面图吗', { role: 'dayu', home: tmp })
  assert.ok(rec.hits.some((h) => String(h.text).includes('蓝底封面')), 'recallNow 没找回旧事件（两种 id 不兼容？）')
  const after = readMem().events.find((e) => e.text.includes('旧数据'))
  assert.equal(after.id, legacyId, '旧事件的 id 被改写了')
  assert.equal(after.seq, undefined, '旧事件不该凭空长出一个 seq（要等合并时才补，并标 seqInferred）')
  assert.equal(readMem().events.length, 4, '旧事件被删了或者多了')
  say(`② 旧数据：老 id ${legacyId} 原样留着（没有 seq）；memoryView / recallNow 两种 id 都读得到`)
}

// ── ③ 兜底全量：export --all → 清空 → import --replace ─────────────
{
  // 换一个角色做重建演练：200 条热档 + 10 条冷档 = 210 条，重建后一条都不能少。
  const xFile = path.join(MEM, 'xiaoyu.json')
  const hot = []
  for (let i = 0; i < 200; i++) {
    hot.push({ at: new Date(Date.parse(T0) - (200 - i) * 60e3).toISOString(), channel: '工作台', kind: 'say', text: `重建演练第 ${i + 1} 条`, device: 'desktop', seq: i + 1, id: 'm-' + crypto.createHash('sha1').update(`rebuild-${i}`).digest('hex').slice(0, 10) })
  }
  fs.writeFileSync(xFile, JSON.stringify({ version: 1, summary: '重建演练摘要', habits: ['早起'], dynamics: [], impressions: {}, events: hot }, null, 2) + '\n', 'utf8')
  const coldDir = path.join(tmp, 'dayu', 'runtime', 'xiaoyu', '记忆冷档')
  fs.mkdirSync(coldDir, { recursive: true })
  const coldRows = []
  for (let i = 0; i < 10; i++) coldRows.push({ at: new Date(Date.parse(T0) - (300 - i) * 60e3).toISOString(), channel: '工作台', kind: 'say', text: `冷档第 ${i + 1} 条`, device: 'desktop', seq: i + 1, id: 'm-' + crypto.createHash('sha1').update(`cold-${i}`).digest('hex').slice(0, 10) })
  fs.writeFileSync(path.join(coldDir, '2026-11-01.jsonl'), coldRows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

  const before = crypto.createHash('sha256').update(fs.readFileSync(xFile)).digest('hex')
  const exp = exportAll({ roles: ['xiaoyu'], out: path.join(tmp, 'bak', 'all.jsonl') })
  const after = crypto.createHash('sha256').update(fs.readFileSync(xFile)).digest('hex')
  assert.equal(before, after, '导出动了记忆文件（导出必须只读）')
  assert.equal(exp.total, 210, `导出条数 ${exp.total} 不是 210（热 200 + 冷 10）`)
  assert.equal(exp.coldIncluded, true, '导出没带冷档')
  assert.equal(exp.counts.xiaoyu.cold, 10, '导出的冷档条数不对')
  const manifest = JSON.parse(fs.readFileSync(exp.manifest, 'utf8'))
  assert.equal(manifest.coldIncluded, true, '清单里没标 coldIncluded')
  assert.equal(manifest.total, 210, '清单条数不对')
  assert.ok(Array.isArray(manifest.roles.xiaoyu.habits) && manifest.roles.xiaoyu.habits.includes('早起'), '清单没带 habits，重建会丢人设')
  assert.equal(fullStatus({ roles: ['xiaoyu'] }).roles.xiaoyu.cold, 10, '导出后冷档条数变了')

  // 丢掉：记忆文件删掉、冷档清掉 —— 假装这台机器的记忆没了
  fs.rmSync(xFile)
  fs.rmSync(coldDir, { recursive: true, force: true })
  const gone = importReplace({ file: exp.file })
  const back = readMem('xiaoyu')
  assert.equal(gone.ok, true, `重建失败：${gone.reason || ''}`)
  assert.equal(back.events.length, 200, `重建后热档 ${back.events.length} 条，不是 200`)
  assert.equal(back.summary, '重建演练摘要', '重建没把摘要带回来（有流水没人设）')
  const coldBack = fs.readdirSync(coldDir).reduce((n, f) => n + lines(path.join(coldDir, f)).length, 0)
  assert.equal(coldBack, 10, `重建后冷档 ${coldBack} 条，不是 10`)
  assert.equal(gone.roles.xiaoyu.coldRestored, 10, '报告里没写补回了几条冷档')
  // 再导一次：不许堆副本（冷档只补本机没有的）
  const twice = importReplace({ file: exp.file })
  assert.equal(twice.roles.xiaoyu.coldRestored, 0, `重复导入又写了 ${twice.roles.xiaoyu.coldRestored} 条冷档（会越导越多）`)
  const coldBack2 = fs.readdirSync(coldDir).reduce((n, f) => n + lines(path.join(coldDir, f)).length, 0)
  assert.equal(coldBack2, 10, `重复导入后冷档变成 ${coldBack2} 条`)
  say(`③ 兜底全量：导出 ${exp.total} 条（含冷档 ${exp.counts.xiaoyu.cold}，coldIncluded=${manifest.coldIncluded}，清单带摘要/habits）→ 删干净 → 重建 200 热 + 10 冷 = 210，摘要回来了；重导补 0 条`)
}

// ── ④ 合并幂等 + ⑤ 分歧清单 ──────────────────────────────────────
const PC_ROWS = [
  { role: 'dayu', device: 'pc', seq: 1, at: minute(10), channel: '工作台', kind: 'input', text: '老板说封面主色先用深蓝试一版', id: 'm-' + 'a'.repeat(10) },
  { role: 'dayu', device: 'pc', seq: 2, at: minute(11), channel: '工作台', kind: 'say', text: '深蓝底那版我按两栏排了，字号没动', id: 'm-' + 'b'.repeat(10) },
  { role: 'dayu', device: 'pc', seq: 3, at: minute(12), channel: 'QQ', kind: 'say', text: '手机上下载的那个安装包我也核对过 sha256 了', id: 'm-' + 'c'.repeat(10) },
  { role: 'dayu', device: 'pc', seq: 4, at: minute(20), channel: '工作台', kind: 'commit', about: '封面栏数', text: '封面定两栏', id: 'm-' + 'd'.repeat(10) },
]
{
  // 本机这头先有一条相反的承诺（09:00 更早）
  appendEvent('dayu', { channel: '工作台', kind: 'commit', about: '封面栏数', text: '封面定三栏', at: minute(-60) })
  const logBefore = lines(MERGE_LOG).length
  const r1 = merge('dayu', { peer: 'pc', rows: PC_ROWS })
  assert.equal(r1.ok, true, `合并失败：${r1.reason || ''}`)
  assert.equal(r1.added, 4, `第一次应该新增 4 条，实际 ${r1.added}`)
  assert.deepEqual(r1.watermark, { from: 0, to: 4 }, `水位不对：${JSON.stringify(r1.watermark)}`)
  assert.equal(r1.disputes, 1, `应该记 1 条分歧，实际 ${r1.disputes}`)
  assert.equal(r1.superseded, 1, `应该有 1 条取代留痕，实际 ${r1.superseded}`)

  const events = readMem().events
  const two = events.find((e) => e.text === '封面定两栏')
  const three = events.find((e) => e.text === '封面定三栏')
  assert.ok(two && three, '冲突的两条没都留下（程序选边了？）')
  assert.equal(three.text, '封面定三栏', '落选那条的正文被改了')
  assert.equal(three.supersededBy, two.id, `落选那条没留 supersede 痕迹（supersededBy=${three.supersededBy}）`)

  const disp = lines(DISPUTES_FILE).map((l) => JSON.parse(l))
  assert.equal(disp.length, 1, `disputes.jsonl 里应该有 1 条，实际 ${disp.length}`)
  const d0 = disp[0]
  assert.equal(d0.kind, 'state-conflict', `分歧类型不对：${d0.kind}`)
  assert.ok(d0.a.text.includes('封面定') && d0.b.text.includes('封面定'), '分歧清单没带两侧原文')
  assert.ok(d0.a.device && d0.b.device, '分歧清单没带两侧设备')
  assert.ok(d0.a.at && d0.b.at, '分歧清单没带两侧时间')
  const wm = JSON.parse(fs.readFileSync(WATERMARK_FILE, 'utf8'))
  assert.equal(wm.pc, 4, `watermark.json 里 pc=${wm.pc}，不是 4`)
  assert.equal(Object.keys(wm).length, 1, `watermark.json 多了键：${Object.keys(wm).join(',')}`)
  say(`④ 合并：新增 ${r1.added}，水位 ${r1.watermark.from}→${r1.watermark.to}，分歧 ${r1.disputes}（${d0.kind}），取代留痕 ${r1.superseded}`)

  // 同一份 jsonl 再跑：无新增、水位不动、日志不涨
  const logMid = lines(MERGE_LOG).length
  const r2 = merge('dayu', { peer: 'pc', rows: PC_ROWS })
  assert.equal(r2.added, 0, `第二次又新增了 ${r2.added} 条`)
  assert.equal(r2.skipped, 'no-new', `第二次应该直接说 no-new，实际 skipped=${r2.skipped}`)
  assert.deepEqual(r2.watermark, { from: 4, to: 4 }, `第二次水位动了：${JSON.stringify(r2.watermark)}`)
  assert.equal(lines(MERGE_LOG).length, logMid, '水位已最新却还写了 merge.log')
  assert.equal(lines(DISPUTES_FILE).length, 1, '重复跑又写了一条分歧')
  assert.equal(readMem().events.length, events.length, '重复跑改了记忆条数')
  say(`⑤ 幂等：同一份再跑 added:${r2.added} skipped:${r2.skipped}，水位 ${r2.watermark.from}→${r2.watermark.to}，merge.log 没涨（第 ${logMid} 行后无新增）`)
}

// ── ⑥ 拆 s.jsonl 两份跑（CLI 真跑，可复现） ───────────────────────
{
  const real = process.env.YUSHEN_SJSONL || 'D:\\DSH\\临时缓存\\test-sync.jsonl'
  let source = ''
  let rows = []
  if (fs.existsSync(real)) {
    source = real
    for (const line of lines(real)) {
      try {
        const r = JSON.parse(line)
        if (r && r.role === 'dayu' && typeof r.text === 'string') rows.push(r)
      } catch { /* 坏行跳过 */ }
      if (rows.length >= 40) break
    }
  }
  if (rows.length < 20) {
    // 没有真 s.jsonl 就用等价形状的自造数据（同字段、无 seq、无冷档标）
    source = '自造（真 s.jsonl 不在本机）'
    rows = []
    for (let i = 0; i < 20; i++) {
      rows.push({ role: 'dayu', at: new Date(Date.parse(T0) - i * 3600e3).toISOString(), channel: '工作台', kind: 'say', text: `拆两份演练第 ${i + 1} 条：这件事发生在 ${i} 点`, device: i % 2 ? 'pc' : 'phone', id: 'm-' + crypto.createHash('sha1').update(`split-${i}`).digest('hex').slice(0, 10) })
    }
  }
  rows = rows.slice(0, 20)
  const halfA = path.join(tmp, 's-half-a.jsonl')
  const halfB = path.join(tmp, 's-half-b.jsonl')
  fs.writeFileSync(halfA, rows.slice(0, 10).map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  fs.writeFileSync(halfB, rows.slice(10).map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')

  const run = (home, file, extra = []) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'merge.mjs'), 'phone', '--role', 'dayu', '--file', file, ...extra], {
      encoding: 'utf8',
      timeout: 120000,
      env: { ...process.env, DSH_HOME: home, YUSHEN_DEVICE: 'desktop' },
    })
    const outText = String(r.stdout || '')
    const j = (() => { try { return JSON.parse(outText.slice(0, outText.indexOf('\n合并'))) } catch { return null } })()
    return { code: r.status, json: j, text: outText, err: String(r.stderr || '') }
  }
  const home1 = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-merge-s-'))
  const a1 = run(home1, halfA)
  assert.equal(a1.code, 0, `CLI 第一半跑挂了：${a1.err.slice(0, 300) || a1.text.slice(0, 300)}`)
  assert.ok(a1.json, `CLI 没输出 JSON：${a1.text.slice(0, 300)}`)
  assert.equal(a1.json.added, 10, `第一半应该新增 10 条，实际 ${a1.json.added}`)
  const b1 = run(home1, halfB)
  assert.equal(b1.json?.added, 10, `第二半应该新增 10 条，实际 ${b1.json?.added}`)
  // 重复跑：两份都无新增，日志不涨
  const logPath = path.join(home1, 'dayu', 'sync', 'merge.log')
  const logN = lines(logPath).length
  const a2 = run(home1, halfA)
  const b2 = run(home1, halfB)
  assert.equal(a2.json?.added, 0, `第一半重复跑又新增了 ${a2.json?.added}`)
  assert.equal(b2.json?.added, 0, `第二半重复跑又新增了 ${b2.json?.added}`)
  assert.equal(lines(logPath).length, logN, '重复跑长了 merge.log')
  // 这批老导出没有 seq：合并时按 at 排序补号，只补一次，且不改正文
  const memAfter = JSON.parse(fs.readFileSync(path.join(home1, 'dayu', 'soul', 'memory', 'dayu.json'), 'utf8'))
  const inferred = memAfter.events.filter((e) => e.seqInferred === true)
  assert.equal(inferred.length, 20, `应该有 20 条补了 seqInferred，实际 ${inferred.length}`)
  const seqs = inferred.map((e) => e.seq).sort((x, y) => x - y)
  assert.deepEqual(seqs, Array.from({ length: 20 }, (_, i) => i + 1), `补出来的 seq 不是 1..20：${seqs.join(',')}`)
  assert.ok(memAfter.events.every((e) => typeof e.text === 'string' && e.text.length > 0), '补号把正文弄丢了')
  // 可复现：换一个干净的临时家，同一份第一半跑出来还是 10
  const home2 = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-merge-s2-'))
  const again = run(home2, halfA)
  assert.equal(again.json?.added, 10, `换个家跑同一份变成 ${again.json?.added} 条（不可复现）`)
  // --dry：只算不写
  const dryHome = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-merge-dry-'))
  const dry = run(dryHome, halfA, ['--dry'])
  assert.equal(dry.code, 0, `--dry 跑挂了：${dry.err.slice(0, 200)}`)
  assert.equal(dry.json?.added, 10, `--dry 算出来 ${dry.json?.added} 条，应该是 10`)
  assert.equal(fs.existsSync(path.join(dryHome, 'dayu', 'sync', 'watermark.json')), false, '--dry 却写了水位')
  assert.equal(fs.existsSync(path.join(dryHome, 'dayu', 'sync', 'merge.log')), false, '--dry 却写了 merge.log')
  assert.equal(fs.existsSync(path.join(dryHome, 'dayu', 'soul', 'memory', 'dayu.json')), false, '--dry 却写了记忆')
  const mem1 = JSON.parse(fs.readFileSync(path.join(home1, 'dayu', 'soul', 'memory', 'dayu.json'), 'utf8'))
  assert.equal(mem1.events.length, 20, `两份拼完应该有 20 条，实际 ${mem1.events.length}`)
  say(`⑥ 拆两份 CLI：${path.basename(source)} 取 20 条 → 10+10 都入库（共 20），重跑两份 added:0 且日志没涨，换个家再跑仍 10（可复现），--dry 一个字节都没写`)
}

// ── ⑦ 定型文档不进合并 + 睡眠窗口只合并一次 ───────────────────────
{
  const before = readMem().events.length
  const sealed = merge('dayu', {
    peer: 'pc',
    rows: [
      { role: 'dayu', device: 'pc', seq: 5, at: minute(30), channel: '工作台', kind: 'say', text: '把宪章第 3 条改成了新说法', id: 'm-' + 'e'.repeat(10), docClass: 'doc:宪章', sealed: true },
    ],
  })
  assert.equal(sealed.added, 0, `定型文档被当成事件合进来了（+${sealed.added}）`)
  assert.equal(sealed.ignored, 1, `定型文档没被忽略（ignored=${sealed.ignored}）`)
  assert.equal(readMem().events.length, before, '定型文档那次合并改了记忆')

  const nightRows = [{ role: 'dayu', device: 'pc', seq: 6, at: minute(40), channel: '工作台', kind: 'say', text: '晚上那趟只合并一次的这件事', id: 'm-' + 'f'.repeat(10) }]
  const n1 = merge('dayu', { peer: 'pc', rows: nightRows, night: '2026-11-02' })
  assert.equal(n1.added, 1, `睡眠窗口第一次应该合并 1 条，实际 ${n1.added}`)
  const n2 = merge('dayu', { peer: 'pc', rows: nightRows, night: '2026-11-02' })
  assert.equal(n2.skipped, 'night-done', `同一晚不该再合并，实际 skipped=${n2.skipped}`)
  const wm = JSON.parse(fs.readFileSync(WATERMARK_FILE, 'utf8'))
  assert.equal(wm.lastNightMerge, '2026-11-02', '没记 lastNightMerge')
  // 清单快速通道：seqTo <= 水位 → 不读文件也能回答无新增
  const fast = mergeFromFile('dayu', { peer: 'pc', file: path.join(tmp, 'nope.jsonl'), manifest: { seqTo: 1 } })
  assert.equal(fast.ok, true, '清单快速通道报错')
  say(`⑦ 定型文档：忽略 ${sealed.ignored} 条、一条没入库；睡眠窗口第一次 +${n1.added}、第二次 skipped:${n2.skipped}，lastNightMerge=${wm.lastNightMerge}`)
}

say('七组都过')
process.exit(0)
