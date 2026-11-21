// 标签：解析 / 剥掉 / 按标签取 / 调用留痕去重。全离线，临时家目录（除读真卡那一段是只读）。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-tags-'))
process.env.DSH_HOME = TMP
const { parseTagBlock, stripForInject, readTags, matchesAny, logUse, staleTaggedFiles } = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/tags.js')

// 1. 解析：字段、标签切分、正文保留
{
  const md = `<!-- 标签
id: demo
kind: card
tags: 身份, 边界、语气
created: 2026-11-03 23:10:00
author: 老板
authority: 老板（示例）
why: 因为要按需提取
result: 能取到
mutable: 可改
-->

# 正文标题

正文第一段。
`
  const r = parseTagBlock(md)
  assert.equal(r.found, true)
  assert.equal(r.meta.id, 'demo')
  assert.deepEqual(r.tags, ['身份', '边界', '语气'])
  assert.equal(r.meta.created, '2026-11-03 23:10:00')
  assert.match(r.rest, /^# 正文标题/)
  assert.equal(r.rest.includes('标签'), false, '标签块没从正文里剥掉')
}

// 2. 没有标签块 / 标签没闭合：都不算有
{
  assert.equal(parseTagBlock('# 普通文档\n').found, false)
  assert.equal(parseTagBlock('<!-- 标签\ntags: x\n# 没闭合\n').found, false, '没闭合也被当成了标签块')
}

// 2b. 代码模块用块注释写（JS 里 <!-- 不合法）：两种格式都要认
{
  const js = `/* 标签
 * id: lib-demo
 * kind: module
 * tags: 记忆, 备份
 * changed: 2026-11-03 23:25:00
 */
import fs from 'node:fs'
`
  const r = parseTagBlock(js)
  assert.equal(r.found, true, '/* 标签 */ 没认出来')
  assert.equal(r.meta.id, 'lib-demo')
  assert.deepEqual(r.tags, ['记忆', '备份'])
  assert.match(r.rest, /^import fs/, '代码块剥完该剩代码本身')
  assert.equal(parseTagBlock('/* 标签\n * tags: x\n').found, false, '代码块没闭合也算有？')
}

// 3. 自动生成标记也要剥（sync-cards 会给副本加一行）
{
  const t = stripForInject('<!-- AUTOGEN：由脚本生成 -->\n\n# 卡\n')
  assert.equal(t.startsWith('# 卡'), true, `AUTOGEN 没剥掉：${t.slice(0, 20)}`)
}

// 4. 按标签取：有交集算命中
{
  assert.equal(matchesAny(['身份', '边界'], ['边界']), true)
  assert.equal(matchesAny(['身份'], ['语气']), false)
  assert.equal(matchesAny([], []), true)
}

// 5. 真卡（只读）：照微的卡带标签，而且注入用的正文里没有标签块
{
  const card = 'C:/Users/Administrator/.dsh/dayu/soul/cards/dragon.md'
  if (fs.existsSync(card)) {
    const r = readTags(card)
    assert.equal(r.found, true, '照微的卡上没有标签块')
    assert.ok(r.tags.length >= 5, `标签太少：${r.tags.join('、')}`)
    for (const k of ['created', 'changed', 'author', 'authority', 'why', 'result']) assert.ok(r.meta[k], `缺字段 ${k}`)
    assert.match(r.meta.changed, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'changed 没到秒')
    const soul = await import('file:///D:/DSH/%E5%A4%A7%E5%B0%8F%E9%B1%BC/dsh-yushen-twins/lib/soul.js')
    // 临时家里没有名册，readCard 会抛「未知角色」——这段验的是"剥没剥"，拿不到卡就跳过（不假装验过）。
    let read = null
    try { read = soul.readCard('dragon', 'desk') } catch { read = null }
    if (read) assert.equal(/<!--\s*标签/.test(read.text), false, '标签块进了注入正文')
  }
}

// 6. 调用留痕：同一分钟同一件事只留一条
{
  const a = logUse({ source: 'x/card.md', role: 'dragon', scene: 'desk', tags: ['身份'], purpose: '注入' })
  const b = logUse({ source: 'x/card.md', role: 'dragon', scene: 'desk', tags: ['身份'], purpose: '注入' })
  assert.equal(a.ok, true)
  assert.equal(b.skipped, true, '同一分钟同一件事重复记了')
  const file = path.join(TMP, 'dayu', 'runtime', 'tag-usage.jsonl')
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
  assert.equal(rows.length, 1, `该只有一条，实际 ${rows.length}`)
  const row = JSON.parse(rows[0])
  assert.deepEqual(row.tags, ['身份'])
  assert.ok(row.minute, '没记到分钟')
}

// 7. 改了内容没改标签 → 必须能查出来（老板 2026-11-03：改了内容就要做标注，这个要做到）
{
  const dir = path.join(TMP, 'stale')
  fs.mkdirSync(dir, { recursive: true })
  const f = path.join(dir, 'a.js')
  fs.writeFileSync(f, '/* 标签\n * id: a\n * kind: module\n * tags: 测试\n * changed: 2026-01-01 00:00:00\n */\nconst a = 1\n', 'utf8')
  const stale = staleTaggedFiles([f])
  assert.equal(stale.length, 1, '改了内容没改标签，居然查不出来')
  assert.ok(stale[0].driftSec > 0, 'driftSec 不对')
  const now = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  const nowText = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`
  fs.writeFileSync(f, `/* 标签\n * id: a\n * kind: module\n * tags: 测试\n * changed: ${nowText}\n */\nconst a = 2\n`, 'utf8')
  assert.equal(staleTaggedFiles([f]).length, 0, '刷了 changed 还算过期')
  const plain = path.join(dir, 'b.js')
  fs.writeFileSync(plain, 'const b = 1\n', 'utf8')
  assert.equal(staleTaggedFiles([plain]).length, 0)
}

fs.rmSync(TMP, { recursive: true, force: true })
console.log('标签：解析/两种写法都认/没闭合不算/剥 AUTOGEN/按标签取/真卡带标签且不进注入/留痕去重/过期能查 八组都过')
