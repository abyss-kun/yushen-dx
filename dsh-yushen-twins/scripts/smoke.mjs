// 冒烟测试：一条命令检查核心、适配器、派活、事故、成长、能力表、语法。
// 运行：node scripts/smoke.mjs

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const u = (rel) => JSON.stringify(pathToFileURL(path.join(ROOT, rel)).href)
const node = process.execPath
let pass = 0
let fail = 0

function ok(name, fn) {
  try { const detail = fn(); pass += 1; console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`) }
  catch (e) { fail += 1; console.error(`✗ ${name} — ${e?.message || e}`) }
}

// 1. 语法：所有 js
ok('语法检查', () => {
  const files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (p.endsWith('.js')) files.push(p)
    }
  }
  walk(ROOT)
  for (const f of files) execFileSync(node, ['--check', f], { stdio: 'pipe' })
  return `${files.length} 个文件`
})

// 1b. 导入自检（2026-10-27 事故）：语法对、但用了没 import 的变量 → 插件 apply 时炸，
// 她的工具全消失、所有 /api/dayu/* 401，而冒烟和回归照样全绿。这条专治它。
ok('导入自检 — 每个模块真的能 import', () => {
  const out = execFileSync(node, [path.join(ROOT, 'scripts', 'import-check.mjs')], { stdio: 'pipe', encoding: 'utf8' })
  return String(out).trim().split('\n').pop()
})

// 2. 隔离环境里的行为测试（子进程 + 临时 DSH_HOME）
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-smoke-'))
function child(code) {
  return execFileSync(node, ['--input-type=module', '-e', code], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, DSH_HOME: tmp },
  }).trim()
}

ok('core 记账', () => {
  const out = child(`
    import { ledger } from ${u('core/index.js')};
    ledger.record({ type: 'smoke', text: 'ok' });
    console.log(ledger.today(1).length)
  `)
  if (out !== '1') throw new Error(`账本条数 ${out}`)
  return '1 条'
})

ok('CLI 派活 + 打回 + 收工', () => {
  const out = child(`
    import { attachCli } from ${u('adapters/cli.js')};
    import { dispatch, verdict, verifyTaskEvidence } from ${u('core/dispatch.js')};
    const cli = attachCli({ out: () => {} });
    const t = await dispatch(cli, { brief: '冒烟', expect: '证据' });
    const r = await verdict(cli, { id: t.id, verdict: 'reject', note: '没证据' });
    await verifyTaskEvidence(t.id, { kind: 'file', path: process.cwd() + '/package.json' });
    const p = await verdict(cli, { id: t.id, verdict: 'pass', note: '补了' });
    console.log([t.status, r.task.status, p.task.status].join('/'));
  `)
  if (out !== 'dispatched/redispatched/done') throw new Error(out)
  return out
})

ok('事故：建单 → 升级 → 结单草稿', () => {
  const out = child(`
    import { noteIncident, resolveIncident, listIncidents } from ${u('lib/incidents.js')};
    const a = noteIncident({ sessionId: 's', title: '冒烟', text: 'x' });
    noteIncident({ sessionId: 's', title: '冒烟', text: 'x' });
    const c = noteIncident({ sessionId: 's', title: '冒烟', text: 'x' });
    const d = resolveIncident(c.id, { note: '修好了' });
    console.log([c.count, c.severity, listIncidents({ limit: 1 })[0].status, Boolean(d.fixDraft)].join('/'));
  `)
  if (out !== '3/high/fixed/true') throw new Error(out)
  return out
})

ok('成长：默认初到 → 调终阶 → 重置', () => {
  const out = child(`
    import { status, adjust } from ${u('lib/growth.js')};
    const a = status(); const b = adjust({ level: 4, reason: '冒烟' }); const c = adjust({ xp: 0, reason: '冒烟' });
    console.log([a.stage, b.stage, c.stage].join('/'));
  `)
  if (out !== '初阶/终阶/初阶') throw new Error(out)
  return out
})

ok('能力表：默认全开 → 收 → 给', () => {
  const out = child(`
    import { granted, has, setCap } from ${u('lib/authz.js')};
    const a = granted().length; setCap('session.rotate', false, '冒烟'); const b = has('session.rotate'); setCap('session.rotate', true, '冒烟'); const c = has('session.rotate');
    console.log([a, b, c].join('/'));
  `)
  if (out !== '10/false/true') throw new Error(out)
  return out
})

ok('插件入口可加载', () => {
  const out = child(`
    const m = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'index.js')).href)});
    console.log(typeof m.apply === 'function' ? 'apply' : 'no-apply');
  `)
  if (out !== 'apply') throw new Error(out)
  return 'apply 导出正常'
})

ok('内置清单', () => {
  const out = child(`
    import { listBuiltin } from ${u('lib/builtin.js')};
    const r = listBuiltin(); console.log(r.count > 100 ? 'ok' : 'low:' + r.count);
  `)
  if (out !== 'ok') throw new Error(out)
  return 'ok'
})

ok('基线清单', () => {
  execFileSync(node, [path.join(ROOT, 'scripts/baseline.mjs')], { stdio: 'pipe' })
  return '25 项'
})

ok('回归清单', () => {
  execFileSync(node, [path.join(ROOT, 'scripts/regression.mjs')], { stdio: 'pipe' })
  return '全过'
})

ok('设定基线', () => {
  execFileSync(node, [path.join(ROOT, 'scripts/verify-settings.mjs')], { stdio: 'pipe' })
  return '全过'
})

ok('移动端接口', () => {
  execFileSync(node, [path.join(ROOT, 'scripts/test-mobile-routes.mjs')], { stdio: 'pipe' })
  execFileSync(node, [path.join(ROOT, 'scripts/test-mobile-gateway.mjs')], { stdio: 'pipe' })
  return '配对/令牌/消息/撤销'
})

ok('书架：八本书都能列目录', () => {
  const out = child(`
    import { shelf, contents } from ${u('lib/books.js')};
    const ids = shelf().books.map((b) => b.id);
    const miss = ids.filter((id) => contents(id, { limit: 1 }).ok !== true);
    const empty = contents('solutions', { limit: 1 });
    const bad = contents('nope');
    const shape = Object.keys(contents('handbook', { limit: 1 }).items[0] || {}).sort().join(',');
    console.log([ids.length, miss.length, empty.ok === true, bad.ok === false, shape === 'at,hint,id,line,tags,title,where'].join('/'));
  `)
  // 书的数量会随功能增加（2026-10-28 从 8 本涨到 11 本），别把本数写死；
  // 真正要锁的是"每本都列得出目录、格式统一"。
  {
    const [count, miss, emptyOk, badOk, shapeOk] = String(out).trim().split('/')
    if (Number(count) < 8) throw new Error(`书少于 8 本：${out}`)
    if (miss !== '0') throw new Error(`有书列不出目录：${out}`)
    if (emptyOk !== 'true' || badOk !== 'true' || shapeOk !== 'true') throw new Error(out)
    return `${count} 本 / 0 缺目录 / 格式统一`
  }
})

ok('规则块：书脊在、不截断', () => {
  const out = child(`
    import { rulesBlock } from ${u('lib/rules-block.js')};
    const t = rulesBlock('dayu');
    console.log([t.includes('手边的书'), t.includes('yushen_books'), t.includes('截断')].join('/'));
  `)
  if (out !== 'true/true/false') throw new Error(out)
  return '书脊 + 目录入口'
})

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n通过 ${pass}，失败 ${fail}`)
process.exit(fail ? 1 : 0)
