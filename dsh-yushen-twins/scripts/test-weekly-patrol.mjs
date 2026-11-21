// 每周巡视（2026-11-04 老板：每一样都有人用吗？做成自动化，不需要维护，最多每周巡视一圈）
// 测三件：①能跑、有结构化结果 ②单角色装不会把"派活给姐妹"算成问题 ③报告真的写出来
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-patrol-'))
fs.mkdirSync(path.join(TMP, 'dayu'), { recursive: true })
const script = 'D:/DSH/大小鱼/dsh-yushen-twins/scripts/weekly-patrol.mjs'

// ① 空家也能跑：不崩、有 items/summary/verdict
{
  const r = spawnSync(process.execPath, [script, '--json', '--dry'], { encoding: 'utf8', env: { ...process.env, DSH_HOME: TMP }, timeout: 120000 })
  assert.equal(r.status === 0 || r.status === 1, true, `退出码异常：${r.status} ${String(r.stderr || '').slice(0, 200)}`)
  const out = JSON.parse(String(r.stdout || '{}'))
  assert.ok(Array.isArray(out.items) && out.items.length >= 5, `items 太少：${out.items?.length}`)
  assert.equal(typeof out.summary, 'string')
  assert.equal(typeof out.verdict, 'string')
  // 每项都要有"用了没/状态"两个字段，缺一个这份报告就没法看
  for (const it of out.items) {
    assert.ok('used' in it && 'status' in it, `某项缺字段：${JSON.stringify(it)}`)
    assert.ok(['read', 'bad', 'skip'].includes(it.status), `状态值不认识：${it.status}`)
  }
}

// ② 单角色装：派活那项标“不适用”，不能算成闲置/坏了
//    造一个只有一条鱼的名册（新用户常见情况），不是靠"名册读不到"的兜底（兜底是两条鱼）。
{
  fs.writeFileSync(path.join(TMP, 'dayu', 'characters.json'), JSON.stringify({
    version: 1,
    characters: [{ id: 'xiaoyu', name: '小鱼', cards: { desk: 'cards/xiaoyu.desk.md', social: 'cards/xiaoyu.desk.md' }, memory: 'memory/xiaoyu.json' }],
  }), 'utf8')
  const r = spawnSync(process.execPath, [script, '--json', '--dry'], { encoding: 'utf8', env: { ...process.env, DSH_HOME: TMP }, timeout: 120000 })
  const out = JSON.parse(String(r.stdout || '{}'))
  assert.deepEqual(out.roles, ['xiaoyu'], `名册没读成单角色：${JSON.stringify(out.roles)}`)
  const dispatch = out.items.find((i) => i.name === '派活')
  assert.ok(dispatch, '没有"派活"这一项')
  assert.equal(dispatch.status, 'skip', `单角色装派活该标不适用，实际 ${dispatch.status}`)
  fs.rmSync(path.join(TMP, 'dayu', 'characters.json'), { force: true })
}

// ③ 真写报告：不 dry 的时候要落一份 markdown
{
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, DSH_HOME: TMP }, timeout: 120000 })
  assert.equal(r.status === 0 || r.status === 1, true)
  const dir = path.join(TMP, 'dayu', 'health')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('每周巡视-')) : []
  assert.equal(files.length, 1, `报告没写：${files.join(',')}`)
  const md = fs.readFileSync(path.join(dir, files[0]), 'utf8')
  assert.ok(md.includes('每周巡视'), '报告标题不对')
  assert.ok(md.includes('| 项 | 7 天用了 | 状态 | 备注 |'), '报告缺表头')
}

fs.rmSync(TMP, { recursive: true, force: true })
console.log('每周巡视：空家能跑 / 单角色标不适用 / 报告真写出来 三组都过')
