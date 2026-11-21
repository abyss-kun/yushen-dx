/* 标签
 * id: test-memory-housekeeping
 * kind: module
 * tags: 测试, 记忆维护, 离线
 * created: 2026-11-04 14:20:00
 * changed: 2026-11-04 14:20:00
 * author: 照微·工作台
 * authority: 老板（2026-11-04：能放电脑里的别放宿主）
 * why: 搬出宿主后，至少要保证它在离线环境里自己能跑、不会乱删
 * result: --dry 只报计划不动文件；空家不崩；护栏生效
 * mutable: 可改
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-mh-'))
fs.mkdirSync(path.join(TMP, 'dayu', 'state'), { recursive: true })
const script = 'D:/DSH/大小鱼/dsh-yushen-twins/scripts/memory-housekeeping.mjs'

// ① 空家 + dry：不崩、结构化、什么都不删
//    注意：dry 允许生成 retention.json（策略文件缺省值），那是"读策略"的副产品；
//    真正不许的是**删**——所以这里比的是"原文件还在不在"，不是目录完全不变。
{
  fs.mkdirSync(path.join(TMP, 'dayu', 'soul', 'memory'), { recursive: true })
  const keep = path.join(TMP, 'dayu', 'soul', 'memory', 'dragon.json')
  fs.writeFileSync(keep, JSON.stringify({ events: [{ at: new Date().toISOString(), text: '不该被 dry 删掉' }] }), 'utf8')
  const r = spawnSync(process.execPath, [script, '--dry'], { encoding: 'utf8', env: { ...process.env, DSH_HOME: TMP }, timeout: 180000 })
  assert.equal(r.status, 0, String(r.stderr || '').slice(0, 200))
  const out = JSON.parse(String(r.stdout || '{}'))
  assert.equal(out.dry, true)
  assert.ok('forget' in out && Array.isArray(out.consolidate) && Array.isArray(out.skipped), '输出字段不全')
  assert.equal(fs.existsSync(keep), true, 'dry 模式把记忆文件删了')
}

// ② 护栏：把遗忘时间戳写成刚跑过 → 应该跳过
{
  fs.writeFileSync(path.join(TMP, 'dayu', 'state', 'forget.json'), JSON.stringify({ lastRunAt: new Date().toISOString() }), 'utf8')
  const r = spawnSync(process.execPath, [script, '--dry'], { encoding: 'utf8', env: { ...process.env, DSH_HOME: TMP }, timeout: 180000 })
  const out = JSON.parse(String(r.stdout || '{}'))
  assert.ok(out.skipped.some((s) => s.includes('遗忘')), `护栏没生效：${JSON.stringify(out.skipped)}`)
}

fs.rmSync(TMP, { recursive: true, force: true })
console.log('记忆维护（离线）：dry 不动文件 / 空家不崩 / 护栏生效 三组都过')
