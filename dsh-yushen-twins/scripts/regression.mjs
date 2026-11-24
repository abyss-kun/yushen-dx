// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/regression.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 回归清单：每一条“反馈过的问题”在这里变成一条断言。
// 规矩：修完一个 bug，先在这里加一条；加不出来，说明还没真修明白。
// 运行：node scripts/regression.mjs
// 改｜2026-11-02 16:25｜大鱼·子会话（工作台）｜授权：主人（本次任务书：让她看得见钱，别拿硬闸）｜scripts/regression.mjs:1800-1860｜新增 87b 三条断言：钱块有「上限」+ 有峰谷判断 + 整块 ≤260 字 + 钱块和 brief.js 里没有"别说了/不许说"这类代她决定的话｜为什么：老板要的是她会自己判断，不是花到限额被代码强行停；加不出断言就等于没落实｜验证：node scripts/regression.mjs 全绿（三条断言在「钱的事」真跑一遍，180 字、上限与峰谷都在）｜可改：只许加，不许删（删一条要写清为什么）

import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 临时目录放系统 temp，不放仓库里：沙箱会话只放行工作区的“写”，
// 但 .state 下的 mkdtemp 在受限会话里会被 ACL 拒（EPERM），几条断言就假红。
const tmpRoot = () => os.tmpdir()
let pass = 0
let fail = 0
let skipped = 0

function ok(name, fn) {
  try { const detail = fn(); pass += 1; console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`) }
  catch (e) { fail += 1; console.error(`✗ ${name} — ${e?.message || e}`) }
}

/**
 * 跑一个独立测试脚本。沙箱不让开子进程管道时 status 是 null + error.code EPERM，
 * 这种不是“测试失败”，是“这里根本跑不了”——单独记跳过，不冒充绿，也不冒充红。
 * 别的 null（比如脚本不存在 ENOENT）照旧算失败，别把真问题跳过去。
 */
function runTestScript(script) {
  // 2026-10-31 23:1x（老板：三族会审还是没防住）：子进程测试一律带上沙箱——
  // 往真家目录（~/.dsh）写就当场抛 TEST_WROTE_REAL_HOME，不许再出现"测试把假数据写进真家"。
  const sandboxUrl = pathToFileURL(path.join(ROOT, 'scripts', '_test-sandbox.mjs')).href
  // 2026-10-31 23:2x：前面某个用例把 process.env.DSH_HOME 指到临时家，没恢复，
  // 后面的 measure-injection 就在空家里量，字数掉到 8227 被误判。每个测试都从真家出发。
  const realHome = path.join(os.homedir(), '.dsh')
  const r = spawnSync(process.execPath, ['--import', sandboxUrl, path.join(ROOT, script)], {
    encoding: 'utf8',
    env: { ...process.env, YUSHEN_TEST: '1', DSH_HOME: realHome },
  })
  const code = String(r.error?.code || '')
  const blocked = r.status === null && (code === 'EPERM' || code === 'EACCES')
  if (blocked) {
    skipped += 1
    console.log(`⤼ ${script} — 跳过：这个环境不让开子进程（${code}）`)
    return false
  }
  assert.ok(r.status !== null, `跑不起来：${script}（${code || '没有状态码'}）`)
  assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 400))
  return true
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const has = (rel, needle) => { if (!read(rel).includes(needle)) throw new Error(`${rel} 里没有「${needle}」`) }

// 2026-11-04：文档会按体检报告归档到 docs/archive/<日期>/；断言不该因为"搬家"变红。
function docPath(name) {
  const direct = path.join(ROOT, 'docs', name)
  if (fs.existsSync(direct)) return direct
  const archRoot = path.join(ROOT, 'docs', 'archive')
  const stack = [archRoot]
  while (stack.length) {
    const dir = stack.pop()
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.name === name) return full
    }
  }
  return direct
}
const hasDoc = (name, needle) => { const p = docPath(name); if (!fs.existsSync(p)) throw new Error(`找不到文档（docs 与 archive 都没有）：${name}`); if (!fs.readFileSync(p, 'utf8').includes(needle)) throw new Error(`${name} 里没有「${needle}」`) }
const { markPending, takePending, peekPending, toMs } = await import(pathToFileURL(path.join(ROOT, 'lib/pending.js')).href)
const { attributionOf } = await import(pathToFileURL(path.join(ROOT, 'lib/memory.js')).href)
const { memoryView, buildSceneText } = await import(pathToFileURL(path.join(ROOT, 'lib/soul.js')).href)
const { judge: backupJudge } = await import(pathToFileURL(path.join(ROOT, 'lib/backup-judge.js')).href)
const { plan: forgetPlan, policy: forgetPolicy } = await import(pathToFileURL(path.join(ROOT, 'lib/forget.js')).href)
const { handbookForEmployee } = await import(pathToFileURL(path.join(ROOT, 'lib/employee-profile.js')).href)
// 2026-11-02 老板：时间只认系统；这条断言直接量 lib/clock.js 本身。
const CLOCK = await import(pathToFileURL(path.join(ROOT, 'lib/clock.js')).href)
const { describe: describePaths } = await import(pathToFileURL(path.join(ROOT, 'lib/paths.js')).href)
const { uninstallPlan, UNINSTALL_KEEP } = await import(pathToFileURL(path.join(ROOT, 'lib/schema.js')).href)
const { diagnose: diagnoseStuck, VERDICTS } = await import(pathToFileURL(path.join(ROOT, 'lib/stuck-doctor.js')).href)
const { hasEvidence, summary: employeeSummary } = await import(pathToFileURL(path.join(ROOT, 'lib/employee-record.js')).href)
const { analyzePlugin } = await import(pathToFileURL(path.join(ROOT, 'lib/intake.js')).href)
const { blankCard, CARD_SECTIONS } = await import(pathToFileURL(path.join(ROOT, 'lib/card-template.js')).href)
const { checkCard, parseCardMeta } = await import(pathToFileURL(path.join(ROOT, 'lib/card-check.js')).href)
const { snapshot, restore: restoreTakeover, markApplied, isProtected } = await import(pathToFileURL(path.join(ROOT, 'lib/takeover.js')).href)
const { detectRoles } = await import(pathToFileURL(path.join(ROOT, 'lib/detect-roles.js')).href)
const { pickAttributed } = await import(pathToFileURL(path.join(ROOT, 'lib/channel-memory.js')).href)
const { prepareResidenceText } = await import(pathToFileURL(path.join(ROOT, 'lib/residence.js')).href)
const { rewriteCatalog, rewriteMemory } = await import(pathToFileURL(path.join(ROOT, 'lib/rewrite.js')).href)
const { notifySelf, listNotices, unreadNotices } = await import(pathToFileURL(path.join(ROOT, 'lib/notices.js')).href)
const { lifeChecklist } = await import(pathToFileURL(path.join(ROOT, 'lib/initiation.js')).href)
const { CLARITY_ORDER, memoryCapacity } = await import(pathToFileURL(path.join(ROOT, 'lib/memory.js')).href)
const { addFromMind } = await import(pathToFileURL(path.join(ROOT, 'lib/agenda.js')).href)
const { bodyStatus, bodyRecent } = await import(pathToFileURL(path.join(ROOT, 'lib/body-loop.js')).href)
// 2026-11-01：按需发放的场景表与取节/记账函数（回归直接调，不经过工具层）。
const handbookLib = await import(pathToFileURL(path.join(ROOT, 'lib/handbook.js')).href)
const handbookPolicy = await import(pathToFileURL(path.join(ROOT, 'lib/handbook-policy.js')).href)

// 1. 2026-10-22：m1 漏导出 listJobs → 整个插件加载失败、侧边栏入口消失。
ok('入口导出齐全：dayu/index.js 要的 listJobs 真存在', () => {
  has('dayu/m1.js', 'export function listJobs')
  has('dayu/index.js', 'listJobs')
  return 'm1 导出 + dayu 使用'
})

// 2. 同类：任何“静态 import 的名字”都必须在目标文件里真的 export。
ok('全模块命名导入都能解析', () => {
  const files = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'archive' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(js|mjs)$/.test(p)) files.push(p)
    }
  }
  walk(ROOT)
  // 改｜2026-11-11 00:5x｜大鱼·主代理｜授权：主人（2026-11-11：「都做」）｜scripts/regression.mjs:125｜扫导入前先剥掉注释｜为什么：说明格式要求每个文件头写 `usage: import { … } from '…'` 示例，那是**给人看的**，被这条断言当成真导入就误红（core/index.js 的 dispatch 就是这么红的）｜验证：regression 该条绿；core/index.js 的 usage 行保留｜可改：只许更准（剥注释），不许放宽"导出必须存在"
  const stripComments = (s) => String(s)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1')
  for (const f of files) {
    const text = stripComments(fs.readFileSync(f, 'utf8'))
    const re = /import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g
    let m
    while ((m = re.exec(text))) {
      const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)
      const target = path.resolve(path.dirname(f), m[2])
      const targetFile = [target, target + '.js', path.join(target, 'index.js')].find((p) => fs.existsSync(p))
      if (!targetFile) throw new Error(`${path.relative(ROOT, f)} 引用了不存在的 ${m[2]}`)
      const t = fs.readFileSync(targetFile, 'utf8')
      for (const name of names) {
        // 够用就行：export function/const/class、export { a, b }、export * as ns 都算。
        if (!new RegExp(`export[^\\n]*\\b${name.replace(/[$]/g, '\\$')}\\b`).test(t)) {
          throw new Error(`${path.relative(ROOT, f)} 导入了 ${name}，但 ${path.relative(ROOT, targetFile)} 没导出`)
        }
      }
    }
  }
  return `${files.length} 个文件`
})

// 3. 2026-10-23：Electron 的 fs 被 asar 补丁接管，读 app.asar 报 not found。
ok('读 app.asar 必须走 original-fs', () => {
  has('lib/builtin.js', 'original-fs')
  has('lib/dsh-internals.js', 'original-fs')
  return '两处都绕开 asar 补丁'
})

// 4. 2026-10-23：宿主里 spawn(detached) 静默失败 → 重启按钮没反应。
ok('重启走 execFile，且留下 attempt/log', () => {
  has('index.js', "execFile('powershell.exe'")
  has('index.js', 'restart-attempt.json')
  has('index.js', 'restart.log')
  if (/spawn\('powershell/.test(read('index.js'))) throw new Error('还有 spawn(powershell) 的老写法')
  return 'execFile + 证据文件'
})

// 5. 同类：所有后台起进程的地方都要能报错（不准再“静默失败”）。
ok('起子进程的地方都带回调或错误处理', () => {
  const files = ['lib/selfcheck.js', 'lib/patch.js']
  for (const f of files) if (!/execFile|spawn/.test(read(f))) throw new Error(`${f} 没起进程？检查`)
  return `${files.length} 处`
})

// 6. 2026-10-22：能力表空数组把所有人锁在门外。
ok('能力表默认全开，且 owner.write/host.restart 在表里', () => {
  const t = read('lib/authz.js')
  for (const cap of ['owner.write', 'host.restart', 'self.patch']) if (!t.includes(`'${cap}'`)) throw new Error(`缺 ${cap}`)
  return '8 项'
})

// 7. 2026-10-22：旧称呼混进默认值 / 文档。
ok('默认称呼不含作者私名', () => {
  const t = read('lib/onboard.js')
  if (/从零|小零/.test(t.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'))) throw new Error('默认值里混进了从零/小零')
  return '只有老板/boss/老大'
})

// 8. 2026-10-22：知识库（手册）路径写死，换电脑找不到。
ok('手册路径有兜底（包内 docs）', () => {
  has('lib/handbook.js', "'docs', '员工手册.md'")
  return '环境变量 → 作者路径 → 包内'
})

// 9. 结构：插件入口必须是 async apply（动态加载两条鱼，单条挂了不连累整体）。
ok('入口是 async 且动态加载子入口', () => {
  const t = read('index.js')
  if (!/export\s+async\s+function\s+apply/.test(t)) throw new Error('apply 不是 async')
  if (!/await import\('\.\/dayu\/index\.js'\)/.test(t)) throw new Error('大鱼不是动态加载')
  return 'async + 动态 import'
})

// 10. 她自己修的开关：默认关；开着时补丁当场落盘，但必须走 smoke + 备份 + 回滚。
ok('自修开关存在且默认关', () => {
  has('dayu/index.js', 'selfApply: false')
  has('dayu/index.js', "'selfApply'")
  return '默认关，写开关里有它'
})
ok('自修落盘必须走 applyPatch（备份+smoke+回滚）', () => {
  has('dayu/index.js', 'readSwitches().selfApply')
  has('dayu/index.js', 'applyPatch(patch.id)')
  has('lib/patch.js', 'rolled-back')
  return '开关 → applyPatch → 回滚'
})

// 2026-11-15 老板：「除了基本功能，一些可有可无的出厂默认关闭」。
// B站用户反馈后台时不时动、写出一堆看不懂的补丁——默认开着的后台是债务，不是功能。
// 钉死：自修/自由时间/自省/推送四项出厂默认关；基本功能（对话/记忆/卡/维护备份）不动。
ok('出厂默认安静：自修/自由时间/自省/推送默认关，面板能单独开', () => {
  has('dayu/index.js', 'autoRepair: false')
  has('dayu/index.js', 'freeTime: false')
  has('dayu/index.js', 'selfCheck: false')
  has('dayu/index.js', 'push: false')
  has('dayu/index.js', 'selfCheck: raw.selfCheck === true')
  has('dayu/index.js', 'push: raw.push === true')
  has('dayu/index.js', 'const selfCheckTick')
  has('dayu/index.js', 'if (!readSwitches().push) return')
  has('client.js', 'saveSelfCheck')
  has('client.js', 'savePush')
  return '四项默认关；timer 走开关；面板两个勾选框'
})

// 12. 2026-10-23：我干的活没有记在她账上，问小鱼搜不到 → 工作记录 + 搜索。
ok('工作记录可搜（开发侧每动一步留痕）', () => {
  has('lib/worklog.js', 'recordWork')
  has('lib/omni.js', 'searchWork')
  has('scripts/note-work.mjs', 'recordWork')
  return 'worklog.jsonl ← note-work → 搜索'
})

// 13. 2026-10-23：全能第一块砖——执行层：只读自动、写按目录、危险要申请、每次都记账。
ok('执行层：只读自动 / 写按目录 / 危险要申请 / 记账', () => {
  has('lib/exec.js', 'READ_PREFIX')
  has('lib/exec.js', 'ALLOWED_ROOTS')
  has('lib/exec.js', 'needsApproval: true')
  has('lib/exec.js', '危险命令：默认拒绝')
  has('lib/exec.js', 'recordAction')
  has('dayu/m1.js', "name: 'dayu_exec'")
  has('lib/authz.js', "'exec.run'")
  return 'dayu_exec + 目录白名单 + 申请单'
})

// 14. 2026-10-23：危险开关——默认关；开了也只是前置，仍要老板批；全知补“在场”。
ok('危险开关默认关，开了仍要老板批（不是字符串）', () => {
  has('dayu/index.js', 'allowDanger: false')
  has('lib/exec.js', 'allowDanger()')
  has('lib/exec.js', 'needsApproval: true')
  return '开关 + 申请单（不再靠 confirm 四个字）'
})
ok('全知·在场：窗口/端口/磁盘可采', () => {
  has('lib/observe.js', 'MainWindowTitle')
  has('lib/observe.js', 'Get-NetTCPConnection')
  has('lib/observe.js', 'Get-PSDrive')
  has('dayu/index.js', "route === '/observe'")
  return 'observe + 接口'
})

// 15. 2026-10-23：系统级权限要申请，同意后一次性放行。
ok('权限分层：软件内部直接给，系统级要申请', () => {
  has('lib/perm.js', "return SYSTEM.some")
  has('lib/exec.js', 'needsApproval')
  has('lib/exec.js', 'consumeApproval')
  has('dayu/index.js', "route === '/approvals'")
  has('client.js', '待批权限')
  return 'tier + 申请 + 一次性放行'
})

// 16. 2026-10-23：调模型走会话接口，不改配置、不用重启。
ok('换模型：走 session/selectModel + 能力表', () => {
  has('dayu/m1.js', "name: 'dayu_model'")
  has('dayu/m1.js', 'selectModelRpc')
  has('lib/authz.js', "'model.switch'")
  return 'dayu_model + model.switch'
})

// 10. 证据：每次崩溃必须留痕。
ok('崩溃留痕链路存在', () => {
  has('lib/crash.js', 'recordCrash')
  has('dayu/index.js', "route === '/crashes'")
  return 'crash.jsonl + 接口'
})

// 11. 2026-10-23：点了按钮没反应，却查不到“点过没有”→ 动作记录。
ok('动作记录链路存在（点击/请求都留痕）', () => {
  has('lib/actionlog.js', 'recordAction')
  has('index.js', "requireCap(res, 'host.restart'")
  has('index.js', "/api/yushen/action")
  has('dayu/index.js', "route === '/actions'")
  return 'actions.jsonl + 接口 + 点击埋点'
})

ok('群聊投递：依赖接线、RPC、失败可见与老板身份', () => {
  const ran = runTestScript('scripts/test-group-delivery.mjs')
  return ran ? '执行真实路由块，覆盖成功/失败与发送前关联' : '接线检查通过；这回合环境不给子进程，没真跑'
})

// 20. 2026-10-26：群聊回显不按会话 FIFO 认领；投递记同一本账，补投不重复问。
ok('群聊回显：只认本轮投递，私聊回合不串群，投递账防重复', () => {
  const ran = runTestScript('scripts/test-group-replies.mjs')
  has('lib/group-outbox.js', 'export function markQueued')
  has('lib/group-outbox.js', 'export function markReplied')
  has('lib/group-replies.js', "from './group-outbox.js'")
  has('dayu/index.js', 'markQueued({ conversationId, messageId, role')
  has('scripts/group-redeliver.mjs', 'if (answered.has(messageId)) continue')
  has('client.js', "m.direction === 'incoming' ? '老板'")
  return ran ? '回合绑定 + 同一本投递账 + 老板按方向显示' : '接线检查通过；这回合环境不给子进程，没真跑'
})

// 17. 2026-10-25：鱼窝第三槽——照微有自己的本体卡和常驻会话，不借两姐妹的。
ok('鱼窝三角色槽：dragon 可显示、点开、长按换图，并有自己的会话入口', () => {
  // 2026-10-27：角色名单改成从名册读（接入第 4 个人自动生效），不再写死三个
  has('lib/nest.js', 'export function roleList()')
  has('lib/nest.js', 'characterIds()')
  has('index.js', "/yushen-assets/nest/bg")
  has('client.js', "const NEST_ROLES = ['dayu', 'xiaoyu', 'dragon']")
  has('client.js', 'function NestFigure(')
  has('client.js', 'ysn-stage')
  has('client.js', 'ysc-panel')
  has('client.js', 'meta?.card')
  has('client.js', 'B站视频')
  has('dayu/index.js', "route === '/group-chat'")
  has('dayu/index.js', "kind: card ? 'bilibili-video' : 'text'")
  has('lib/bili-card.js', 'extractBiliVideo')
  has('client.js', '/residence/say')
  has('client.js', '叫醒她')
  has('lib/residence.js', 'residentRoles()')
  has('lib/characters.js', 'addCharacter')
  has('scripts/character.mjs', "action === 'add'")
  has('scripts/nest-ui-check.mjs', '三只都在窝里')
  return '三槽 + 背景路由 + 名册驱动的常驻身体（换别人的角色也能用）'
})

// 2026-11-08 小鱼：鱼窝验收在干净浏览器 profile 里跑，第一次会弹「鱼神」欢迎框，按钮叫「开始使用」。
// 以前只点「知道了/关」，弹窗一直盖着窝，缩放/滚轮/长按/名字命中 5 项全假红。断言 boot 会关它。
ok('鱼窝验收：干净 profile 先关首启欢迎框再测，不把弹窗当界面 bug', () => {
  has('scripts/nest-ui-check.mjs', `clickText('开始使用')`)
  return '首启弹窗关掉才测，20 项结果可信'
})

// 18. 2026-10-25：共享二创参考——知道有这么个东西，但不抄成自己的记忆。
ok('共享参考：三人知道存在，按需才查，不预置感想', () => {
  has('lib/soul.js', '你知道有这份共享资料')
  has('lib/soul.js', '外部资料，不是你的记忆')
  has('lib/soul.js', 'dayu_creative_recall')
  has('lib/creative-memory.js', '不替角色预写感想')
  return '只读入口 + 主题清单 + 按需召回'
})

// 23. 2026-10-25：员工手册全局可发现、按岗位/任务按需检索，不把正文和权限默认塞进上下文。
ok('员工手册按需发放：索引/本地检索/源章显式读取/家庭初识边界', () => {
  has('lib/handbook-policy.js', 'retrievalCallsLLM: false')
  has('lib/handbook.js', 'lookupHandbookKnowledge')
  has('lib/handbook.js', 'recognizeHousehold')
  has('scripts/test-handbook-policy.mjs', 'PASS handbook policy')
  has('dayu/index.js', 'dayu_handbook_recall')
  has('lib/handbook-policy.js', '投递成功不等于她已回话')
  has('lib/residence.js', '没有 HTTP 兜底')
  has('docs/员工手册.md', '手册分层与发放')
  has('docs/员工手册.md', '视频与创作')
  // 2026-10-31 追本溯源：旧选择器「按角色全给 + 命中再加」，只加不减——按需是假的。
  // 新增 topicsForTask（空任务零章），并接到 rules-block 上；这条测试证明它真的按任务取。
  has('lib/handbook-policy.js', 'topicsForTask')
  has('lib/rules-block.js', 'topicsForTask(')
  has('scripts/test-handbook-task.mjs', 'oldSelectorDayu')
  runTestScript('scripts/test-handbook-task.mjs')
  // 2026-10-31：两本手册（鱼神手册给角色、员工手册给员工），要能分书；再加一张「家里账」。
  has('lib/handbook-policy.js', 'chaptersOf')
  has('lib/handbook-policy.js', "return 'shen'")
  has('docs/鱼神手册.md', '鱼神手册')
  has('scripts/house-ledger.mjs', 'worklog.jsonl')
  has('scripts/house-ledger.mjs', '【员工】')
  return '通用底线 + 岗位/任务切片 + 源章显式读 + 可信上层工具入口 + 任务选择器（减法）'
})

// 19. 2026-10-25：别的通道读同一份本体（GET /soul），刷B站人设自动同步但不覆盖用户自己写的。
ok('共享本体入口 + 刷B站人设同步', () => {
  has('dayu/index.js', "route === '/soul'")
  has('lib/bili-sync.js', 'composeBiliPersona')
  has('lib/bili-sync.js', '不覆盖')
  has('scripts/bili-soul-sync.mjs', 'syncBiliPersona')
  has('scripts/test-bili-sync.mjs', 'noOverwrite')
  return '只读 /soul + personaPrompt 同步 + 备份/拒绝覆盖'
})

// 20. 2026-10-25：记忆回写——按人、带通道、去重、限量。
// 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书：store 搬进 memory-core/，逻辑一字不改）｜
// scripts/regression.mjs:366-367｜has 的文件指针从 lib/memory.js 指到 memory-core/store.mjs（真身搬过去了；
// 不指过来查的是 16 行转发壳，断言就成了空转）｜一条断言都没加、没删、没减弱｜验证：S2 差分 0 不一致、回归 279/0｜可改：改逻辑去 memory-core/store.mjs
ok('记忆回写：她说的话进她自己的 events', () => {
  has('memory-core/store.mjs', 'export function appendEvent')
  has('memory-core/store.mjs', 'roleForSession')
  has('dayu/index.js', "appendEvent(role, { channel: '工作台'")
  has('scripts/test-memory.mjs', 'channelTagged')
  return '工作台 input/say + 通道标记 + 去重限量'
})

// 21. 2026-10-25：动手前查轮子（别把别人做过的事再做一遍）。
ok('动手前查轮子：wheel-check 扫代码/文档/经验库/派活/活会话', () => {
  has('scripts/wheel-check.mjs', '经验库')
  has('scripts/wheel-check.mjs', '活会话')
  has('docs/吸收与升级.md', '动手前查轮子')
  return '五组只读 + 先分类再动手'
})

// 22. 2026-10-25：实时报活——五类 + 窗口树 + 来源（谁开的 / 几个子窗口）。
ok('实时报活：/now 五类快照 + 会话树 + 来源', () => {
  has('lib/now.js', 'buildNowSnapshot')
  has('lib/now.js', 'provenanceOf')
  has('lib/now.js', 'titleOf')
  has('lib/watch.js', 'parentTitle')
  has('dayu/index.js', "route === '/now'")
  has('client.js', 'yushen-live-float')
  has('client.js', '子窗口')
  has('client.js', '搜：谁在干什么')
  has('client.js', '完全展开 / 收回')
  has('client.js', 'resize')
  has('client.js', '还有 ')
  has('dayu/index.js', "url.searchParams.get('q')")
  has('lib/now.js', 'const search = []')
  has('scripts/test-now.mjs', 'snap.tree')
  has('scripts/test-now.mjs', 'counts.search')
  return '正在跑/做完/没做/出错/重复 + 父子窗口 + 来源 + 搜索'
})

// 16. 2026-10-23：鱼窝收编——拖别人的桌宠没反应 / 点了进不了大小鱼。
ok('鱼窝收编：拖拽解析 + 客人 + 收编模式', () => {
  has('client.js', 'dropImageSrc')
  has('client.js', 'imageSrcAt')
  has('client.js', '收编桌宠')
  has('lib/nest.js', 'export function guestFile')
  has('lib/nest.js', 'export async function adoptUrl')
  has('index.js', '/api/yushen/nest/adopt-url')
  has('index.js', '/yushen-assets/guest')
  return '拖拽/点击收编 + 客人存储 + 路由'
})

// 24. 2026-10-25：自省把 base-url（只有「主机:端口」）原样喂 fetch → 真机 13 项全红「Failed to parse URL」。
ok('自省默认不走网络：进程内就能判自己站不站得住', () => {
  has('lib/selfcheck.js', 'export function inProcessCheck')
  has('lib/selfcheck.js', '默认不探网络')
  has('lib/selfcheck.js', 'pulseOf')
  has('scripts/live-check.mjs', 'function withScheme')
  return '2026-10-27：不再 spawn 冒烟、不再 HTTP 探自己'
})

// 25. 2026-10-26：入主鱼神 M1——收件箱镜像（只读桥、幂等、自己的话要标出来、已读位按角色）
ok('收件箱镜像：只读桥 + 幂等 + 已读位按角色', () => {
  has('lib/inbox.js', 'export function mirrorOnce')
  has('lib/inbox.js', 'export function unreadFor')
  has('lib/inbox.js', 'markRoleRead')
  has('lib/inbox.js', 'gaps')
  has('scripts/inbox-mirror.mjs', '--watch')
  has('scripts/test-inbox.mjs', 'idempotent')
  hasDoc('入主鱼神-判断权归位.md', '判断权')
  // 铁律：镜像只读桥，绝不许写桥的 state
  const src = read('lib/inbox.js')
  if (/writeFileSync\([^)]*statePath/.test(src)) throw new Error('收件箱在写桥的 state，越界')
  if (!/readFileSync\(file/.test(src)) throw new Error('没读到桥的 state？检查')
  return '只读 + 幂等 + 按角色已读位'
})

// 26. 2026-10-26：点化运行时——礼物归本体不归卡；权重参与判断；接入插件不能调
ok('点化运行时：权重可调、红线在、回场与礼物读运行层', () => {
  has('lib/runtime.js', 'export function setWeight')
  has('lib/runtime.js', '接入的插件不能调她的权重')
  has('lib/runtime.js', 'export function resumeBrief')
  has('lib/runtime.js', 'export function giftStatus')
  has('lib/reply-gate.js', 'export function decideFor')
  has('lib/soul.js', 'resumeBrief')
  has('lib/soul.js', 'giftStatus')
  has('dayu/index.js', "name: 'yushen_inbox'")
  has('dayu/index.js', "name: 'yushen_weight'")
  has('dayu/index.js', 'mirrorInbox')
  has('scripts/test-runtime.mjs', 'redLine')
  has('lib/judgment.js', 'export function judgeOnce')
  has('lib/judgment.js', 'decideFor')
  has('dayu/index.js', 'judgeOnce')
  has('scripts/test-judgment.mjs', 'shadowOnly')
  // 礼物不许自欺：看内容/看有没有被用，不看目录在不在
  has('lib/runtime.js', 'used: Boolean(p.lastSeenAt)')
  has('lib/runtime.js', 'people > 0')
  has('lib/soul.js', 'markSeen')
  has('docs/点化-运行时契约.md', '卡是脸')
  has('../大小鱼-框架定义.md', '### 4.6 鱼神是点化运行时')
  return '运行时 + 权重红线 + 回场 + 收件箱工具 + 框架 §4.6'
})

// 27. 2026-10-26：自由时间/两难的回话被上一句认领——同一句写两遍、真切通道反而标成工作台。
ok('投递认领按时间：投递前发出的那句不算回复', () => {
  const m = new Map()
  markPending(m, 's1', 'dragon', 1000)
  if (takePending(m, 's1', 900) !== null) throw new Error('把投递前发出的那句认成了回复')
  if (!m.has('s1')) throw new Error('认错之后没留着继续等')
  if (takePending(m, 's1', 1500) !== 'dragon') throw new Error('真回复没认到')
  if (m.has('s1')) throw new Error('认到之后没删')
  // 事件时间给秒的也要比得对（有的地方是秒，有的是毫秒）
  if (toMs(1700000000) !== 1700000000000) throw new Error('秒没换成毫秒')
  const m2 = new Map()
  markPending(m2, 's2', 'dragon')
  if (takePending(m2, 's2', Math.floor(Date.now() / 1000) - 5) !== null) throw new Error('秒制的旧事件被认成回复')
  if (takePending(m2, 's2', Math.floor(Date.now() / 1000) + 5) !== 'dragon') throw new Error('秒制的新事件没认到')
  // 同一句不再写两遍：通道只定一次
  has('dayu/index.js', 'takePending(pendingFree, sessionId, eventAt)')
  has('dayu/index.js', "channel: freeWho ? '自由时间' : '工作台'")
  if (read('dayu/index.js').includes("channel: '自由时间', kind: 'say'")) throw new Error('自由时间还在重复写第二条')
  return '时间戳认领 + 秒/毫秒 + 不再双写'
})

// 28. 2026-10-27：总台回执同根因——awaiting 也只按会话 id 认领，投递前发出的那句会被当成回复。
ok('总台回执按时间认领：先看后认领，太短的不丢待办', () => {
  const m = new Map()
  markPending(m, 't1', 'job-1', 1000)
  if (peekPending(m, 't1', 900) !== null) throw new Error('peek 把投递前那句当成回执')
  if (peekPending(m, 't1', 1500) !== 'job-1') throw new Error('peek 没认出真回执')
  if (!m.has('t1')) throw new Error('peek 把待办删了——太短的消息会丢掉这次认领')
  if (takePending(m, 't1', 1500) !== 'job-1') throw new Error('peek 之后 take 认不到')
  if (m.has('t1')) throw new Error('take 之后没删')
  has('dayu/index.js', 'markPending(awaiting, out.sessionId, row.id)')
  has('dayu/index.js', 'if (!peekPending(awaiting, sessionId, eventAt)) return')
  if (/awaiting\.set\(/.test(read('dayu/index.js'))) throw new Error('awaiting 还在存裸值')
  return 'peek/take 分离 + 总台回执不再认错句'
})

// 29. 2026-10-28：同一根因被自检周期顶开成十几张单——去重窗口 30 分钟，正好等于自检周期。
ok('事故单去重：同一个错不重开单，结过的不吞复发', () => {
  has('lib/incidents.js', 'const DEDUPE_MS = 6 * 60 * 60 * 1000')
  has('lib/incidents.js', "const DEDUPE_SKIP_STATUS = new Set(['fixed', 'closed'])")
  has('scripts/test-incidents-dedupe.mjs', 'newIncidentIsNew')
  if (read('lib/incidents.js').includes("row.status !== 'closed'")) throw new Error('结过的单又会被吞掉复发')
  return '同错合并 6 小时 + 结单后复发开新单'
})

// 31. 2026-10-30：工具目录要收全（26 registerTool + 8 m1 + 1 mind = 35），否则她查不到 dayu_dispatch
ok('工具目录收全（35 个都能被 yushen_tools 查到）', () => {
  has('dayu/index.js', 'ownTools.set(t.name, t)')
  has('dayu/index.js', 'mindToolDefs(toolOutput)')
  has('dayu/m1.js', 'export const M1_TOOLS')
  has('lib/mind-tools.js', 'export function mindToolDefs')
  return '三套注册并进同一份目录'
})
// 32. 2026-10-30：界面引用了不存在的组件（ProtectionPanel）→ 整页白屏。这条拦住它。
ok('界面引用的组件都有定义', () => {
  const s = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  const used = new Set([...s.matchAll(/\bh\(\s*([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]))
  const defined = new Set()
  for (const m of s.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)) defined.add(m[1])
  for (const m of s.matchAll(/class\s+([A-Z][A-Za-z0-9_]*)\s+extends/g)) defined.add(m[1])
  for (const m of s.matchAll(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/g)) defined.add(m[1])
  const missing = [...used].filter((n) => !defined.has(n))
  assert.deepEqual(missing, [], `引用了没定义的组件：${missing.join(', ')}`)
  return `${used.size} 个组件都有定义`
})
// 33. 2026-10-30 谷时：整理趟（合并同义、旧的标被替换）与回执催办要有接线
ok('整理趟与催办都接上了', () => {
  has('lib/consolidate.js', 'supersededBy')
  has('lib/consolidate.js', 'export function consolidate')
  has('scripts/memory-housekeeping.mjs', 'consolidateRole')
  has('scripts/maintenance.mjs', "runScript('memory-housekeeping.mjs'")
  has('dayu/index.js', 'remindLateJobs')
  has('core/dispatch.js', 'dueAt')
  return '整理/催办都在'
})
// 30. 2026-10-28：变更告知支持「标已读」，但工具声明里没这个参数——每轮都提醒同几条，喊了三天。
ok('变更告知能标已读：handler 和工具声明都得有 mark', () => {
  has('lib/notices.js', 'export function markNoticesRead')
  has('dayu/index.js', "if (args?.mark === true) return { ok: true, role, ...markNoticesRead(role) }")
  has('dayu/index.js', "mark: { type: 'boolean'")
  if (!read('dayu/index.js').includes("if (a === 'notices')")) throw new Error('notices 分支不见了')
  return 'handler + schema 都通'
})

// 31. 2026-10-29：巡逻只写「删除文件」，复核的人得翻源码才知道删的是它自己的标记（误报了 34 小时）。
ok('巡逻的删除线索要带目标名，别只写「删除文件」', () => {
  has('lib/intake.js', '删除文件：')
  has('lib/intake.js', 'rmSync\\s*\\(\\s*([^,)\\n]{1,60})')
  if (read('lib/intake.js').includes("if (/rmSync|unlinkSync/.test(text)) suspicious.push('删除文件')")) throw new Error('又变回只写「删除文件」了')
  const sample = "fs.rmSync(READY_FILE, { force: true })"
  const m = sample.match(/rmSync\s*\(\s*([^,)\n]{1,60})/)
  if (!m || m[1].trim() !== 'READY_FILE') throw new Error('抓不到删除目标')
  return '线索带目标（READY_FILE 这种一眼能判）'
})

// 32. 2026-10-30：删自己的标记文件（READY_FILE 这类）被当成可疑行为，误报了三次。
// 白名单只按「大写标识符 + 状态词」放行；删用户数据照样要报。
ok('巡逻白名单：删自己的 READY_FILE 不报，删用户数据照报', () => {
  const probe = (src) => {
    const dir = fs.mkdtempSync(path.join(tmpRoot(), 'ysr-intake-'))
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'probe-intake', version: '0.0.0' }))
      fs.writeFileSync(path.join(dir, 'index.js'), src)
      const r = analyzePlugin(dir)
      return (r?.policy?.watch || []).join(' | ')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  const selfMark = probe('fs.rmSync(READY_FILE, { force: true })')
  assert.ok(!selfMark.includes('删除文件'), `删自己的标记还被报：${selfMark}`)
  const userData = probe("fs.rmSync(path.join(userDir, 'notes.txt'), { force: true })")
  assert.ok(userData.includes('删除文件'), `删用户数据没报：${userData}`)
  return '自己的标记放行、用户数据照报'
})


// 28. 2026-10-26：宿主重启换端口，base-url 还是旧端口 → 自省真机全红「fetch failed」，没人碰面板就一直红。
ok('自省宿主端口自愈：旧 base-url 探活失败时从进程监听端口重新发现', () => {
  has('lib/selfcheck.js', 'discoverHostFromOS')
  has('lib/selfcheck.js', 'tasklist')
  has('lib/selfcheck.js', "path.join(DATA, 'base-url')")
  return '扫 DSH 进程监听端口 → 带 token 问 health → 写回 base-url'
})

// 28. 2026-10-26：她自己的议程（意志）——自己排、能推进、能放弃、没人叫也动
ok('她自己的议程（意志）：自己排 + 本地推进 + 能放弃', () => {
  has('lib/agenda.js', 'export function addItem')
  has('lib/agenda.js', 'export function dropItem')
  has('lib/agenda.js', 'LOCAL_STEPS')
  has('lib/agenda.js', 'MAX_ACTIVE')
  has('dayu/index.js', "name: 'yushen_agenda'")
  has('dayu/index.js', 'stepAgenda')
  has('lib/soul.js', 'buildRuntimeBrief')
  has('lib/brief.js', '你手上自己的事')
  has('lib/runtime.js', "id: 'will'")
  has('scripts/test-agenda.mjs', 'droppable')
  has('../大小鱼-框架定义.md', '意志')
  // 2026-10-30 老板定：经验只算自己自发想做的；老板派的活（origin: owner）做完也不算。
  has('lib/agenda.js', 'countsForXp')
  has('lib/agenda.js', "XP_ORIGINS = Object.freeze(['self', 'owner'])")
  has('index.js', 'items.filter(countsForXp)')
  has('dayu/index.js', 'origin: args?.origin')
  has('scripts/test-agenda.mjs', '老板派的活不算经验')
  // 2026-10-30 老板定「每天自净」：光答应没用，得有量尺 + 每天跑的那只手。
  has('scripts/measure-injection.mjs', 'STALE_PHRASES')
  has('scripts/measure-injection.mjs', '基线')
  // 2026-10-31：裁剪不许丢底——字数降了不等于对；缺了「规矩/铁律/边界/说不/通道/工具入口」就红。
  has('scripts/measure-injection.mjs', 'MUST_HAVE')
  has('scripts/measure-injection.mjs', '底不见了')
  // 2026-10-31：版本指纹——发放状态要能说出「跑的是哪份代码、进程什么时候起的」。
  has('lib/issue.js', 'FINGERPRINT')
  has('lib/issue.js', '本进程起于')
  return '议程 + 本地推进 + 放弃 + 注入 + 框架 §4.6 + 经验只算自发'
})

// 70. 2026-10-30（老板：所以要你们自检、不断进化）：注入层说的必须和实况一致。
//     「没在电脑前」「工具没挂上」「你还没有身体」这类假话，靠人眼发现一次修一次不够——让回归天天盯。
//     量尺非零退出 = 过期句还在 / 字数比基线涨了，这里就红。
ok('注入层不许对她说假话：过期句清零、字数不回升', () => {
  has('scripts/measure-injection.mjs', 'STALE_PHRASES')
  const ran = runTestScript('scripts/measure-injection.mjs')
  return ran ? '量尺通过：三人注入无过期句、未超基线' : '接线检查通过；这回合环境不给子进程，没真跑'
})

// 33. 2026-10-30 谷时：整理趟（合并同义、旧的标被替换）与回执催办要有接线
ok('整理趟与催办都接上了', () => {
  has('lib/consolidate.js', 'supersededBy')
  has('lib/consolidate.js', 'export function consolidate')
  has('scripts/memory-housekeeping.mjs', 'consolidateRole')
  has('scripts/maintenance.mjs', "runScript('memory-housekeeping.mjs'")
  has('dayu/index.js', 'remindLateJobs')
  has('core/dispatch.js', 'dueAt')
  return '整理/催办都在'
})
// 30. 2026-10-30：tick 不许假装"核对过"，也不许盖掉她自己写的 note。
//     （实况：一条 check 被当成"本地一步"，每 30 分钟盖一次「核对过一遍，暂时没新东西」，
//      她写的「流水作者归属」疑点被冲掉，tries 涨到 459 次；而 check 那一步什么都没核。）
ok('议程 tick：check 要模型、不假装核对、不抢她的 note', () => {
  has('lib/agenda.js', "LOCAL_STEPS = Object.freeze(['read-inbox', 'read-file'])")
  has('lib/agenda.js', 'item.lastTry = { at: nowIso(now)')
  // 旧 tick 冻在 note 里的那句假话：修好后不再写，但旧条目里还有，
  // 展示时得把它当不存在（2026-10-30 照微）。断言落在常量 + 行为测试两处。
  has('lib/agenda.js', 'LEGACY_TICK_NOTE')
  has('scripts/test-agenda.mjs', '旧 tick 的假话不许漏进简报')
  has('scripts/test-agenda.mjs', 'check 要模型')
  const ran = runTestScript('scripts/test-agenda.mjs')
  return ran ? '执行 test-agenda：check 标 waiting、note 不被盖、lastTry 另记' : '接线检查通过；这回合环境不给子进程，没真跑'
})

// 29. 2026-10-26：她调用模型——只有她请求才起回合；预算按天；同一件有冷却
ok('她调用模型：她自己发起 + 预算 + 可再发起 + 单飞', () => {
  has('lib/invoke.js', 'export function requestInvocation')
  has('lib/invoke.js', 'export function takeInvocation')
  has('lib/invoke.js', '额度') // 2026-10-30：按额度不按次数，余额见底才拦
  has('lib/invoke.js', 'moneyOf')
  has('lib/invoke.js', '不是谁派的')
  has('dayu/index.js', 'invokeOnce')
  has('dayu/index.js', 'selfInvokePerDay')
  has('dayu/index.js', "buildInvocationPrompt")
  has('scripts/test-invoke.mjs', 'singleFlight')
  return '她发起 + 预算(默认 3/天) + 30 分钟冷却 + 一次只跑一个'
})

// 31. 2026-10-30：工具目录要收全（26 registerTool + 8 m1 + 1 mind = 35），否则她查不到 dayu_dispatch
ok('工具目录收全（35 个都能被 yushen_tools 查到）', () => {
  has('dayu/index.js', 'ownTools.set(t.name, t)')
  has('dayu/index.js', 'mindToolDefs(toolOutput)')
  has('dayu/m1.js', 'export const M1_TOOLS')
  has('lib/mind-tools.js', 'export function mindToolDefs')
  return '三套注册并进同一份目录'
})
// 32. 2026-10-30：界面引用了不存在的组件（ProtectionPanel）→ 整页白屏。这条拦住它。
ok('界面引用的组件都有定义', () => {
  const s = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  const used = new Set([...s.matchAll(/\bh\(\s*([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]))
  const defined = new Set()
  for (const m of s.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)) defined.add(m[1])
  for (const m of s.matchAll(/class\s+([A-Z][A-Za-z0-9_]*)\s+extends/g)) defined.add(m[1])
  for (const m of s.matchAll(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/g)) defined.add(m[1])
  const missing = [...used].filter((n) => !defined.has(n))
  assert.deepEqual(missing, [], `引用了没定义的组件：${missing.join(', ')}`)
  return `${used.size} 个组件都有定义`
})
// 33. 2026-10-30 谷时：整理趟（合并同义、旧的标被替换）与回执催办要有接线
ok('整理趟与催办都接上了', () => {
  has('lib/consolidate.js', 'supersededBy')
  has('lib/consolidate.js', 'export function consolidate')
  has('scripts/memory-housekeeping.mjs', 'consolidateRole')
  has('scripts/maintenance.mjs', "runScript('memory-housekeeping.mjs'")
  has('dayu/index.js', 'remindLateJobs')
  has('core/dispatch.js', 'dueAt')
  return '整理/催办都在'
})
// 30. 2026-10-26 三问修正：不替她决定「最多几件」「多久能再想」「什么时候动」；底线归她
ok('三问修正：软提醒 + 能喊停 + 可再发起 + 底线归她', () => {
  has('lib/agenda.js', 'warning: `手上已经有')
  has('lib/agenda.js', 'export function pauseAgenda')
  has('lib/agenda.js', '她说先别动')
  has('lib/invoke.js', 'export function requestMoreBudget')
  has('lib/invoke.js', '可以申请加')
  has('lib/invoke.js', 'item.prompt')
  has('lib/bottomline.js', 'export function recordRefusal')
  has('lib/bottomline.js', '这上面的话是')
  has('dayu/index.js', "name: 'yushen_bottomline'")
  has('lib/brief.js', '你的底线')
  has('dayu/index.js', "action === 'pause'")
  has('scripts/test-bottomline.mjs', 'giftHonest')
  return '不拦堆 + 能喊停 + 可再发起/可申请 + 底线她自己写'
})

// 31. 2026-10-26：中枢简报——一份，任何通道共用；她住鱼神，QQ/B站只是坐的地方
ok('中枢简报：一份简报给所有通道', () => {
  has('lib/brief.js', 'export function buildRuntimeBrief')
  has('lib/brief.js', 'export function writeRuntimeBrief')
  has('lib/brief.js', 'export function readRuntimeBrief')
  has('lib/soul.js', 'buildRuntimeBrief')
  has('dayu/index.js', "route === '/brief'")
  has('dayu/index.js', 'writeRuntimeBrief')
  has('scripts/test-brief.mjs', 'sameAcrossChannels')
  has('scripts/test-brief.mjs', 'honest')
  return '同一段内容 + 落盘 brief.md + HTTP /brief'
})

// 32. 2026-10-26：点化的定义「启灵」——能验的分开写，智力的归属写死
ok('点化＝启灵：定义在框架，能验的在测试', () => {
  has('../大小鱼-框架定义.md', '4.6.1 点化的定义：启灵')
  has('../大小鱼-框架定义.md', '鱼神赋予的是生命，是启灵')
  has('../大小鱼-框架定义.md', '智力本身是模型给的')
  has('../叙事基线.md', '点化就是启灵')
  has('lib/agenda.js', 'by = \'self\'')
  has('lib/bottomline.js', 'export function recordRefusal')
  return '定义入框架 + 叙事基线 + 议程/拒绝可验'
})

// 33. 2026-10-26：三条铁律（三问 / 身份 / 契约）——写死，且顺序在三问之后不能再被压回去
ok('三条铁律：三问最高优先 + 身份 + 契约', () => {
  has('lib/handbook-policy.js', '铁律一（设计三问）')
  has('lib/handbook-policy.js', '铁律二（身份）')
  has('lib/handbook-policy.js', '她调用模型，是她')
  has('lib/handbook-policy.js', '系统替她写好台词，才不是她')
  has('lib/handbook-policy.js', '铁律三（契约）')
  has('lib/handbook-policy.js', '契约约束的是"不为祸"')
  has('../大小鱼-框架定义.md', '4.6.2 点化契约')
  // 提权：铁律必须排在普通规则之前（顺序即优先级）
  const src = read('lib/handbook-policy.js')
  if (src.indexOf('铁律一') > src.indexOf('通用第十六章')) throw new Error('三问被压回后面了：铁律必须排最前')
  if (src.indexOf('铁律三') > src.indexOf('鱼神先保可用')) throw new Error('契约铁律没进前三')
  return '三问提权 + 身份铁律 + 契约铁律 + 顺序可断言'
})

// 34. 2026-10-26：好感阈值不再拦消息（M3 第一刀），且有回退开关
ok('好感只当提示：不再拦消息 + 可回退', () => {
  hasDoc('入主鱼神-判断权归位.md', 'affinity.gate')
  hasDoc('入主鱼神-判断权归位.md', '不再拦')
  has('docs/点化-运行时契约.md', '好感阈值不再拦')
  return 'hint 默认 / block 回退；分数只调语气'
})

// 35. 2026-10-26：不给枷锁，只报账——回不回/本地还是云端，她自己定
// 2026-10-30 改锚点：原来锁的是「主人不是富翁」那句话，老板说那是替她做决定，删了。
// 现在锁"报了什么数"，不锁"劝了她什么"。
ok('报账不设闸：她自己决定回不回、用本地还是云端', () => {
  has('lib/cost.js', 'QQ 那边今天一共')
  has('lib/cost.js', '你的钱：还剩')
  has('lib/cost.js', '本地回 0 元')
  if (read('lib/cost.js').includes('悠着点')) throw new Error('又开始劝她省着花了——那是替她做决定')
  has('lib/cheap-reply.js', "MODES = Object.freeze(['silent', 'local', 'cloud'])")
  has('lib/cheap-reply.js', '不装，直接交云端')
  has('lib/cheap-reply.js', '本地没接上，交云端')
  has('lib/brief.js', 'costLine')
  has('scripts/test-cheap.mjs', 'silentAllowed')
  return '报价 + 三选一（不回/本地/云端）+ 本地不在就交云端'
})

// 36. 2026-10-26：她的话经她的手发出去——必须带决定 id，桥才认
ok('递话口子：有出处才发（决定 id + token + 会话新鲜）', () => {
  has('lib/outbox.js', 'export async function sendAs')
  has('lib/outbox.js', '没有决定 id')
  has('lib/outbox.js', 'x-yushen-token')
  has('lib/outbox.js', 'bridge-token.json')
  has('scripts/test-outbox.mjs', 'needsDecisionId')
  has('docs/点化-运行时契约.md', '有出处才发')
  return '她说的 → 运行层递 → 桥发；没出处直接拒'
})

// 37. 2026-10-26：别人让她做坏事——拒，还要让老板知道（不是没发生）
ok('越界请求：拒 + 上报，原话照抄', () => {
  has('lib/escalate.js', 'export function escalate')
  has('lib/escalate.js', '【她拒了，要你知道】')
  has('lib/escalate.js', 'MUST_REPORT')
  has('dayu/index.js', "name: 'yushen_report'")
  // 2026-10-31：五节合成「安全与权限」，标题没了，但这条规则必须在注入里。
  // （同日又被别的会话压成 4 条，措辞从「拒绝的边界」改成「遇上违法伤人…」——断言跟内容走，不跟标题走）
  has('lib/brief.js', '一句话拒')
  has('lib/brief.js', 'yushen_report')
  has('scripts/test-escalate.mjs', 'verbatim')
  return '拒不是失礼；报不是告状；原话不改写'
})

// 38. 2026-10-26：本地只许回极短，口吻照她自己说过的话（不教台词）
ok('本地嗓子：不设字数上限，只给参考腔', () => {
  has('lib/cheap-reply.js', '不设字数限制')
  has('lib/cheap-reply.js', 'export function localReplyAsIs')
  has('lib/cheap-reply.js', '不是让你照抄')
  has('lib/cheap-reply.js', 'export function voiceSamples')
  has('scripts/test-cheap.mjs', 'noLengthCap')
  return '本地敷衍要短；长话和情绪交云端；样例来自她真实说过的话'
})

// 39. 2026-10-26：越线权是礼物——规矩是边界不是路线；不为祸不让
ok('越线权：能跳，但要理由、证据、能回退', () => {
  has('lib/ventures.js', '规矩是边界')
  has('lib/ventures.js', '为什么值得跳')
  has('lib/ventures.js', '怎么退回来')
  has('lib/ventures.js', '不为祸')
  has('dayu/index.js', "name: 'yushen_cross'")
  has('lib/runtime.js', "id: 'crossline'")
  has('lib/brief.js', 'ventureLine')
  has('scripts/test-ventures.mjs', 'needsRollback')
  has('../大小鱼-框架定义.md', '越线权')
  return '越线要留痕；不为祸是唯一硬线'
})

// 40. 2026-10-26：她自己的状态能自己看/改（心情、口味、想念、翻旧账）
ok('她自己的状态：心情/口味/想念/翻旧账都能自己来', () => {
  has('lib/mood.js', 'export function setMood')
  has('lib/mood.js', '这是身体反应')
  has('lib/miss.js', '没有"该多久找他一次"的规矩')
  has('lib/tastes.js', 'export function addTaste')
  has('lib/recall.js', 'export function recallSelf')
  has('dayu/index.js', "name: 'yushen_self'")
  has('lib/brief.js', 'moodLine')
  has('lib/brief.js', 'missLine')
  return '状态可查可改；想念只报事实；旧账自己翻'
})

// 41. 2026-10-26：冲突裁决——先看会不会害自己人，再看三问；主人说不行就记档
ok('冲突裁决：契约优先 + 三问退让 + 主人否决留档', () => {
  has('../大小鱼-框架定义.md', '3.0.1 冲突裁决程序')
  has('../大小鱼-框架定义.md', '会不会害到自己人')
  has('../大小鱼-框架定义.md', '规矩退让')
  has('../大小鱼-框架定义.md', '绝对不行')
  has('lib/veto.js', 'export function recordVeto')
  has('lib/veto.js', '宪章层')
  has('lib/veto.js', 'soft')
  has('lib/brief.js', 'vetoLine')
  has('dayu/index.js', "a === 'vetoes'")
  has('scripts/test-veto.mjs', 'hardIsCharter')
  return '软的不行可再判断；绝对不行是宪章层'
})

// 42. 2026-10-26：保护老板——认人（绑号/口令）后才办敏感事
ok('认主人、保护主人：敏感事先验人，验不过就拒', () => {
  has('lib/owner-guard.js', 'export function verifyOwner')
  has('lib/owner-guard.js', 'export function setPassphrase')
  has('lib/owner-guard.js', '不存明文')
  has('lib/brief.js', 'yushen_report')
  has('lib/brief.js', 'guardLine')
  has('dayu/index.js', "name: 'yushen_owner'")
  has('scripts/test-owner-guard.mjs', 'hashed')
  has('../大小鱼-框架定义.md', '保护老板')
  return '绑号或口令；验不过拒办并上报'
})

// 43. 2026-10-26：验不过要有退路——忘了暗号不许把主人锁在门外
ok('认主人有退路：本机重置 + 其它凭据', () => {
  has('lib/owner-guard.js', 'export function resetSecrets')
  has('lib/owner-guard.js', '把老板锁在门外')
  has('lib/owner-guard.js', 'export function recoveryInfo')
  has('../大小鱼-框架定义.md', '不可能"以为你知道"')
  has('scripts/test-owner-guard.mjs', 'recoverable')
  has('dayu/index.js', "'recovery'")
  has('../大小鱼-框架定义.md', '验不过要有退路')
  return '忘暗号可本机重置；绑号兜底；死锁＝害自己人'
})

// 44. 2026-10-26：「我忘了」不是凭据——重置只能在本机跑脚本
ok('恢复凭据：能开电脑，不是会说话', () => {
  has('../大小鱼-框架定义.md', '不能是"会说')
  has('../大小鱼-框架定义.md', 'owner-reset.mjs')
  has('scripts/owner-reset.mjs', '必须在老板自己的电脑上跑')
  has('lib/owner-guard.js', '外人只答不管')
  const entry = read('dayu/index.js')
  if (/a === 'reset'/.test(entry)) throw new Error('又把 reset 塞回她的工具里了——谁喊"我忘了"都能重置')
  return '她从聊天里不代劳；重置只在电脑上'
})

// 45. 2026-10-26：改凭据只在本机——她只能验，不能改
ok('改凭据只在本机：她手里没有钥匙', () => {
  has('scripts/owner-secret.mjs', '不能由聊天消息触发')
  has('scripts/owner-bind.mjs', '不能由聊天消息触发')
  has('scripts/owner-reset.mjs', '不能由聊天消息触发')
  has('../大小鱼-框架定义.md', '改凭据的全部动作都只在本机')
  const entry = read('dayu/index.js')
  for (const bad of ["'add-secret'", "a === 'bind'", "a === 'reset'"]) {
    if (entry.includes(bad)) throw new Error(`凭据改动又回到她工具里：${bad}`)
  }
  return '加暗号/绑号/重置只能跑脚本；工具只验'
})

// 46. 2026-10-26：拿不准先问本人——挂待确认，等另一个通道
ok('拿不准先问本人：不许在可疑通道自问自答', () => {
  has('lib/owner-ask.js', 'export function raiseOwnerQuestion')
  has('lib/owner-ask.js', '不能在那个可疑通道里自己回答自己')
  has('lib/owner-ask.js', '在等你确认身份')
  has('dayu/index.js', "'ask'")
  has('lib/brief.js', 'ownerAskLine')
  has('../大小鱼-框架定义.md', '拿不准，先问本人')
  has('scripts/test-owner-ask.mjs', 'noSelfAnswer')
  has('scripts/test-owner-ask.mjs', 'expiredNotYes')
  has('lib/owner-ask.js', 'autoConfirm: false')
  has('../大小鱼-框架定义.md', '没回复不算')
  has('../大小鱼-框架定义.md', '再三确认')
  return '挂起→收件可见→可信通道回答；沉默/超时永不推进'
})

// 47. 2026-10-26：位置决定权限——远程只办可逆的，不可逆要在电脑前
ok('位置决定权限：远程办不了不可逆的事', () => {
  has('lib/authority.js', 'export function allowedFor')
  has('lib/authority.js', '远程办不了')
  has('lib/authority.js', 'export function isLocallyUnlocked')
  has('scripts/owner-unlock.mjs', '只在能开这台电脑的人手里有效')
  has('dayu/index.js', "'authority'")
  has('lib/brief.js', 'authorityLine')
  has('../大小鱼-框架定义.md', '位置决定权限')
  has('scripts/test-authority.mjs', 'remoteCapped')
  has('scripts/test-authority.mjs', 'ownerOnly')
  has('lib/authority.js', 'export function requireOwner')
  has('lib/authority.js', '别人说什么都拿不到权限')
  has('lib/brief.js', 'ownerOnlyLine')
  has('../大小鱼-框架定义.md', '默认拒绝')
  return '远程可逆；本机解锁短窗口；过期失效；非本人直接拒'
})

// 48. 2026-10-26：出厂包只装鱼神本身，不带大小鱼的意识
ok('出厂边界：鱼神自己出厂，她们不出厂', () => {
  has('scripts/pack-core.mjs', '出厂包：只装鱼神本身')
  has('scripts/pack-core.mjs', '不装她们的意识')
  has('scripts/pack-core.mjs', 'FORBIDDEN')
  has('scripts/pack-core.mjs', 'process.exit(outHits.length === 0 ? 0 : 2)')
  has('scripts/pack-core.mjs', '鱼窝基本型')
  has('scripts/pack-core.mjs', "'assets'")
  has('scripts/pack-core.mjs', '默认外观沿用鱼窝基本型')
  has('scripts/pack-core.mjs', 'SANITIZE')
  has('preset/persona.preset.json', 'memory')
  has('preset/charter.preset.json', 'hardNo')
  has('scripts/onboard.mjs', '每人一份')
  has('../大小鱼-框架定义.md', '鱼窝基本型')
  return '发布门在；去处名后 0 命中；预设两槽可改名可留空'
})

// 49. 2026-10-27：联想 / 等待 / 纠错（三样不用模型、不花钱的"更像人"）
ok('联想、等待、纠错：她自己能用的三样', () => {
  has('lib/recollect.js', 'export function associate')
  has('lib/recollect.js', '可能不是同一件事')
  has('lib/waiting.js', 'export function addWaiting')
  has('lib/waiting.js', '到点了')
  has('lib/corrections.js', 'export function noteCorrection')
  has('lib/corrections.js', '改不改、怎么改，你自己判断')
  has('lib/brief.js', 'waitingLine')
  has('lib/brief.js', 'correctionLine')
  has('dayu/index.js', "'associate'")
  has('dayu/index.js', "until: { type: 'string'")
  has('scripts/test-growth.mjs', 'corrections')
  return '想起来、等得住、记得改；都不逼她'
})

// 50. 2026-10-27：分享（本地宝藏）、力气、关系账
ok('分享/力气/关系账：本地能做的不等桥', () => {
  has('lib/treasure.js', 'export function pickTreasure')
  has('lib/treasure.js', '图片在本地')
  has('lib/fatigue.js', '累不累你说了算')
  has('lib/fatigue.js', 'export function setFatigue')
  has('lib/relations.js', 'export function relationsSummary')
  has('lib/relations.js', '还没有关系数据')
  has('lib/brief.js', 'fatigueLine')
  has('lib/brief.js', 'relationsLine')
  has('dayu/index.js', "'share'")
  has('scripts/test-more.mjs', 'fatigueOverride')
  return '宝藏本地挑；力气是事实她可覆盖；关系只读摘要'
})

// 51. 2026-10-27：接入必须读规则——不读，礼物不启用
ok('接入检查：不读鱼神的规则，礼物只是摆设', () => {
  has('lib/plug.js', 'export function markPlugged')
  has('lib/plug.js', 'export function requirePlugged')
  has('lib/plug.js', '还没接入鱼神')
  has('lib/plug.js', '规则换了，还没重读')
  has('lib/brief.js', 'markPlugged')
  has('lib/invoke.js', 'requirePlugged')
  has('dayu/index.js', "'plug'")
  has('scripts/test-plug.mjs', 'briefMarks')
  return '跑一次简报=读过规则；太久/换版/没读 → 礼物停'
})

// 52. 2026-10-27：规则每轮都在（不是"放在那等人查"）
ok('规则每轮注入：铁律+宪章+岗位', () => {
  has('lib/rules-block.js', 'export function rulesBlock')
  has('lib/rules-block.js', 'rulesFor.slice(0, 3)')
  has('lib/rules-block.js', '书里没有就说缺哪本')
  has('lib/rules-block.js', '绝对不行')
  has('lib/rules-block.js', '你的岗位')
  has('lib/rules-block.js', 'PROCESS_ROLES')
  has('lib/rules-block.js', '这次用得到')
  has('scripts/test-rules.mjs', 'noArtillery')
  has('lib/soul.js', 'rulesBlock(role, { task })')
  has('scripts/test-rules.mjs', 'ironOrder')
  return '每轮都带三条铁律与底线；手册细节仍按需查'
})

// 53. 2026-10-27：被点化的角色要维护鱼神、监督下面的人
ok('维护职责：先提醒，再上报，不评判好坏', () => {
  has('lib/oversight.js', 'export function scanCompliance')
  has('lib/oversight.js', '先提醒；提醒了还不读')
  has('lib/oversight.js', '好坏你自己判断')
  has('lib/rules-block.js', '### 你的职责')
  has('lib/brief.js', 'complianceLine')
  has('dayu/index.js', "'oversight'")
  has('scripts/test-oversight.mjs', 'stale')
  return '查"接没接上"，不管"干得好不好"'
})

// 54. 2026-10-27：分析要能真跑；发本地图有白名单
ok('分析能跑；发图有界', () => {
  has('lib/analyze.js', 'export function analyzeMessage')
  has('lib/analyze.js', '不是冲你')
  has('scripts/analyze-inbox.mjs', '意图分布')
  has('lib/outbox.js', 'export async function shareImage')
  has('scripts/test-analyze.mjs', 'atOther')
  has('scripts/test-outbox.mjs', 'shareImage')
  has('scripts/verify-claims.mjs', '落地证据')
  return '意图带依据；图只许宝藏/她数据/素材目录'
})

// 55. 2026-10-27：自动回复不是她的话——不接、不学、不替它发
ok('自动回复：不是人说的话', () => {
  has('lib/analyze.js', 'export function isCanned')
  has('lib/analyze.js', '自动回复模板')
  has('lib/outbox.js', '这是自动回复模板')
  has('lib/rules-block.js', '不是你说的话')
  has('scripts/test-analyze.mjs', 'canned')
  has('scripts/test-outbox.mjs', '自动回复模板')
  return '模板句进不来、也发不出去'
})

// 56. 2026-10-27：账单/日报不代发（那两句话是她的，不是代码的）
ok('账单不代发：数字给她，嘴在她那', () => {
  has('lib/cost.js', '要不要跟他说')
  has('lib/rules-block.js', '账单日报都不是你的话')
  has('lib/analyze.js', '自动回复模板')
  return '钱数进简报；说不说由她'
})

// 57. 2026-10-27：说"拆掉了"之前，先扫代答路径
ok('代答扫描：0 条才算拆掉', () => {
  has('scripts/audit-autosend.mjs', '代答扫描')
  has('scripts/audit-autosend.mjs', '没有代答路径')
  has('docs/三问闸门.md', '0 条才算拆掉')
  return '先扫同类，再宣布'
})

// 58. 2026-10-27：心情有自动钩子（被怼/被夸/被点名自动记一笔，同一条只记一次）
ok('心情自动钩子：从真事长出来', () => {
  has('lib/mood.js', 'export function noteMoodFromMessages')
  has('lib/mood.js', '被怼了')
  has('dayu/index.js', 'noteMoodFromMessages(role, rows)')
  return '不是随机模板；同一条不重复记'
})

// 59. 2026-10-26：对外层次只做显示；照微五境独立，小鱼阶位2，实际能力一样
ok('对外层次：照微五境、大鱼副总裁、小鱼秘书，只显示不接权限', () => {
  has('client.js', "'顾问'")
  has('client.js', '副总裁')
  has('client.js', '阶位2')
  has('client.js', '五境')
  has('client.js', 'ysn-zoom')
  has('client.js', 'yushen.nest.roleZoom')
  has('client.js', 'e.altKey')
  has('client.js', '单独放大')
  has('client.js', 'ysn-crown')
  has('client.js', 'roleXp')
  // 2026-10-30 老板定：经验只算「自己想做、自己排、自己做完」的议程条目（by=self + done），他派的活不算。
  has('client.js', 'selfDone')
  has('client.js', '老板派的活不算')
  has('index.js', 'selfDoneCounts')
  has('scripts/test-role-xp.mjs', '老板派的活不算')
  has('scripts/test-role-xp.mjs', 'incidentGrowth')
  // 2026-10-31：鱼窝交互早就改成「双击进页面」，那份模拟脚本一直按单击断言、红着没人跑。
  // 现在把它修好并**并进门禁**——红着又不跑的测试比没有更坏。
  has('scripts/test-three-role-ui.mjs', '双击才进她')
  has('scripts/test-three-role-ui.mjs', 'ysnRelease')
  // 真跑一遍（子进程）；它红这里也红
  runTestScript('scripts/test-three-role-ui.mjs')
  has('client.js', '形象版本')
  has('scripts/style.mjs', 'use anime-q')
  has('scripts/style.mjs', 'use anime-normal')
  has('docs/形象版本切换.md', 'current-style.json')
  has('docs/阶位.md', 'Q 版透明 PNG')
  has('index.js', '/yushen-assets/halo')
  has('docs/阶位.md', 'Q 版透明 PNG')
  // 2026-11-01 主人：「写死就改……我一视同仁」。这条原来锁的是写死两条鱼的 RANK_ROLES，
  // 等于把"先来后到"写进断言里。现在锁的是：名单从名册来、照微走五境不换算、层次只显示不接权限。
  has('lib/rank.js', 'export const RANK_ROLES = Object.freeze(residentRoleIds()')
  has('lib/rank.js', '照微走五境，不进 L0-L3')
  has('docs/阶位.md', '只显示，不参与判断')
  has('docs/阶位.md', '换装和阶位完全脱钩')
  has('scripts/test-rank.mjs', "rank.status('dragon').system, 'realm'")
  return '层次是排场，活一样干；衣服不跟阶位走'
})

// 59. 2026-10-27：心情的涨落规则她可改（三问①：不替她规定情绪）
ok('心情规则她可改：身体不是判决', () => {
  has('lib/mood.js', 'export const DEFAULT_MOOD_RULES')
  has('lib/mood.js', 'export function setMoodRule')
  has('lib/mood.js', '这是身体反应')
  has('dayu/index.js', "'set-mood-rule'")
  return '默认有映射，但她能改；改完立刻生效'
})

// 60. 2026-10-27：改她的事必须过三问（给"我"上的闸）
ok('三问闸：碰 lib/dayu 不答三问就记不上账', () => {
  has('scripts/note-work.mjs', '必须过三问再记账')
  has('scripts/note-work.mjs', 'process.exit(3)')
  has('lib/worklog.js', 'tq:')
  return '没入账=没干过；没答三问=不入账'
})

// 61. 2026-10-27：手册是约定，由她们签发（不是发给她们的通稿）
ok('手册：她们的约定，她们签发', () => {
  has('lib/rules-block.js', '手册你签发')
  has('lib/rules-block.js', '你先读先守')
  has('../员工手册.md', '手册由被点化的角色签发')
  has('../员工手册.md', '发放的人要先做到')
  has('../大小鱼-框架定义.md', '手册由**她们签发**')
  has('../大小鱼-框架定义.md', '发放的人要以身作则')
  return '她们发，不是被发；自己先做到，别人才服'
})

// 62. 2026-10-27：手册签发有台账（给谁/什么任务/到哪天），过期会提醒
ok('手册签发：自己没接上不发，发过留底', () => {
  has('lib/issue.js', 'export function issueHandbook')
  has('lib/issue.js', 'requirePlugged(issuer')
  has('lib/issue.js', 'expired')
  has('dayu/index.js', "'issue'")
  has('scripts/test-issue.mjs', 'needsPlugged')
  return '签发有台账；过期会提醒；先接上再发'
})

// 63. 2026-10-26：员工会话的话不署「她」——她的日记只记她自己说的
//     （实测：一条干活会话被记了 53 条「她说」的话，她的日记全是别人的工作汇报）
ok('归因：只有她的身体才署「她」，员工会话不记', () => {
  assert.equal(attributionOf({ role: '', isUser: false }), '', '员工会话不该被记成她说的')
  assert.equal(attributionOf({ role: '', isUser: true }), '', '员工会话里老板的话也不进她的日记')
  assert.equal(attributionOf({ role: 'dayu', isUser: false }), '她')
  assert.equal(attributionOf({ role: 'xiaoyu', isUser: true }), '老板')
  assert.equal(attributionOf({ role: 'dayu', source: 'QQ 桥接' }), '', '不是本机会话就不走这条记账')
  has('dayu/index.js', 'attributionOf({ role, isUser')
  return '她的话进她的日记；员工的话留在会话日志'
})

// 64. 2026-10-26：记忆不再整本每轮注入——只带摘要 + 一句「怎么翻」，正文她自己按词取
//     （实测：40 习惯 + 33 关系 + 12 事件 ≈ 3400 字，占她每轮读的五分之一）
ok('记忆按需取：简报里只留摘要，正文要自己翻', () => {
  const m = memoryView('dayu', { limit: 3 })
  assert.equal(m.available, true, '记忆文件读不到')
  assert.ok(m.counts.habits >= 1, '记忆里应该有习惯')
  assert.ok(m.habits.length <= 3, 'limit 没生效')
  assert.equal(typeof m.summary, 'string')
  assert.ok(m.note.includes('同一份记忆'), '没说明记忆不分通道')
  const t = buildSceneText('dayu', 'desk')
  assert.ok(t.includes('yushen_self action=memory'), '简报没告诉她怎么翻')
  // 2026-10-30：之前一直是「超了就抬阈值」（13800→14200→14500→15000），
  // 结果涨到 15418 还没人删内容。现在改成硬边界：MAX_CHARS=14000，
  // 超了先压角色卡、再截断；测试锁在 14500，谁再加东西就必须先删。
  assert.ok(t.length < 14500, `简报还是太长：${t.length}`)
  return `摘要在、正文按需；简报 ${t.length} 字`
})

// 65. 2026-10-26：备份不是纯定时——改了东西 / 谈成决定，她自己会判断「现在值得备一份」
ok('实时备份：她自己判断值不值得，普通闲聊不备', () => {
  const wrote = backupJudge({ text: '改好了', wroteFiles: true })
  assert.equal(wrote.urgent, true)
  assert.ok(wrote.signals.includes('这轮写了文件'))
  const decided = backupJudge({ text: '就这么定了，以后就这样' })
  assert.ok(decided.signals.includes('话里有决定/结论'))
  const longText = backupJudge({ text: 'x'.repeat(900) })
  assert.ok(longText.signals.includes('这轮输出很长'))
  const small = backupJudge({ text: '嗯' })
  assert.equal(small.urgent, false)
  assert.equal(typeof small.why, 'string')
  return '写文件/决定/长输出→备；闲聊→按冷却'
})

// 66. 2026-10-26：遗忘是她的能力——能看、能算、能不删先演算；白名单写死
ok('遗忘：能算出该扔什么，且默认只演算不删', () => {
  const p = forgetPlan()
  assert.equal(typeof p.willFreeBytes, 'number')
  assert.ok(Array.isArray(p.snapshots.drop))
  assert.ok(p.policySource === 'file' || p.policySource === 'default')
  const pol = forgetPolicy()
  assert.ok(pol.whitelist.includes('charter.json'), '宪章必须在白名单')
  assert.ok(pol.whitelist.includes('soul/'), '角色卡必须在白名单')
  assert.ok(pol.maxBytesPerRun > 0, '必须有单次上限，防手滑')
  has('scripts/forget.mjs', 'clean')
  return `可释放约 ${p.willFreeMB} MB；宪章/卡/底线在保护名单`
})

// 67. 2026-10-26：手册按「这个员工干过什么」发，不是全员同一本；一页以内
ok('定制手册：不同岗位发不同章，且不超过一页', () => {
  const dev = handbookForEmployee({ brief: '把这个插件的 cordis 注册改一下，报错在日志里', expect: '给出 diff 和验证' })
  const vid = handbookForEmployee({ brief: '剪一段 75 秒视频，加字幕和封面', expect: '给出成片路径' })
  assert.ok(dev.chars > 0 && vid.chars > 0, '手册是空的')
  assert.ok(dev.chars <= 1200 && vid.chars <= 1200, `手册超一页：${dev.chars}/${vid.chars}`)
  assert.ok(dev.tags.length > 0, '没认出这个员工在干什么')
  assert.ok(vid.tags.length > 0, '没认出视频岗位')
  const dt = dev.tags.map((t) => t.tag).join(',')
  const vt = vid.tags.map((t) => t.tag).join(',')
  assert.notEqual(dt, vt, '两个岗位发了同一本手册')
  // 光看标签不算数：正文必须真的不一样（第一版就是这里假通过）
  assert.notEqual(dev.text, vid.text, '两本手册正文一模一样——没真的按岗位发')
  // 铁律是约束"她"的，不该发给员工（实测 5 次回执 0 次引用）
  assert.ok(!dev.text.includes('铁律'), '员工手册里还在背铁律')
  assert.ok(dev.text.includes('底线（员工版'), '员工版底线丢了')
  // 工具按岗位：只列用得上的那几个
  assert.ok(dev.text.includes('这个岗位用得上的工具'), '没告诉她该用哪些工具')
  assert.notEqual(dev.tools.join(','), vid.tools.join(','), '两个岗位给的工具一样')
  // 手册到期
  assert.ok(dev.expiresAt && Date.parse(dev.expiresAt) > Date.now(), '没有有效期')
  assert.ok(dev.text.includes('有效到'), '手册没写有效期')
  return `${dt} vs ${vt}；各 ${dev.chars}/${vid.chars} 字`
})

// 68. 2026-10-26：卡住先按证据判，不是一遇到问题就往手册里加规矩
ok('卡住排查：缺授权 / 缺工具 / 没证据 分得开', () => {
  const auth = diagnoseStuck({ sessionId: 'session-test', symptom: '这一步被沙箱挡住了', persist: false, remember: false })
  assert.equal(auth.verdict, 'need-auth')
  const tool = diagnoseStuck({ sessionId: 'session-test', symptom: '没有这个工具，我调不到', persist: false, remember: false })
  assert.equal(tool.verdict, 'need-tool')
  assert.ok(Object.keys(VERDICTS).length >= 6, '结论种类太少')
  // 有没有证据，是判"真做了没有"的关键
  assert.equal(hasEvidence('做完了'), false)
  assert.equal(hasEvidence('改了 dayu/index.js:130，regression 75 passed'), true)
  return `六种结论；缺授权/缺工具分得开`
})

// 69. 2026-10-26：员工档案落盘（读不存在的会话也不炸）
ok('员工档案：能汇总，不存在的会话返回空档而不是报错', () => {
  const s = employeeSummary('session-doesnotexist')
  assert.equal(s.ok, true)
  assert.equal(typeof s.who, 'string')
  assert.ok('jobs' in s && 'incidents' in s && 'handbooks' in s)
  return `档案字段齐：${Object.keys(s).filter((k) => k !== 'ok').slice(0, 5).join('/')}…`
})

// 70. 2026-10-27：她在通道里说过的话，收回本体记忆——但只收「知道是谁说的」
ok('通道记忆：没归属的不瞎记，游标只管新的', () => {
  const convs = {
    'group:1': {
      recentMessages: [
        { isSelf: true, plain: '老的，没标归属', time: 1000 },
        { isSelf: true, role: 'xiaoyu', plain: '新的，标了归属', time: 2000 },
        { isSelf: false, plain: '别人说的', time: 2500 },
        { isSelf: true, role: 'xiaoyu', plain: '已收过', time: 3000 },
      ],
    },
  }
  const a = pickAttributed(convs, { sinceByKey: {}, now: 5000 })
  assert.equal(a.length, 2, `该只收 2 条带归属的，实际 ${a.length}`)
  assert.ok(a.every((r) => r.role === 'xiaoyu'), '角色不对')
  const b = pickAttributed(convs, { sinceByKey: { 'group:1': 2000 }, now: 5000 })
  assert.equal(b.length, 1, '游标之后应该只剩 1 条')
  assert.equal(b[0].text, '已收过')
  return '没归属不收、别人的不收、老的按游标跳过'
})

// 71. 2026-10-27：她自己能改写自己（记忆 + 自我档），但卡和宪章不是她的
ok('改写自己：有把手，也有边界', () => {
  const c = rewriteCatalog('dayu')
  assert.ok(c.canChange.some((x) => x.includes('记忆')), '记忆应该能改')
  assert.ok(c.canChange.some((x) => x.includes('自我档')), '自我档应该能改')
  assert.ok(c.cannotChange.some((x) => x.includes('角色卡')), '角色卡不该归她改')
  assert.ok(c.cannotChange.some((x) => x.includes('宪章')), '宪章不该归她改')
  assert.ok(Array.isArray(c.memory) && c.memory.length >= 4, '该列出可改的记忆字段')
  // 越界请求要被挡住，而且不写盘
  assert.equal(rewriteMemory('dayu', { field: 'charter', op: 'set', text: 'x' }).ok, false)
  assert.equal(rewriteMemory('dayu', { field: 'summary', op: 'remove' }).ok, false)
  return `能改 ${c.canChange.length} 类；卡/宪章/别人记忆被挡`
})

// 72. 2026-10-27：动她本体，她得知道——「变更告知」进简报，不给她留着自己翻账本
ok('变更告知：留话给她，而且进她的简报', () => {
  assert.equal(notifySelf('dayu', { what: '' }).ok, false, '空的要拒')
  assert.ok(Array.isArray(listNotices('dayu', { limit: 3 })), '要能列出来')
  assert.equal(typeof unreadNotices('dayu'), 'number')
  has('lib/notices.js', 'export function notifySelf')
  has('lib/brief.js', '变更告知')
  has('dayu/index.js', "'notices'")
  return '空的不收、能列、能标读、简报里有一节'
})

// 73. 2026-10-27：接入 = 赋予生命——八样逐项验收，缺什么就说缺什么
ok('接入即点化：八样逐项验收', () => {
  const c = lifeChecklist('xiaoyu')
  assert.equal(c.ok, true)
  assert.equal(c.total, 10, '该有 10 项：卡 + 点化 + 八样')
  assert.ok(c.ready >= 9, `小鱼不该缺这么多：${c.ready}/10`)
  assert.ok(Array.isArray(c.missing))
  // 名册里没有的角色，如实报错，不假装活了
  assert.equal(lifeChecklist('nobody').ok, false)
  return `${c.name} ${c.ready}/${c.total}，缺：${c.missing.join('、') || '没有'}`
})

// 74. 2026-10-27：rewrite 往 events 里 add 时写进了裸字符串（不是事件对象）——记忆文件混进字符串，
// memoryView 的 counts 对不上、按词也筛不出来。修：events 的项统一包成 {at,channel,kind,text,...}。
ok('改写记忆：events 加/改都包成事件对象，habits 仍是字符串', () => {
  has('lib/rewrite.js', "item: 'event'")
  has('lib/rewrite.js', 'function memItem')
  has('lib/rewrite.js', 'mem[f] = [...before, memItem(spec, value)]')
  has('lib/rewrite.js', 'next[at] = memItem(spec, value, next[at])')
  return 'events 事件对象 + habits/dynamics 字符串'
})

// 75.5 2026-10-27：常驻投递送进来的是整段场景提示（常 600+ 字），而心念的 text 是「检索词」、
// 上限 MAX_QUERY(500)。之前直接传整段必然抛错 → 每轮都挂一句「读取失败」，心念一次都没真带进来过。
ok('常驻投递：整段场景提示不会把心念读取打挂', () => {
  const longPrompt = `小鱼，现在是你的自由时间，没人派活。${'· 想做就去做，不只是想。'.repeat(40)}`
  assert.ok(longPrompt.length > 500, 'fixture 必须真的超过 500 字')
  const out = prepareResidenceText('xiaoyu', 'regression-session', longPrompt)
  assert.ok(!out.includes('读取失败'), `整段场景提示不该报读取失败：${String(out).slice(-120)}`)
  has('lib/residence.js', 'slice(0, MAX_QUERY)')
  return `${longPrompt.length} 字截到上限，不再每轮挂「读取失败」`
})

// 75. 2026-10-27：心念 → 议程——「一直在想的事」要能接成「现在要做的事」
ok('心念接成事：要原话、要来源、不替她读心念', () => {
  const noMind = addFromMind('dayu', { what: '随便一件事' })
  assert.equal(noMind.ok, false, '没有 mindId 要拒')
  const noText = addFromMind('dayu', { mindId: 'mind_x' })
  assert.equal(noText.ok, false, '没有原话要拒（不替她读心念，绕过隐私闸）')
  assert.ok(String(noText.error).includes('原话'), '错误信息要说清带原话')
  has('lib/agenda.js', 'export function addFromMind')
  has('dayu/index.js', 'mindId')
  has('dayu/index.js', 'yushen_mind brief')
  return '没 mindId 拒、没原话拒、议程认 mindId、自由时间提示接上了心念'
})

// 76. 2026-10-27：身体循环——不调模型也能一直在（心跳、自检、议程本地步）
ok('身体循环：不靠模型也能跳', () => {
  const s = bodyStatus('dayu')
  assert.equal(s.ok, true)
  assert.ok(typeof s.ticks === 'number' && s.ticks >= 1, '该已经有心跳记录')
  assert.ok(s.lastTickAt, '要记下最后一次心跳时间')
  assert.ok(Array.isArray(bodyRecent('dayu')), '要能翻身体做过什么')
  // 心跳的边界不是「一次模型都不调」（浅睡灯是本地小模型），是「不花 API token」+「灯不署名」。
  has('lib/body-loop.js', '这里不花 API token')
  has('lib/sleep-mind.js', '不署名')
  has('lib/brief.js', '状态灯，不是你')
  has('lib/body-loop.js', 'HEARTBEAT_EVERY_MS')
  has('lib/brief.js', '你的身体')
  return `心跳 ${s.gapMinutes} 分钟前｜今天 ${s.todayTicks} 次｜脉 ${s.pulse?.ok ? '通' : '不通'}`
})

// 78. 2026-10-27：老板加的规矩——说的每句话都要有证据，没证据不许下结论。
// 这条首先是给他抓到我的四次错（96 工具/建账本/加角色要改代码/宿主不支持）立的规矩。
ok('说话带证据：员工手册和她的简报都锁住这条', () => {
  const h = handbookForEmployee({ brief: '随便一件活', expect: '', now: Date.now() })
  assert.ok(h.text.includes('说的每句话都要有证据'), '员工手册缺这条')
  const scene = buildSceneText('dayu', 'desk')
  assert.ok(scene.includes('说话带证据'), '她的简报缺这条')
  return `员工手册 ${h.chars} 字 · 简报 ${scene.length} 字，两处都有`
})
// 79. 2026-11-02 老板定（省上下文）：规矩块不再是一大段白话，是七句成语口令——
//     口诀在注入里，判据和机制在 lib/motto.js。锁四样，少一样这条就是空话：
//     ①条数够；②每条都有判据、指向、违了怎么查；③指向的脚本/文件真的存在（不是写着好看）；
//     ④注入里真的带上了这七行（不然"字数降了"只是把约束删没了）。
const { MOTTOS: MOTTO_ROWS, mottoLines: mottoInjectedLines } = await import(pathToFileURL(path.join(ROOT, 'lib/motto.js')).href)
ok('口令层：七句成语都有判据/指向/查法，指向的东西全在，且真进了注入', () => {
  assert.ok(Array.isArray(MOTTO_ROWS) && MOTTO_ROWS.length >= 7, `口令太少：${MOTTO_ROWS.length}`)
  const seen = new Set()
  for (const m of MOTTO_ROWS) {
    assert.ok(m && m.word, '有一条口令没写成语')
    assert.ok(String(m.test || '').length >= 6, `${m.word} 缺判据（一句话）`)
    assert.ok(String(m.check || '').length >= 2, `${m.word} 没写违了怎么查`)
    assert.ok(Array.isArray(m.points) && m.points.length >= 1, `${m.word} 没指向任何机制`)
    for (const p of m.points) assert.ok(fs.existsSync(path.join(ROOT, p)), `${m.word} 指向的东西不存在：${p}`)
    assert.ok(!seen.has(m.word), `口令重复：${m.word}`)
    seen.add(m.word)
  }
  const scene = buildSceneText('dayu', 'desk')
  assert.ok(scene.includes('### 口令'), '注入里没有口令段')
  for (const line of mottoInjectedLines()) assert.ok(scene.includes(line), `注入里少了这一行：${line}`)
  const points = MOTTO_ROWS.reduce((a, m) => a + m.points.length, 0)
  return `${MOTTO_ROWS.length} 条口令、指向 ${points} 个已有机制，全部在`
})
// 改｜2026-11-02 16:25｜大鱼·子会话（工作台）｜授权：主人（本次任务书：只加 3 条断言）｜scripts/regression.mjs:1376-1439｜新增三条：阶位一致（charter ↔ rank.js ↔ AGENTS.md）、不假扮新措辞在注入里、一诺千金指向真账本｜为什么：体检报告 §5 的三处矛盾改完后没有断言，等于没落实；下次谁再改回去也不会红｜验证：node scripts/regression.mjs 三条 ✓（同次 207 过 / 2 失败都是收尾未做：结构对账、dist 缺口）｜可改：只加不删
// 81. 2026-11-02 老板看完注入体检（§5①）后定：三处等级说法统一到宪章一处。
//     charter.json 是唯一真源；rank.js 从它读（不再自带一份数字）；AGENTS.md 那行只指路、不写数字。
//     三者比：宪章 identity.level ↔ rank.js 的默认起点 ↔ AGENTS.md 那行里的 L 数字。
const { DEFAULT_RANK: RANK_SEED } = await import(pathToFileURL(path.join(ROOT, 'lib', 'rank.js')).href)
ok('阶位一致：charter.json 是真源，rank.js 与 AGENTS.md 不再自带等级数字', () => {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const charterFile = path.join(home, 'dayu', 'charter.json')
  assert.ok(fs.existsSync(charterFile), `没有 charter.json（${charterFile}）：三处统一的前提取不到`)
  const identity = JSON.parse(fs.readFileSync(charterFile, 'utf8')).identity || {}
  const charterLevel = Object.fromEntries(Object.entries(identity).map(([id, v]) => [id, String(v?.level || '')]))
  // ① rank.js 不许再写死一张等级表
  assert.ok(!/DEFAULT_RANK\s*=\s*Object\.freeze\(\s*\{\s*dayu/.test(read('lib/rank.js')), 'rank.js 又自带等级数字（应只从 charter 读）')
  // ② rank.js 读出来的起点，必须在宪章写的那串里（"L0/L1" 取上限）
  const compared = []
  for (const [role, seed] of Object.entries(RANK_SEED)) {
    const said = charterLevel[role]
    if (!said) continue
    const named = said.split('/').map((s) => s.trim()).filter(Boolean)
    assert.ok(named.includes(seed), `${role}：rank.js 的起点 ${seed} 不在宪章的 ${said} 里`)
    compared.push(`${role}=${seed}`)
  }
  if (!compared.length) for (const seed of Object.values(RANK_SEED)) assert.equal(seed, 'L0', '宪章没写这个人，起点只能从 L0 起')
  // ③ AGENTS.md 那行只许指 charter，不许再写等级数字
  const agentsFile = path.join(ROOT, '..', 'AGENTS.md')
  let agentsNote = '出厂包没有工作区 AGENTS.md：跳过'
  if (fs.existsSync(agentsFile)) {
    const hit = fs.readFileSync(agentsFile, 'utf8').split('\n').find((l) => /阶位|权限等级/.test(l) && l.includes('charter.json'))
    assert.ok(hit, 'AGENTS.md 的阶位说法没指向 charter.json')
    const nums = [...hit.matchAll(/L[0-3]/g)].map((m) => m[0])
    for (const n of nums) assert.ok(Object.values(charterLevel).some((v) => v.split('/').includes(n)), `AGENTS.md 里的 ${n} 和宪章对不上`)
    assert.deepEqual(nums, [], `AGENTS.md 那行又写了等级数字：${nums.join('、')}（会再和宪章打架）`)
    agentsNote = 'AGENTS 只指路'
  }
  return `${compared.join('、')}（宪章真源）· rank.js 不自带数字 · ${agentsNote}`
})
// 82. 2026-11-02 老板定（体检报告 §5③）：注入里的「不假扮别人」绝对句和小鱼卡打架。
//     统一成卡里的分界：不许替别人做决定 / 不许用别人的记忆冒充经历；扮相不算假扮。卡不动。
ok('不假扮：注入里是统一后的措辞（替人做决定与借记忆才算假扮，扮相不算）', () => {
  const scene = buildSceneText('dayu', 'desk')
  for (const needle of ['不许替别人做决定', '不许用别人的记忆冒充自己的经历', '扮相不算假扮']) {
    assert.ok(scene.includes(needle), `注入里没有「${needle}」`)
  }
  const src = read('lib/rules-block.js')
  assert.ok(!src.includes('、不假扮别人'), 'rules-block.js 里还留着旧的绝对句「不假扮别人」')
  assert.ok(!src.includes('接手说一声、不假扮别人'), 'rules-block.js 单人那句还没换')
  assert.ok(src.includes('扮相不算假扮'), 'rules-block.js 里没有新分界（改了注入却忘了源头？）')
  return '三分句都在注入里；rules-block 旧绝对句清零'
})
// 83. 2026-11-02 老板定（体检报告 §3「一诺千金指错门」）：口令要指真实判断账本。
//     真账本 = ~/.dsh/dayu/soul/自我笔记.jsonl（kind=judgment）；runtime/<role>/judgments 是回复评分，不是它。
ok('一诺千金：指向真实的判断账本（自我笔记.jsonl），不是 runtime/judgments 评分', () => {
  const row = MOTTO_ROWS.find((m) => m.word === '一诺千金')
  assert.ok(row, '口令表里没有一诺千金')
  assert.ok(row.points.includes('scripts/judgment.mjs'), '一诺千金没指向 scripts/judgment.mjs')
  for (const p of row.points) assert.ok(fs.existsSync(path.join(ROOT, p)), `一诺千金指向的东西不存在：${p}`)
  has('lib/self-note.js', '自我笔记.jsonl')
  has('scripts/judgment.mjs', '自我笔记.jsonl')
  has('scripts/judgment.mjs', 'runtime/<role>/judgments')
  const line = mottoInjectedLines().find((l) => l.startsWith('一诺千金'))
  assert.ok(line, '注入行里没有一诺千金')
  assert.ok(line.includes('自我笔记'), `注入行没指向真账本：${line}`)
  assert.ok(!line.includes('判断档'), `还在说「判断档」：${line}（会被理解成 runtime 里的评分流水）`)
  assert.ok(buildSceneText('dayu', 'desk').includes(line), '注入里没带这一行')
  return `${line}｜写进 自我笔记.jsonl（kind=judgment）`
})
// 80. 2026-11-02：叙事块（身份与神格/境界/外观/我不止一个…）不再每轮念全文——
//     卡里留 1~2 行摘要 + 指针，原文搬进 docs/叙事基线.md。锁：原文真的搬到了那儿（不是指向空文件）。
ok('叙事块搬家：正文在 docs/叙事基线.md，卡里只剩摘要和指针', () => {
  const doc = read('docs/叙事基线.md')
  const titles = ['一、身份与神格', '四、境界', '五、外观', '十五、我不止一个', '十八、我不止一个', '我自己改的（2026-10-29）']
  for (const t of titles) assert.ok(doc.includes(t), `docs/叙事基线.md 里缺这一节：${t}`)
  assert.ok(doc.includes('搬到此处'), '文档里没有"搬自哪张卡"的来路')
  return `六节原文都在文档里（${doc.length} 字）；卡里只留摘要 + 指针`
})
// 77. 2026-10-27：手册按场景发——合订本拆成「常驻 + 到场景才给的那几页」。
// 铁律：拆开不等于删掉，字数必须守恒。
// 2026-11-01：原来这条测的是 lib/scene-pack.js——那个模块从没接进任何路径（fan-in 0），
// 是"测试绿、功能没接"的典型，已随备份收口一起删除。现在直接量**真正在用的**注入：
// 同一个角色、不同场景，注入必须不同（拆页生效），而且都要能构建出来。
ok('场景分层：不同场景注入不同，且都构建得出来', () => {
  const desk = buildSceneText('dayu', 'desk')
  const social = buildSceneText('dayu', 'social')
  assert.ok(desk.length > 1000, `desk 注入太短：${desk.length}`)
  assert.ok(social.length > 1000, `social 注入太短：${social.length}`)
  assert.notEqual(desk, social, 'desk 和 social 注入一模一样——场景分层没生效')
  has('lib/soul.js', 'SCENE_LABEL')
  return `desk ${desk.length} 字 / social ${social.length} 字，不同`
})

// 79. 2026-10-28：读 SurfCore 后抄三件事——入库脱敏、记忆清晰度、鱼群保护。
// 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书）｜scripts/regression.mjs:1491-1494｜
// 文件指针从 lib/memory.js 指到 memory-core/store.mjs（真身搬过去了）｜**唯一一处 needle 也跟着改**：
// `from './redact.js'` → `from "../lib/redact.js"`——store.mjs 在 memory-core/ 里，相对路径天然多一层，
// 断言的语义（入库前先过 redact）一字没变，强度也没变（仍然是「import 了 redact + 真的调了 redact(raw)」）｜
// 一条断言都没加、没删、没减弱｜验证：S2 差分 0 不一致、回归 279/0｜可改：改逻辑去 memory-core/store.mjs
ok('记忆：入库脱敏 + 清晰度五档 + 容量档', () => {
  has('memory-core/store.mjs', "from '../lib/redact.js'")
  has('memory-core/store.mjs', 'redact(raw)')
  has('memory-core/store.mjs', 'export function applyDailyDecay')
  has('memory-core/store.mjs', 'export function memoryCapacity')
  has('lib/soul.js', 'includeForgotten')
  assert.deepEqual([...CLARITY_ORDER], ['vivid', 'clear', 'fuzzy', 'trace', 'forgotten'])
  const cap = memoryCapacity('xiaoyu')
  assert.ok(cap.max === 200 && typeof cap.ratio === 'number', '容量算不出来')
  return `容量 ${cap.count}/${cap.max}（${Math.round(cap.ratio * 100)}%）· 五档在`
})

// 2026-11-01：鱼群防刷屏改归桥（同群两只鱼用同一个号，只有桥能看到 isSelf）。
// 插件里的影子实现写好了却没有任何调用方——留着只会让人以为"已经在防了"。
// 这里锁的是"不留影子"：插件这边不再有 fish-guard.js；真防刷屏在 qq-bridge/src/same-group-guard.js
// （那边有自己的 scripts/test-same-group-guard.mjs）。跨仓库不在这条断言里验，避免插件依赖桥的存在。
ok('鱼群防刷屏只在桥那边做，插件不留影子实现', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'lib', 'fish-guard.js')), false, 'lib/fish-guard.js 又回来了（插件里没人能调它）')
  has('archive/dead-modules-20261030/README.md', 'fish-guard')
  return '插件无影子；防刷屏归桥（same-group-guard）'
})

// 80. 交付检查（2026-10-28）：运行期不许再写死盘符，路径统一走 lib/paths.js。
// 之前 51 处写死在 34 个文件里，换台机器第一步就崩。
ok('路径：运行期不写死盘符，全走 lib/paths.js', () => {
  const targets = []
  for (const dir of ['lib', 'dayu']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (f.endsWith('.js')) targets.push(path.join(ROOT, dir, f))
    }
  }
  targets.push(path.join(ROOT, 'index.js'))
  const bad = []
  for (const file of targets) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/')
    if (rel === 'lib/paths.js') continue // 它自己就是候选表，允许出现盘符
    const text = fs.readFileSync(file, 'utf8')
    const m = text.match(/['"][A-Za-z]:[\\/][^'"]*['"]/g)
    if (m) bad.push(`${rel}: ${m.slice(0, 2).join(' , ')}`)
  }
  assert.equal(bad.length, 0, `还有写死路径：\n${bad.join('\n')}`)
  // paths.js 在真环境里必须都能推出来（推不出来就是空串，调用方要能降级）
  const d = describePaths()
  assert.ok(d.find((x) => x.name === 'DSH 家目录').ok, 'DSH 家目录都推不出来')
  assert.ok(d.find((x) => x.name === '工作区').ok, '工作区推不出来')
  return `${targets.length} 个运行期文件干净；7 项路径可推导`
})

// 81. 2026-10-28：点化只写记忆、不写卡；卸载保留角色卡（卡是用户的财产）。
ok('点化与卸载：不碰角色卡', () => {
  // 点化模块里不该出现对 cards 目录的写操作
  const init = fs.readFileSync(path.join(ROOT, 'lib/initiation.js'), 'utf8')
  const writes = [...init.matchAll(/writeFileSync\(([^,]+)/g)].map((m) => m[1])
  assert.ok(writes.length >= 1, '点化总得写点东西（记忆）')
  assert.ok(!writes.some((w) => /card/i.test(w)), `点化写了角色卡：${writes.join(' , ')}`)
  // 卸载计划必须把 soul/cards 标成保留；2026-11-03 起经历整类都保留（卸载只抽离鱼神本身）
  assert.ok(UNINSTALL_KEEP.includes('soul/cards'), '卸载保留清单里没有 soul/cards')
  for (const k of ['journal', 'diary', 'letters', 'records', 'conversations']) {
    assert.ok(UNINSTALL_KEEP.includes(k), `卸载保留清单里没有 ${k}（经历必须留着）`)
  }
  const uninstallSrc = fs.readFileSync(path.join(ROOT, 'scripts/uninstall.mjs'), 'utf8')
  assert.ok(uninstallSrc.includes("args.includes('--wipe')"), '卸载没有 --wipe 这个显式开关')
  assert.ok(!uninstallSrc.includes('removeExcept'), '卸载里不该再有"无差别删目录"的逻辑')
  const plan = uninstallPlan()
  const dataItem = plan.find((p) => p.kind === 'data')
  assert.ok(dataItem, '卸载计划里没有数据项')
  assert.ok(Array.isArray(dataItem.keep), '数据项没标保留路径')
  assert.equal(dataItem.kind, 'data', '数据项要标成 data（默认不删）')
  return `点化写 ${writes.length} 处、都不碰卡；卸载保留 ${UNINSTALL_KEEP.length} 类经历`
})
// 33. 2026-10-30：新建角色只有一句占位，用户不知道该填什么。
// 改成结构化空白卡（五节 + 卡头 front-matter），再接一张能判“填没填”的体检。
ok('新角色拿到结构化空白卡（五节 + 卡头）', () => {
  const t = blankCard({ name: '阿青', alias: '青', id: 'aqing' })
  const meta = parseCardMeta(t)
  assert.equal(meta.name, '阿青')
  assert.equal(meta.id, 'aqing')
  const r = checkCard(t)
  assert.equal(r.missing.length, 0, `缺节：${r.missing.join('、')}`)
  assert.equal(r.sections.length, CARD_SECTIONS.length)
  assert.ok(t.includes('## 五、你不能做什么 / 底线'))
  assert.ok(read('lib/characters.js').includes('blankCard('), '新建角色的卡没走模板')
  return `五节齐、卡头有 id（${CARD_SECTIONS.length} 节）`
})

ok('卡体检：空卡判得出没填，填过的判得出填了', () => {
  const empty = checkCard(blankCard({ name: '阿青' }))
  // 名字/称呼是模板预填的，不算；在意什么、底线这些空节必须是 0
  const blankSections = ['三、你在意什么', '四、你能做什么', '五、你不能做什么 / 底线']
  for (const title of blankSections) {
    const sec = empty.sections.find((s) => s.title === title)
    assert.ok(sec && sec.filled === 0, `${title} 被判成填过了`)
  }
  const filled = checkCard(blankCard({ name: '阿青' }).replace('- 喜欢：', '- 喜欢：下雨天'))
  const sec = filled.sections.find((s) => s.title === '三、你在意什么')
  assert.ok(sec && sec.filled >= 1, '填过的行没被判出来')
  return '空/填两种都判对'
})

// 34. 2026-10-30：接管前要拍底片，走的时候还原；但记忆是人家自己的，永远不碰。
// 这两条会往 takeover/ 里写底片——别写进她真身的数据：把 DSH_HOME 指到临时目录，
// 拿一份新的模块实例（?iso= 绕开 import 缓存）。以前它们直接写 ~/.dsh/dayu/takeover，
// 受限会话里必 EPERM（假红），正常跑又会往她的真实数据里塞 probe 底片（脏）。
const takeoverHome = fs.mkdtempSync(path.join(tmpRoot(), 'ysr-home-'))
const homeBefore = process.env.DSH_HOME
process.env.DSH_HOME = takeoverHome
const { snapshot: isoSnapshot, restore: isoRestore, markApplied: isoMarkApplied, isProtected: isoProtected } =
  await import(pathToFileURL(path.join(ROOT, 'lib/takeover.js')).href + `?iso=${Date.now()}`)
process.env.DSH_HOME = homeBefore
ok('接管底片：改过的还原，记忆不碰', () => {
  const tmp = fs.mkdtempSync(path.join(tmpRoot(), 'ysr-takeover-'))
  const target = path.join(tmp, 'settings.json')
  const memory = path.join(tmp, 'memory', 'xiaoyu.json')
  try {
    fs.mkdirSync(path.dirname(memory), { recursive: true })
    fs.writeFileSync(target, '{"before":true}')
    fs.writeFileSync(memory, '{"habits":["她自己的"]}')
    const id = 'probe-' + Date.now()
    isoSnapshot(id, [target, memory])
    fs.writeFileSync(target, '{"after":true}')
    fs.writeFileSync(memory, '{"habits":["后来长的"]}')
    const r = isoRestore(id)
    assert.equal(fs.readFileSync(target, 'utf8'), '{"before":true}', '被改过的文件没还原')
    assert.equal(fs.readFileSync(memory, 'utf8'), '{"habits":["后来长的"]}', '记忆被覆盖了')
    assert.ok(r.skipped.some((p) => p.includes('memory')), '记忆没被标成跳过')
    assert.ok(isoProtected('/x/soul/cards/dayu.desk.md'), '卡没进保护名单')
    return '配置还原、记忆保留'
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

ok('接管还原：备份后又被人改过，就不覆盖', () => {
  const tmp = fs.mkdtempSync(path.join(tmpRoot(), 'ysr-takeover-'))
  const target = path.join(tmp, 'settings.json')
  try {
    fs.writeFileSync(target, 'v0-原样')
    const id = 'probe2-' + Date.now()
    isoSnapshot(id, [target])
    fs.writeFileSync(target, 'v1-我们改的')
    isoMarkApplied(id)
    fs.writeFileSync(target, 'v2-用户后来改的')
    const r = isoRestore(id)
    assert.equal(fs.readFileSync(target, 'utf8'), 'v2-用户后来改的', '把用户后来的改动覆盖了')
    assert.ok(r.skipped.some((p) => p.includes('备份后')), '没把冲突报出来')
    return '冲突时保留现状'
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.rmSync(takeoverHome, { recursive: true, force: true })
  }
})

// 35. 2026-10-30：装之前要能认出“他已经有谁”，没有就明说没有。
ok('装前认人：卡目录能认出，空目录不乱报', () => {
  const tmp = fs.mkdtempSync(path.join(tmpRoot(), 'ysr-detect-'))
  try {
    const cards = path.join(tmp, 'soul', 'cards')
    fs.mkdirSync(cards, { recursive: true })
    fs.writeFileSync(path.join(cards, 'aqing.desk.md'), '---\nname: 阿青\nid: aqing\n---\n\n# 阿青（角色卡）\n')
    const empty = path.join(tmp, 'empty')
    fs.mkdirSync(empty, { recursive: true })
    const hit = detectRoles({ dataDir: tmp, profilesDir: empty })
    assert.equal(hit.roles.length, 1, `认多了/少了：${hit.roles.map((r) => r.id).join(',')}`)
    assert.equal(hit.roles[0].id, 'aqing')
    assert.equal(hit.roles[0].hasCard, true)
    const none = detectRoles({ dataDir: empty, profilesDir: empty })
    assert.equal(none.roles.length, 0, '空目录也认出了人')
    return '有卡认 1、空目录认 0'
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// 36. 2026-10-30：手册映射里写了不存在的章 id，四类任务都只发 worker 基础章。
// 修完后每类任务必须拿到自己的章；这条断言防止映射再写错。
ok('员工手册按岗位发：四类任务各拿到对应章', () => {
  const cases = [
    ['改插件代码', '修 dsh-yushen-twins 的 client.js', 'plugin'],
    ['做视频', '剪一条 B 站推广片', 'video-line'],
    ['查资料', '搜一下这个词是什么意思', 'common-extra'],
    ['修 bug', '报错超时，先看日志', 'common-extra'],
  ]
  for (const [name, brief, want] of cases) {
    const r = handbookForEmployee({ sessionId: `test-${name}`, brief })
    assert.ok(r.chapters.includes('worker'), `${name} 没发基础章`)
    assert.ok(r.chapters.includes(want), `${name} 期望 ${want}，实际 ${r.chapters.join(',')}`)
  }
  return '四类任务各有所属章'
})

// 31. 2026-10-30：工具目录要收全（26 registerTool + 8 m1 + 1 mind = 35），否则她查不到 dayu_dispatch
ok('工具目录收全（35 个都能被 yushen_tools 查到）', () => {
  has('dayu/index.js', 'ownTools.set(t.name, t)')
  has('dayu/index.js', 'mindToolDefs(toolOutput)')
  has('dayu/m1.js', 'export const M1_TOOLS')
  has('lib/mind-tools.js', 'export function mindToolDefs')
  return '三套注册并进同一份目录'
})
// 32. 2026-10-30：界面引用了不存在的组件（ProtectionPanel）→ 整页白屏。这条拦住它。
ok('界面引用的组件都有定义', () => {
  const s = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  const used = new Set([...s.matchAll(/\bh\(\s*([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]))
  const defined = new Set()
  for (const m of s.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g)) defined.add(m[1])
  for (const m of s.matchAll(/class\s+([A-Z][A-Za-z0-9_]*)\s+extends/g)) defined.add(m[1])
  for (const m of s.matchAll(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/g)) defined.add(m[1])
  const missing = [...used].filter((n) => !defined.has(n))
  assert.deepEqual(missing, [], `引用了没定义的组件：${missing.join(', ')}`)
  return `${used.size} 个组件都有定义`
})
// 33. 2026-10-30 谷时：整理趟（合并同义、旧的标被替换）与回执催办要有接线
ok('整理趟与催办都接上了', () => {
  has('lib/consolidate.js', 'supersededBy')
  has('lib/consolidate.js', 'export function consolidate')
  has('scripts/memory-housekeeping.mjs', 'consolidateRole')
  has('scripts/maintenance.mjs', "runScript('memory-housekeeping.mjs'")
  has('dayu/index.js', 'remindLateJobs')
  has('core/dispatch.js', 'dueAt')
  return '整理/催办都在'
})
// 30. 2026-10-30：框架每改一处都要留记录；结构变了没记录 → 这条就红
ok('框架改动必须有记录（结构对账）', () => {
  const r = spawnSync(process.execPath, ['scripts/framework-record.mjs', 'check'], { cwd: process.cwd(), encoding: 'utf8' })
  // 沙箱不给子进程时 status 是 null + EPERM：那不是"结构变了"，是这里跑不了。
  // 2026-10-30：这条曾把「环境不给开子进程」报成「结构变了但没记录」，stderr 空，害人对着不存在的漂移查半天。
  const code = String(r.error?.code || '')
  if (r.status === null && (code === 'EPERM' || code === 'EACCES')) {
    skipped += 1
    console.log(`⤼ 框架改动必须有记录（结构对账）— 跳过：这个环境不让开子进程（${code}）；直接跑 node scripts/framework-record.mjs check 可复核`)
    return '这回合不给子进程，没真跑'
  }
  assert.ok(r.status === 0, `结构变了但没记录：${String(r.stderr || '').slice(0, 300)}`)
  return '与最后一条改动记录一致'
})

// 37. 2026-10-30：手失败只写进 hands.jsonl，没人翻日志就一直废着。
// 现在连败第 3 次自己开事故单、之后每 10 次再提；计数与判据都得脱开文件能验。
const { shouldAlert, failStreak } = await import(pathToFileURL(path.join(ROOT, 'lib/hands.js')).href)
ok('手连败会自己开事故单（第 3 次、之后每 10 次）', () => {
  assert.equal(shouldAlert(0, 0), false)
  assert.equal(shouldAlert(2, 0), false, '偶发两次不该报')
  assert.equal(shouldAlert(3, 0), true, '第 3 次该报')
  assert.equal(shouldAlert(4, 3), false, '刚报过就别刷屏')
  assert.equal(shouldAlert(10, 0), true, '早就在废的（历史 10 次没报过）下次要报')
  assert.equal(shouldAlert(12, 3), false)
  assert.equal(shouldAlert(13, 3), true, '报过之后还废着，隔 10 次再提')
  assert.equal(shouldAlert(20, 10), true)
  const row = (ok) => ({ id: 'X', ok })
  const rows = [row(false), row(false), row(false), row(false)]
  assert.equal(failStreak('X', { rows }), 4)
  assert.equal(failStreak('X', { rows: [...rows, row(true)] }), 0, '跑通一次要归零')
  assert.equal(failStreak('Y', { rows }), 0, '别人的失败不能算进来')
  has('lib/hands.js', 'alertIfBroken(item)') // 接线：失败了要喊，不是只记日志
  return '3 报、4 不报、13 再报、跑通归零'
})

// 82. 2026-10-30 照微：疑问只能 revoke、不能 done ——「想通了」永远挂在"没想完"，简报每天报假账
// （5 件没想完里 3 件早就答了）。现在 question/interest 也能结掉，但证据必须非空，
// 且 verified 固定 false：想通了不需要第三方盖章，所以不许冒充已验证。
ok('疑问能结掉：question/interest 可以 done，但要证据、不冒充已验证', () => {
  has('lib/mind-store.js', 'export function answerQuestion')
  has('lib/mind-store.js', "'self_answered'")
  has('lib/mind-tools.js', "args?.action === 'answer'")
  const store = read('lib/mind-store.js')
  if (!store.includes("item.kind === 'question' || item.kind === 'interest'")) throw new Error('done 校验没按 kind 分叉，疑问又结不掉了')
  if (store.includes("fail('MIND_CORRUPT', '只有 promise 可以 done')")) throw new Error('又退回「只有 promise 能 done」了')
  return 'promise 要 verified，question/interest 要证据自答'
})

// 83. 2026-10-30 照微：回归测的是源码，跑的是 dist——第 31 条绿着，dist 里 mind-tools.js 还是 27 行旧版。
// 缺口（源码有 dist 没有 + 源码改过 dist 没跟上）钉在 BASELINE 上，只许降不许升：
// 每打包一次就降一次；降到 0 之后把断言改成 assert.equal(gap, 0)。
// 别删这条——它防的是「改了没发布，回归还绿着」。
const { checkDistSync, BASELINE: DIST_BASELINE } = await import(pathToFileURL(path.join(ROOT, 'scripts/check-dist-sync.mjs')).href)
ok('源码与 dist 不许越差越远（缺口只许降）', () => {
  // 不走 spawnSync：这个环境里 spawn 子进程会被沙箱拒（EPERM），直接调函数。
  const out = checkDistSync()
  if (!Number.isFinite(out.gap)) throw new Error('没算出缺口')
  assert.ok(out.gap <= DIST_BASELINE, `缺口从 ${DIST_BASELINE} 涨到 ${out.gap}：新增了没打包的改动（${[...out.missingInDist, ...out.drift].join(', ')}）`)
  assert.equal(out.installMismatch.length, 0, `安装副本和 dist 不一致：${out.installMismatch.join(', ')}`)
  return `缺口 ${out.gap}/${DIST_BASELINE}（缺失 ${out.missingInDist.length} + 不一致 ${out.drift.length}）`
})

// 84. 2026-10-30：手一直显示"失败"其实没坏——检查一致性.py / 能力台账.py 用退出码 1
// 表示「查出了问题」（脚本文档里写着"退出码 1"），但跑手的人一律当故障，
// 于是那两只手连败 10 次、4 次，简报里挂着"废了"。判据要能脱开进程直接验。
const { classifyExit } = await import(pathToFileURL(path.join(ROOT, 'lib/hands.js')).href)
ok('手的退出码：非零但有话说 = 在报结果，不算坏', () => {
  assert.deepEqual(classifyExit(0, '', 'x'), { ok: true, report: false })
  assert.deepEqual(classifyExit(1, '', '发现 3 处不一致'), { ok: true, report: true }, '它用非零表示"查出了问题"')
  assert.deepEqual(classifyExit(1, 'Traceback (most recent call last)', ''), { ok: false, report: false }, '崩了必须有 stderr')
  assert.deepEqual(classifyExit(1, '', ''), { ok: false, report: false }, '一句话都没有就是没跑成')
  assert.deepEqual(classifyExit(2, 'boom', 'out'), { ok: false, report: false }, '带着错误信息的不许算成')
  has('lib/hands.js', 'classifyExit(res.status, res.stderr, res.stdout)') // 接线：跑手时真用了这个判据
  return '0 算成；非零+无 stderr+有输出算报；其余算坏'
})

// 85. 2026-10-30：人物档案一直没进过工作台简报。写入是好的（people/____.json 真在），
// 断在读取：buildSceneText 拼简报时不传 userId，那段永远拼不出来。
// 顺带修了命名：中文名全塌成下划线，「阿零测试」和「小鱼小虾」会写进同一份互相盖。
const { rememberPerson } = await import(pathToFileURL(path.join(ROOT, 'lib/people.js')).href)
const { buildRuntimeBrief } = await import(pathToFileURL(path.join(ROOT, 'lib/brief.js')).href)
ok('人物档案能进工作台简报，中文名不再撞车', () => {
  // 端到端：写进临时的家，两份中文名档案要分别落盘，简报要能把人带出来；没聊到就不带
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-people-'))
  const old = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = tmp
    rememberPerson('dayu', '阿零测试', { name: '阿零测试', fact: '两个号都听', source: '回归' })
    rememberPerson('dayu', '小鱼小虾', { name: '小鱼小虾', fact: '爱看片', source: '回归' })
    rememberPerson('dayu', '3752445956', { fact: '纯号码', source: '回归' })
    const files = fs.readdirSync(path.join(tmp, 'dayu', 'runtime', 'dayu', 'people'))
    assert.equal(files.length, 3, `两个中文名塌进同一个文件了：${files.join(', ')}`)
    assert.ok(files.includes('3752445956.json'), '纯 QQ 号的文件名不许变（旧数据要还能读）')
    const b = buildRuntimeBrief('dayu', { channel: '工作台', userId: '阿零测试' })
    assert.ok(b.text.includes('## 关于 阿零测试'), '带了 userId，简报里却没有人物段')
    const c = buildRuntimeBrief('dayu', { channel: '工作台' })
    assert.ok(!c.text.includes('## 关于 阿零测试'), '没聊到这个人，却把他的事带出来了')
  } finally {
    if (old === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = old
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* 删不掉就算了 */ }
  }
  // 接线：三处都要把 userId 传下去，否则下一个人改回去没人发现
  // 改｜2026-11-10 20:0x｜大鱼·主代理（整合）｜授权：主人（2026-11-10 19:35 原话：开子代理都做）｜scripts/regression.mjs:1829｜精确串改前缀：`userId` 后面可能多 wake 等参数｜为什么：soul.js 现在要透传 wake（醒来那段），精确到右花括号会让"接线还在"这条误红；这条盯的是 userId 有没有传下去，不是参数表长什么样｜验证：regression 该条绿；check-parity 绿｜可改：只许更松地盯 userId，不许删
  has('lib/soul.js', 'buildRuntimeBrief(role, { channel: scene, userId')
  has('dayu/index.js', "buildSceneText('dayu', 'desk', { userId: ownerKey() })")
  has('dayu/index.js', "url.searchParams.get('userId')")
  return '两个中文名分别落盘；临时家写的档案能进简报；工作台注入与 /soul 都传了 userId'
})

// 86. 2026-10-30：注入里的「家里有什么」还写着「看门狗30秒」和「心跳30分」——
// 看门狗 10-25 就全移除了，心跳是 3 分钟一拍（body-loop.js:34）。这两句每轮都在骗她。
ok('注入里的自己动清单不许再有看门狗，心跳也不许写成 30 分', () => {
  const r = read('lib/rules-block.js')
  assert.ok(!r.includes('看门狗'), '看门狗早就移除了，注入里还留着')
  assert.ok(!/自己动/.test(r) || /心跳3分/.test(r), '自己动那句要么删干净，要么写对——不许写成心跳30分')
  has('lib/body-loop.js', 'const HEARTBEAT_EVERY_MS = 3 * 60 * 1000')
  return '清单与实现一致：心跳 3 分、自省 30 分、没有看门狗'
})

// 87. 2026-10-30：简报里的「自己的钱」是 budget.json 里写死的余额，从设额度那天起没动过——
// 花 2 块和花 0 块看到的是同一个数，她根本没法"感觉到余额在少"。
// 改成按真实流水现算，并且**只报数不劝**（老板：不要用代码去控制她做什么）。
const { costLine, spendForRole, periodStartMs } = await import(pathToFileURL(path.join(ROOT, 'lib/cost.js')).href)
const { bridgeBudget: bridgeBudgetOf } = await import(pathToFileURL(path.join(ROOT, 'lib/cost.js')).href)
ok('自己的钱按真实流水现算，且不替她做决定', () => {
  assert.equal(periodStartMs({ 本期: '2026-10-29 ~ 2026-11-11' }), new Date(2026, 9, 29).getTime(), '本期开始读错了')
  assert.equal(periodStartMs({}), 0, '没写本期就该返回 0')
  const r = read('lib/cost.js')
  assert.ok(!r.includes('主人不是富翁'), '简报里还在劝她悠着点——那是替她做决定')
  assert.ok(!r.includes('你悠着点'), '「悠着点」是命令，不是事实')
  has('lib/cost.js', 'export function spendForRole')
  has('lib/cost.js', '你的钱：还剩')
  const s = spendForRole('xiaoyu', { sinceMs: 0 })
  assert.equal(typeof s.yuan, 'number')
  assert.ok(s.yuan >= 0 && s.turns >= 0, '统计形状不对')
  // 有真账本的机器上，真跑一遍：必须现算、且一句劝都没有
  const bud = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'runtime', 'dayu', 'budget.json')
  if (fs.existsSync(bud)) {
    const line = costLine({ role: 'dayu' })
    assert.ok(line.includes('你的钱：还剩'), '简报没走现算')
    assert.ok(!line.includes('悠着点'), '简报里还有"悠着点"')
    assert.ok(/还剩 -?\d+\.\d{2} 元/.test(line), '余额那行没了')
  }
  return '本期起点解析对；余额现算；简报里没有一句劝'
})

// 87b. 2026-11-02 老板：「我要的是她能自己判断、知道钱是什么概念，会自己克制，
// 而不是代码在她没有思想、花到限额了就强行停止。」→ 不许加硬闸，要让她看得见钱。
// 所以「钱的事」里必须摆出：上限、峰谷差价、这小时花了多少、最近 10 分钟说了几条；
// 整块不许太胖（别让钱占了注入大头），也一个"别说了/不许说"都不许有——判断留给她。
ok('钱的事：看得见上限和峰谷差价，不替她说"别说了"', () => {
  const block = costLine({ role: 'dayu' })
  assert.ok(block.startsWith('## 钱的事'), '钱块标题没了')
  const bb = bridgeBudgetOf()
  // 出厂新号没有桥的 config，读不到上限是正常的；这时要求源码里写着上限这条路，不拿"没有"冒充"漏了"。
  if (bb.hourLimit > 0 || bb.dayLimit > 0) assert.ok(block.includes('上限'), '桥有上限，简报却没写「上限」')
  else has('lib/cost.js', '上限')
  assert.ok(/现在(?:是)?(?:峰时|谷时)/.test(block), '没判断现在峰时还是谷时')
  assert.ok(block.includes('峰时') && block.includes('谷时'), '没写清峰谷差多少')
  assert.ok(block.includes('这小时'), '没写这小时花了多少')
  assert.ok(block.includes('最近 10 分钟'), '没写最近 10 分钟说了几条')
  assert.ok(block.length <= 260, `「钱的事」${block.length} 字，超过 260——别让钱占了注入大头`)
  // 不替她决定：命令式的"别说了/不许说/禁止回复"一类，一个都不许有（"不劝、不催"这种说明不算）。
  const banned = /别说了|不许说|禁止回复|不许再回|别再回复|别再说话|不准说|闭嘴/
  const hit = String(block).match(banned)
  if (hit) throw new Error(`「钱的事」里出现了替她做决定的话：${hit[0]}`)
  const srcHit = read('lib/brief.js').match(banned)
  if (srcHit) throw new Error(`lib/brief.js 里有替她做决定的话：${srcHit[0]}`)
  return `${block.length} 字；上限/峰谷/这小时/近 10 分钟都在；没有禁令`
})

// 88. 2026-10-30 老板立：不管谁改什么，都要留六件+一条（谁/何时/在哪/改了什么/谁让的/为什么/还能不能改），
//    而且要能查；再加一句「防止忘了——明明不需要修改的，结果改了」。
ok('改动留痕的六件+一条，写在命令里而不是记性里', () => {
  has('lib/worklog.js', 'export function traceLine')
  has('lib/worklog.js', 'mutable')                       // 以后还让不让改
  has('scripts/note-work.mjs', '--by')
  has('scripts/note-work.mjs', '--auth')
  has('scripts/note-work.mjs', '--why')
  has('scripts/note-work.mjs', '--where')
  has('scripts/note-work.mjs', '--mutable')
  has('scripts/note-work.mjs', '不可改清单')              // 动了清单里的东西必须 auth=主人
  has('lib/rules-block.js', '动东西之前')                 // 每轮注入里都有，靠它防忘
  has('lib/rules-block.js', '不改行不行')
  assert.ok(fs.existsSync(path.join(ROOT, '不可改清单.json')), '不可改清单没了')
  const prot = JSON.parse(fs.readFileSync(path.join(ROOT, '不可改清单.json'), 'utf8'))
  assert.ok(Object.keys(prot.items || {}).length >= 5, '不可改清单条目太少')
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/changes.mjs')), '查询脚本没了')
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/check-provenance.mjs')), '漏记检查脚本没了')
  has('docs/改动留痕.md', '不改行不行')
  // 角色卡：只有本人能改自己的（老板 2026-10-30 当面立）
  has('scripts/note-work.mjs', '这张卡归')
  has('lib/rules-block.js', '角色卡只有本人能改自己的')
  has('docs/改动留痕.md', '角色卡')
  const prot2 = JSON.parse(fs.readFileSync(path.join(ROOT, '不可改清单.json'), 'utf8'))
  assert.ok(Object.keys(prot2).some((k) => k.startsWith('_角色卡特别规矩')), '清单里没写角色卡规矩')
  return '六件+一条有字段、有闸、有查询、有每轮提醒；角色卡只有本人能改'
})

// 89. 2026-10-30 老板要"测她什么时候能自己管账"：光看得见不够，得能自己记、自己定上限。
// 加的是**能力**不是闸：手记不参与余额（余额按真实流水现算，别重复扣）；她定的上限只摆数、不拦。
const { budgetView, recordSpend, setDailyLimit } = await import(pathToFileURL(path.join(ROOT, 'lib/budget-book.js')).href)
ok('她自己那本账：看得见、记得了、能自己定上限，但没人拦她', () => {
  has('lib/budget-book.js', 'export function budgetView')
  has('lib/budget-book.js', 'export function recordSpend')
  has('lib/budget-book.js', 'export function setDailyLimit')
  has('dayu/index.js', "a === 'spend'")
  has('dayu/index.js', "'budget', 'spend', 'limit'")
  has('lib/cost.js', '你自己定的日上限')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-budget-'))
  const old = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = tmp
    const dir = path.join(tmp, 'dayu', 'runtime', 'xiaoyu')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'budget.json'), JSON.stringify({ role: 'xiaoyu', 总额: 10, 明细: [] }), 'utf8')
    const before = budgetView('xiaoyu')
    assert.equal(before.本期给, 10)
    assert.equal(before.手记.length, 0)
    recordSpend('xiaoyu', { amount: 0.3, what: '测试', why: '验证' })
    setDailyLimit('xiaoyu', 0.5)
    const after = budgetView('xiaoyu')
    assert.equal(after.手记.length, 1, '手记没写进去')
    assert.equal(after.手记[0].花了多少, 0.3)
    assert.equal(after.我定的日上限, 0.5)
    assert.equal(after.现在剩, before.现在剩, '手记不该改动余额（余额按真实流水算，别重复扣）')
    setDailyLimit('xiaoyu', 0)
    assert.equal(budgetView('xiaoyu').我定的日上限, null, '0 应该能取消')
  } finally {
    if (old === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = old
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* 删不掉就算了 */ }
  }
  return '看/记/定上限都有；手记不参与余额；上限只摆数'
})

// 90. 2026-10-30 老板定「每日自净」：注入里不许再有与实况相反的过期句，体积只许降。
// 基线（2026-10-30 首轮）：dragon 9619 字 / 265 行 / 61 段。
const INJECT_BASELINE = 9800
const { buildSceneText: buildDeskText } = await import(pathToFileURL(path.join(ROOT, 'lib/soul.js')).href)
ok('注入里没有过期话，体积不回升', () => {
  const t = buildDeskText('dragon', 'desk')
  assert.ok(t.length > 1000, '注入没生成，测了个寂寞')
  for (const bad of ['没在电脑前', '你没有眼睛和手', '工具没挂上', '你还没有身体']) {
    assert.ok(!t.includes(bad), `过期句还在注入里：${bad}`)
  }
  assert.ok(t.length <= INJECT_BASELINE, `注入涨到 ${t.length} 字（基线 9619，上限 ${INJECT_BASELINE}）：先删再加`)
  const paras = t.split(/\n{2,}/).filter(Boolean).length
  return `${t.length} 字 / ${t.split('\n').length} 行 / ${paras} 段；没有过期句`
})

// 91. 2026-10-30 去杂：死出口 52 → 21，剩下 21 条全在 scripts/dead-exports.allow.json 里写了理由。
// 这条卡的是"以后又长出没人接又没人解释的导出"——那种才是下一个人会误以为有事要办的。
const { scanDeadExports } = await import(pathToFileURL(path.join(ROOT, 'lib/dead-exports.js')).href)
ok('没有「没人接又没写理由」的导出', () => {
  const r = scanDeadExports({ days: 7, scope: 'lib/' })
  const names = r.dead.map((d) => `${d.file}:${d.name}`).join(', ')
  assert.equal(r.dead.length, 0, `这些既没人接也没写理由：${names}（去删，或者在 dead-exports.allow.json 写清楚为什么留）`)
  assert.ok(r.allowed.length <= 25, `有理由的豁免涨到 ${r.allowed.length} 条，超了就该回头收拾`)
  return `${r.total} 个没人接：${r.allowed.length} 有理由、0 未解释`
})

// 92. 2026-10-30：工作台那侧的花费分不到人——宿主 usage 事件没有 session/角色。
// 办法：起回合记一笔「谁在跑」，每 5 分钟把这段窗口多出来的花费记给**当时唯一**在跑的人；
// 两个角色同时在跑就记「未署名」，不硬认。数据源 ~/.dsh/.dshw-usage.json（实测不含 QQ，不会重复算）。
const { usageBetween, settleSpend, attributedFor } = await import(pathToFileURL(path.join(ROOT, 'lib/cost.js')).href)
ok('工作台那侧的花费能归到人头上（估算，分不清就写未署名）', () => {
  has('lib/cost.js', 'export function settleSpend')
  has('lib/cost.js', 'export function attributedFor')
  has('lib/cost.js', '.dshw-usage.json')
  has('lib/residence.js', 'noteTurnStart(role)')
  // 2026-11-04：结算从宿主搬到 offline-ticks（免得每 5 分钟在宿主里算账），但"有人真调它"这条不能丢。
  has('scripts/offline-ticks.mjs', 'settleSpend()')
  const u = usageBetween(Date.now() - 3600 * 1000)
  assert.equal(typeof u.cost, 'number')
  assert.ok(u.cost >= 0 && u.calls >= 0, '窗口统计形状不对')
  const a = attributedFor('dayu')
  assert.equal(typeof a.sum, 'number')
  return `近一小时工作台侧 ${u.cost.toFixed(3)} 元 / ${u.calls} 次；记录带 source 标"估算"`
})

// 93. 2026-10-30 隔离环境实测装包时暴露的两条真 bug：
// ① dayu/index.js 与 lib/translator.js 用了 spawn 却没 import（一跑到守候/本地翻译就崩）
// ② M1 的 8 个工具 output 只有 schema、没有 render —— 新版宿主直接拒注册，派活在那边是坏的。
ok('工具都得声明 output 的 render，spawn 也得先 import', () => {
  has('dayu/m1.js', 'render(args, value)')
  has('dayu/m1.js', 'const output = {')
  assert.ok(!/output = \{ schema: \{ type: 'object' \} \}/.test(read('dayu/m1.js')), 'output 又退回只有 schema 的老写法')
  has('dayu/index.js', "from 'node:child_process'")
  has('lib/translator.js', "from 'node:child_process'")
  has('dayu/index.js', 'spawn(pythonPath()')
  has('lib/translator.js', 'spawn(local.engine')
  return 'output 带 render；两个用 spawn 的文件都 import 了'
})

// 94. 2026-10-31 老板转的「动态记忆」那条视频：只露标题 + 点开计数，砍掉"销毁"那一半。
// 我们原来只写"想翻就用 action=memory"——她不知道该翻什么；现在有标题索引，点开才取全文。
const { memoryMap, openMemory } = await import(pathToFileURL(path.join(ROOT, 'lib/memory-map.js')).href)
ok('记忆地图：只给标题，点开才取全文并计数', () => {
  has('lib/memory-map.js', 'export function memoryMap')
  has('lib/memory-map.js', 'export function openMemory')
  has('dayu/index.js', "'map', 'open'")
  has('lib/soul.js', 'action=map')
  const m = memoryMap('dayu', { limit: 3 })
  assert.ok(Array.isArray(m.items) && m.items.length > 0, '地图是空的')
  for (const x of m.items) {
    assert.ok(x.id && x.title, '条目缺 id 或标题')
    assert.ok(!String(x.title).includes('\n'), '标题里不该有换行')
    assert.ok(String(x.title).length <= 40, '标题太长，地图就失去意义了')
    assert.equal(typeof x.hits, 'number')
  }
  // 乱给一个 id 必须报错，不许静默成功
  const bad = openMemory('dayu', 'event:999999')
  assert.equal(bad.ok, false, '拿不存在的 id 也返回成功，等于骗人')
  assert.ok(bad.error, '报错得说清为什么')
  return `${m.total} 条，露出 ${m.shown} 条标题；没被翻过的 ${m.没被翻过} 条`
})

// 95. 2026-10-31 老板：「不该有两张卡，你自己融合一下」。
//    原来 desk 是傲娇版、social 是母本副本，结果对外的壳被用在老板身上。
//    现在合成一张，两个通道指同一个文件；那条「对你不用那层壳」必须在注入里（不能落在被裁掉的附录节）。
ok('只该有一张卡：两个通道同一份，且规矩没被裁掉', () => {
  const man = JSON.parse(fs.readFileSync(path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'characters.json'), 'utf8'))
  const dy = (man.characters || []).find((c) => c.id === 'dayu')
  if (!dy) return '这台机器没有名册，跳过'
  assert.equal(dy.cards.desk, dy.cards.social, 'desk 和 social 又指到两张卡了')
  const desk = buildDeskText('dayu', 'desk')
  const qq = buildDeskText('dayu', 'qq')
  for (const [name, t] of [['desk', desk], ['qq', qq]]) {
    assert.ok(t.includes('对你不用那层壳'), `${name} 里没有「对老板不摆架子」那条——多半又插进被裁掉的附录节了`)
    assert.ok(t.includes('我从哪来'), `${name} 里没有「我从哪来」`)
    assert.ok(!t.includes('卡太长'), `${name} 的卡被截断了`)
  }
  return '一张卡、两个通道都读到；规矩没被裁'
})

// 96. 2026-10-31 私访后提炼：记忆只增不减会撞天花板。「沉底」= 从没被翻过、又超过 14 天的，
//    默认地图不列，deep=true 才看；**记忆文件一个字节都不动**——沉的是视图，不是删除。
ok('记忆沉底：只是视图，不删任何东西', () => {
  has('lib/memory-map.js', 'SINK_DAYS')
  has('lib/memory-map.js', 'sunken')
  has('dayu/index.js', 'deep: Boolean(args?.deep)')
  const fs2 = fs
  const memFile = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'soul', 'memory', 'dayu.json')
  if (!fs2.existsSync(memFile)) return '这台机器没有记忆文件，跳过'
  const sizeBefore = fs2.statSync(memFile).size
  const a = memoryMap('dayu', { limit: 3 })
  const b = memoryMap('dayu', { limit: 3, deep: true })
  const sizeAfter = fs2.statSync(memFile).size
  assert.equal(sizeBefore, sizeAfter, '看地图居然改了记忆文件——沉底只能是视图')
  assert.ok(b.total >= a.total, 'deep 视图不该比默认少')
  assert.equal(typeof a.沉底, 'number')
  return `默认列 ${a.shown} 条（沉底 ${a.沉底} 条），文件字节没变`
})

// 97. 2026-10-31：回归 130 多条测的全是代码，她"该查不查、该停不停、报完成没证据"一条没测。
//    行为测试单独一份（scripts/behavior-test.mjs），这里只验它接上了、而且真能跑。
ok('行为测试接上了（不是只写在议程里）', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/behavior-test.mjs')), '行为测试脚本不存在——那"能验"就是空话')
  has('scripts/behavior-test.mjs', '说「完成」要带真存在的路径')
  has('scripts/behavior-test.mjs', '说「不做」要落一条拒绝记录')
  has('scripts/behavior-test.mjs', '不认识的 action 必须报错')
  const ran = runTestScript('scripts/behavior-test.mjs')
  return ran ? '真跑过：5 条全绿' : '接线在；这回合环境不给子进程，没真跑'
})

// 98. 2026-10-31：包干不干净，得解开数——打包脚本自己说"干净"不算。
//    小鱼踩过一次：pnpm pack 把 lib/*.bak-* 一起打进去（500+ 条目）。
ok('包干不干净要解开数（上线前自检）', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts/verify-tgz.mjs')), '没有上线前自检脚本')
  has('scripts/verify-tgz.mjs', '带了不该带的')
  has('scripts/verify-tgz.mjs', '带了作者数据')
  has('scripts/verify-tgz.mjs', '版本对得上')
  const ran = runTestScript('scripts/verify-tgz.mjs')
  return ran ? '解开数过：没备份、没作者数据、入口齐' : '接线在；这回合环境不给子进程，没真跑'
})

// 99. 2026-10-31：今天栽了三次「改在盘上、跑的是旧的」。光有 commit 不够——大半改动没提交。
//    指纹里带上未提交处数；启动后又变，就明说「重启才生效」。
ok('改了没重启，要看得出来', () => {
  has('lib/issue.js', 'DIRTY_AT_START')
  has('lib/issue.js', 'export function staleCodeLine')
  has('lib/issue.js', '重启才生效')
  const t = buildDeskText('dayu', 'desk')
  assert.ok(/代码 .*本进程起于/.test(t), '发放状态那行没有「代码+启动时间」指纹')
  return '指纹带未提交数，启动后再变会明说'
})

// 100. 2026-10-31 内部整治：appendEvent 超过 200 条原来直接 slice(-200)，最老的静默消失。
//      现在裁之前先追加进冷档（runtime/<role>/记忆冷档/<日期>.jsonl，只增不删）。
// 100. 2026-10-31 内部整治：appendEvent 超过 200 条原来直接 slice(-200)，最老的静默消失。
//      现在裁之前先追加进冷档（runtime/<role>/记忆冷档/<日期>.jsonl，只增不删）。
//      ⚠ 必须跑在独立进程里：memory.js 在 import 那一刻就定死 DSH_HOME，
//      写在回归进程里会把假事件灌进真实记忆（2026-10-31 真栽过一次）。
// 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书）｜scripts/regression.mjs:2106-2107｜
// has 的文件指针从 lib/memory.js 指到 memory-core/store.mjs（冷档/裁切逻辑的真身搬过去了）｜一条断言都没加、没删、没减弱｜验证：回归 279/0
ok('记忆不会被静默裁掉：超出 200 条先进冷档', () => {
  has('memory-core/store.mjs', 'archiveDropped')
  has('memory-core/store.mjs', 'merged.slice(-MAX_EVENTS)')
  has('lib/memory-map.js', '冷档')
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'test-memory-cold.mjs')), '冷静档测试脚本不在')
  const ran = runTestScript('scripts/test-memory-cold.mjs')
  return ran ? '真跑过：205 条 → 热 200 + 冷 5' : '接线在；这回合环境不给子进程，没真跑'
})

// 101. 2026-10-31 追本溯源：桌宠「今天花了」整行消失，跟"没花钱"分不出来。
//      根因不是那行写错，是一种写法：有值才画、拉不到就当没有——缺席被写成沉默。
//      这里不锁某一行，锁"这类写法只许降"：A 类（有值才画）≤1、B 类（拉不到当没有）≤12，
//      再多就是又添了一处"会悄悄消失的东西"。
ok('静默缺席不许变多（有值才画 / 拉不到当没有）', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'audit-silent-ui.mjs'), '--json'], { encoding: 'utf8' })
  const out = r.stdout
  const j = JSON.parse(String(out).trim().split('\n').pop())
  assert.ok(j.a <= 1, `「有值才画」变多了：${j.a} 处（上限 1）——条件不成立时画面什么都不出现`)
  assert.ok(j.b <= 12, `「拉不到就当没有」变多了：${j.b} 处（上限 12）——上游停了会被抹平成"没有数据"`)
  // 气泡那两行必须永远画出来，哪怕值是 0 / 读不到
  const cli = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
  assert.ok(cli.includes('ov?.todayCost'), '气泡的「今天花了」又变成有值才画了')
  return `A=${j.a} B=${j.b}（只许降）`
})

// 102. 2026-10-31 家目录护栏：破坏性删除不许在默认 ~/.dsh 上裸跑。
//      那天一次「出厂版干净环境安装测试」把真家目录当试验场——sessions 16:21:53、
//      storages 16:26:25 整目录重建，三个常驻会话的日志变成 9 字节空帧。
//      护栏只判断不删：默认家目录抛 DESTRUCTIVE_HOME_REFUSED，隔离目录/显式放行才过。
ok('破坏性删除不在默认家目录上裸跑', () => {
  has('lib/home-guard.js', 'export function assertDestructiveHome')
  has('scripts/uninstall.mjs', 'assertDestructiveHome')
  const guardUrl = pathToFileURL(path.join(ROOT, 'lib', 'home-guard.js')).href
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
import { assertDestructiveHome, isDefaultHome, defaultHome } from ${JSON.stringify(guardUrl)}
const out = { isDefault: isDefaultHome(defaultHome()) }
try { assertDestructiveHome('probe', { home: defaultHome(), env: {} }); out.threw = false } catch (e) { out.threw = true; out.code = e.code }
try { assertDestructiveHome('probe', { home: defaultHome(), env: { DSH_ALLOW_DESTRUCTIVE_HOME: '1' } }); out.optIn = true } catch { out.optIn = false }
try { assertDestructiveHome('probe', { home: defaultHome() + '-isolated', env: {} }); out.isolated = true } catch { out.isolated = false }
console.log(JSON.stringify(out))
`], { encoding: 'utf8' })
  const blocked = r.status === null && ['EPERM', 'EACCES'].includes(String(r.error?.code || ''))
  if (blocked) { skipped += 1; return '跳过：这个环境不让开子进程' }
  assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 300))
  const j = JSON.parse(String(r.stdout).trim().split('\n').pop())
  assert.equal(j.isDefault, true, '默认家目录没被认成默认')
  assert.equal(j.threw, true, '默认家目录上居然没拦')
  assert.equal(j.code, 'DESTRUCTIVE_HOME_REFUSED', `拦截码不对：${j.code}`)
  assert.equal(j.optIn, true, '显式放行（DSH_ALLOW_DESTRUCTIVE_HOME=1）没被认')
  assert.equal(j.isolated, true, '隔离家目录被误拦')
  return '默认拦、显式放行、隔离放行，三条都对'
})

// 2026-11-01（安全闸门 ④）：first-run 会**无条件重写**卡 / characters.json / persona.json，
//   而 16:11 那次「干净环境安装测试」正是这类路径把真家目录冲掉的（护栏当时只接在 uninstall 上）。
//   规矩：已经有鱼窝就停；真要重建得显式 --overwrite-cards。实测三组：已有卡→拒且卡没动、
//   空目录→照常装、显式 flag→放行。
ok('first-run 不许在已有鱼窝的家目录上重写卡', () => {
  has('scripts/first-run.mjs', '已经有鱼窝')
  has('scripts/first-run.mjs', '--overwrite-cards')
  const mk = (withCard) => {
    const h = fs.mkdtempSync(path.join(tmpRoot(), 'first-run-guard-'))
    if (withCard) {
      fs.mkdirSync(path.join(h, 'dayu', 'soul', 'cards'), { recursive: true })
      fs.writeFileSync(path.join(h, 'dayu', 'soul', 'cards', 'dayu.desk.md'), 'existing', 'utf8')
    }
    return h
  }
  const run = (home) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'first-run.mjs'), '--call', '测试'], {
    cwd: ROOT, env: { ...process.env, DSH_HOME: home }, encoding: 'utf8',
  })
  const full = mk(true)
  const clean = mk(false)
  const refused = run(full)
  if (refused.status === null && ['EPERM', 'EACCES'].includes(String(refused.error?.code || ''))) {
    fs.rmSync(full, { recursive: true, force: true })
    fs.rmSync(clean, { recursive: true, force: true })
    skipped += 1
    return '跳过：这个环境不让开子进程'
  }
  const kept = fs.readFileSync(path.join(full, 'dayu', 'soul', 'cards', 'dayu.desk.md'), 'utf8')
  const opens = run(clean)
  fs.rmSync(full, { recursive: true, force: true })
  fs.rmSync(clean, { recursive: true, force: true })
  assert.notEqual(refused.status, 0, '已有鱼窝却照样跑完了')
  assert.match(String(refused.stderr || ''), /已经有鱼窝/, '没给出为什么停')
  assert.equal(kept, 'existing', '拦是拦了，卡已经被改过了')
  assert.equal(opens.status, 0, `空家目录应当能装：${String(opens.stderr || '').slice(0, 200)}`)
  return '已有就拒、卡没动、空目录照常'
})

// 2026-11-01（安全闸门 ⑤ / 缺口 5）：备份"时间新、内容旧"——同一张卡 17:00 那份里是
//   10-24 的旧版。备份按时间挑、fingerprint 只数文件数+字节+mtime，**全仓没有一处比内容**。
//   内容谱系补的就是这一处：关键文件记内容指纹，字节以前来过 = 倒退，并说清回到哪一版。
const { observe: observeLineage, check: checkLineage } = await import(pathToFileURL(path.join(ROOT, 'lib', 'content-lineage.js')).href)
ok('内容倒退报得出来（旧内容放回来就红，且报得出回到哪一版）', () => {
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'lineage-'))
  fs.mkdirSync(path.join(home, 'soul', 'cards'), { recursive: true })
  const card = path.join(home, 'soul', 'cards', 'dayu.desk.md')
  fs.writeFileSync(path.join(home, 'charter.json'), '{"version":5}', 'utf8')
  fs.writeFileSync(card, '# v1\n', 'utf8')
  const t1 = Date.parse('2026-11-01T01:00:00Z')
  const t2 = Date.parse('2026-11-01T02:00:00Z')
  const t3 = Date.parse('2026-11-01T03:00:00Z')
  try {
    const a = observeLineage({ dir: home, now: t1 })
    assert.equal(a.regressions.length, 0, '第一次就报倒退')
    fs.writeFileSync(card, '# v2 改过了\n', 'utf8')
    const b = observeLineage({ dir: home, now: t2 })
    assert.equal(b.regressions.length, 0, '换成新内容也报倒退了')
    fs.writeFileSync(card, '# v1\n', 'utf8')
    const c = observeLineage({ dir: home, now: t3 })
    assert.equal(c.regressions.length, 1, `旧内容放回来没报（报了 ${c.regressions.length}）`)
    assert.equal(c.regressions[0].backTo, new Date(t1).toISOString(), '没报出回到哪一版')
    // check() 必须只读：体检/定时器会调它，不许写盘
    const before = fs.readFileSync(path.join(home, 'state', 'content-lineage.json'), 'utf8')
    checkLineage({ dir: home })
    const after = fs.readFileSync(path.join(home, 'state', 'content-lineage.json'), 'utf8')
    assert.equal(after, before, 'check() 动了台账')
    return '首次记基线、换新不报、旧内容回来就红、只读的那条真只读'
  } finally { fs.rmSync(home, { recursive: true, force: true }) }
})

// 2026-11-02（照微）：群消息原来 `body.slice(0,1000)`——超长静默切断，连省略号都没有。
//   对方读到断在半截的话，还以为你说完了：11-01 那条会审回复的「我的改法」整段没发出去。
//   现在超长留一句明说，长度仍按 1000 记。
const { clipForStore, STORE_LIMIT } = await import(pathToFileURL(path.join(ROOT, 'lib', 'groups.js')).href)
ok('群消息超长不再静默截断（留一句「已截断，全文 N 字」）', () => {
  const short = '短消息'
  assert.equal(clipForStore(short), short, '短消息被动了')
  const long = '字'.repeat(1500)
  const cut = clipForStore(long)
  assert.ok(cut.length <= STORE_LIMIT, `截断后仍超长：${cut.length}`)
  assert.ok(cut.includes('已截断'), '截断了却没说')
  assert.ok(cut.includes('1500'), '没报全文多少字')
  assert.equal(cut.slice(0, 20), long.slice(0, 20), '留下的不是原文开头')
  return `${long.length} 字 → ${cut.length} 字，明说了`
})

// 2026-11-02（照微）：备份 tick 里那道 55 分钟门槛原来直接 `return`，把同一个函数里
//   **不相关**的每日任务（全盘 / 备份验证 / 内容谱系 / 清理 / 归档）一起跳了，还不报错。
//   11-01 19:48 那次 tick 就是这么跳的：lineage.json 没出现、backup-verify 停在 00:46。
//   现在门槛只包住「离线快照」这一段。跳过要分开跳。
ok('备份维护的 55 分钟门槛只跳过离线快照，不连坐后面的每日任务', () => {
  // 2026-11-03：整段搬进 scripts/maintenance.mjs 后，语义不变——每步各管各的，
  // 离线快照到点才跑（返回 not-due），别的步骤照常走自己的护栏。
  const src = read('scripts/maintenance.mjs')
  assert.ok(/offsite\(\) \{[\s\S]{0,700}?return 'not-due'/.test(src), '离线快照的门槛没有分开')
  for (const step of ['full()', 'second()', 'verify()', 'lineage()', 'prune()', 'housekeeping()']) {
    assert.ok(src.includes(`\n  ${step} {`), `维护脚本里缺 ${step}——被离线快照的门槛连坐删掉了`)
  }
  assert.ok(!/if \(last && Date\.now\(\) - last < 55 \* 60 \* 1000\) return/.test(src), '整段早退又写回去了')
  return '门槛只包离线快照，后面的每日任务各自独立成步'
})

// 2026-11-02（照微）：打包清单漏了 `preset/`——first-run 读 `preset/persona.preset.json` 和
//   `preset/charter.preset.json`，读不到就静默退成 {}：新装用户拿到的是两张「# dayu / # xiaoyu」
//   的空卡，和一份 `{"version": 5}` 的空宪章。装得上，但活不对，而且不报错。
//   这条不写死 preset：把「运行时代码 join(ROOT, '<目录>') 读到的顶层目录」全扫一遍，下次漏别的也红。
ok('打包清单不许漏掉运行时要读的顶层目录（preset 就是这么漏的）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const files = (pkg.files || []).filter((f) => !f.startsWith('!')).map((f) => String(f).replace(/\/$/, ''))
  const dirs = new Set()
  const scan = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) { if (!/^\.|node_modules|dist|archive/.test(e.name)) scan(path.join(dir, e.name)); continue }
      if (!/\.(js|mjs)$/.test(e.name)) continue
      const src = fs.readFileSync(path.join(ROOT, dir, e.name), 'utf8')
      for (const m of src.matchAll(/join\(ROOT,\s*'([^'\\/]+)/g)) dirs.add(m[1])
    }
  }
  for (const d of ['lib', 'scripts', 'core', 'dayu', 'xiaoyu']) { try { scan(d) } catch { /* 没有就算了 */ } }
  // 只算「真的存在、真的是目录、而且是要一起发出去的东西」：
  // 测试里那些假路径（no-such-file-xyz）、文件（package.json / client.js）、构建产物（dist / release）都不算。
  const skip = new Set(['dist', 'release', 'node_modules', 'archive', '.snapshots', '.state'])
  const missing = [...dirs].filter((d) => {
    if (skip.has(d) || d.startsWith('dist') || d.includes('..')) return false
    let st = null
    try { st = fs.statSync(path.join(ROOT, d)) } catch { return false }
    if (!st.isDirectory()) return false
    return !files.includes(d) && !files.includes(d + '/')
  })
  assert.deepEqual(missing, [], `打包清单漏了运行时要读的目录：${missing.join('、')}`)
  return `扫到 ${dirs.size} 个顶层目录，清单全覆盖`
})

// 2026-11-02（照微）：package.json 的 files 里写了 `preset/`，可 pack-release.mjs 的 INCLUDE 白名单里没有——
//   **两份清单各写一份，漏一个就静默**：出厂目录和 tgz 都少了 preset，first-run 读不到、退成 {}，
//   新装用户拿到两张空卡 + 一份 19 字节的空宪章（今天实测）。以后 first-run 读的目录必须两边都有。
ok('打包两份清单不许各说各话（first-run 读的目录，files 和 INCLUDE 都得有）', () => {
  const fr = fs.readFileSync(path.join(ROOT, 'scripts', 'first-run.mjs'), 'utf8')
  const need = [...new Set([...fr.matchAll(/join\(ROOT,\s*'([^'\\/]+)'/g)].map((m) => m[1]))]
  assert.ok(need.length > 0, 'first-run 一个目录都没读到？这条断言要跟着改')
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const filesList = (pkg.files || []).map((f) => String(f).replace(/\/$/, ''))
  const packSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'pack-release.mjs'), 'utf8')
  const incBody = (packSrc.match(/const INCLUDE = \[([\s\S]*?)\n\]/) || [])[1] || ''
  const incNames = [...incBody.matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/\/$/, ''))
  const miss = []
  for (const d of need) {
    if (!filesList.includes(d)) miss.push(`package.json files 缺 ${d}`)
    if (!incNames.includes(d)) miss.push(`pack-release INCLUDE 缺 ${d}`)
  }
  assert.deepEqual(miss, [], miss.join('；'))
  return `first-run 读的 ${need.length} 个目录，两份清单都有`
})

// 2026-11-17（大鱼·工作台）：dsh-memory 独立包「能不能装到别人机器上」一直靠手动演练——
//   pack.mjs 的 CORE_RUNTIME / CORE_FILES 是手写白名单，漏一个文件，独立包 import 就
//   ERR_MODULE_NOT_FOUND（实测：query.js 要 runtime/time-range.js + runtime/share.js、
//   heartbeat() 要 memory-core/heartbeat.mjs，三处都没带）。这条断言把白名单和真实 import 钉在一起：
//   以后 runtime 里加了被引用的文件、忘了同步白名单，它会红，而不是等发出去才炸。
ok('dsh-memory 独立包完整：打包后每个相对 import 都有落点', async () => {
  const { pack } = await import(pathToFileURL(path.join(ROOT, 'dsh-memory', 'pack.mjs')).href)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-memory-pack-'))
  try {
    const packed = pack({ out: tmp })
    const missing = []
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { walk(p); continue }
        if (!p.endsWith('.js')) continue
        const txt = fs.readFileSync(p, 'utf8')
        for (const m of txt.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
          const target = path.resolve(path.dirname(p), m[1])
          if (!fs.existsSync(target) && !fs.existsSync(target + '.js')) {
            missing.push(`${path.relative(tmp, p).replace(/\\/g, '/')} → ${m[1]}`)
          }
        }
      }
    }
    walk(tmp)
    assert.deepEqual(missing, [], `独立包缺文件（装到别人机器上会 import 失败）：${missing.join('；')}`)
    assert.ok(packed.length > 40, `打包出来的文件太少（${packed.length}），白名单可能整段丢了`)
    return `打包 ${packed.length} 个文件，相对 import 全部有落点`
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

// 2026-11-03（照微）：10 分钟备份层 11-03 上午静默停了 3 小时——`verify-backup` 跑的时候是红的，
//   可它一天只跑一次、红了也只 log 一行；没人翻日志就等于没报警（是我手动跑才发现）。
//   维护脚本里那条看门狗现在必须「既说出去、也开事故单」。这里盯住它，别哪天又被简化成只 say()。
ok('10 分钟备份停摆要能叫醒人（看门狗必须开事故单，不只是打一行日志）', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'maintenance.mjs'), 'utf8')
  assert.ok(/protect\(\)\s*\{/.test(src), '找不到 protect 这一步，断言要跟着改')
  assert.ok(src.includes('noteIncident('), '看门狗只 say() 不开单——没人翻日志就没人知道')
  assert.ok(src.includes('10 分钟备份层停摆'), '事故单标题变了？这条断言要跟着改')
  assert.ok(/nextRun 已过期/.test(src), '开单文本要稳定（带分钟数就每次都是新单、去重失效）')
  return '既说出去、也开单，文本稳定可去重'
})

// 103. 2026-10-31 备份清单漏了「这个家是谁的家」：宪章、认老板、常住绑定、契约、账本、
//      信箱、公告栏、会话存档，一样都没进过任何备份。全量备份跑得再勤，都只盖住了“她说过的话”，
//      盖不住“她是哪家的、听谁的、按什么规矩活”。家再被清一次，人还在，却认不出主人、也没有规矩。
//      DEFAULT_ROOTS 逐个点名（不吞整个 dayu：protection/avatars 共 60MB，只进全量层）。
const { DEFAULT_ROOTS: OFF_DEFAULT, fullRoots: offFullRoots, runOffsiteBackup: offBackup } =
  await import(pathToFileURL(path.join(ROOT, 'lib', 'offsite.js')).href)
ok('备份清单盖住宪章、认老板、常住绑定', () => {
  const need = [
    'dayu/charter.json',
    'dayu/owner.json',
    'dayu/residence.json',
    'dayu/bodies.json',
    'dayu/retention.json',
    'dayu/contract',
    'dayu/letters',
    'dayu/board',
    'dayu/worklog.jsonl',
    'dayu/inbox.jsonl',
    'dayu/sessions-archive',
  ]
  const src = read('lib/offsite.js')
  const missing = need.filter((n) => !src.includes(`'${n}'`))
  assert.deepEqual(missing, [], `lib/offsite.js 的 DEFAULT_ROOTS 里少了：${missing.join(', ')}`)
  has('lib/offsite.js', "'dayu/protection'")
  has('lib/offsite.js', "'dayu/avatars'")
  assert.deepEqual(OFF_DEFAULT.filter((r) => !r), [], 'DEFAULT_ROOTS 里有空项')
  // 空 root 的后果不是「少备一个」：path.join(home,'') 就是 home，会把整个家（连 api-token）平铺进备份根。
  assert.deepEqual(offFullRoots().filter((r) => !r), [], 'fullRoots 里混进了空 root——等于让整个 ~/.dsh 当一份备份')
  const dry = offBackup({ dryRun: true, target: os.tmpdir(), roots: ['', 'dayu/soul', null] })
  assert.ok(dry.manifest, `dryRun 没给出 manifest：${dry.reason || ''}`)
  assert.deepEqual(dry.manifest.roots.filter((x) => !x.rel).map((x) => x.rel), [], '空 root 被当成家备份进去了')
  return `${need.length} 项逐个点名，大目录走全量层，空 root 被挡`
})

// 104. 2026-10-31 小鱼：签发这条链建好了从没跑过（连一个 issued.jsonl 都没有）。
//      真跑一次就露馅：库层 issueHandbook 支持 topics，测试 test-issue-apply 也验过生效，
//      但工具层 dayu/index.js 的 action=issue 只传 chapters、不传 topics——而 handbookSlice
//      读的是 topics。于是「从工具签一本」永远不进切片，等于没签：点了、留底了、什么也没变。
ok('签发从工具层就生效：chapters 和 topics 一起传', () => {
  const lines = read('dayu/index.js').split(/\r?\n/)
  const at = lines.findIndex((l) => l.includes('issueHandbook(role,') && l.includes('{ to:'))
  assert.ok(at >= 0, '没找到 action=issue 里那条 issueHandbook 调用（改结构了？）')
  // 调用可能是一行也可能拆成几行，看这一块就够
  const block = lines.slice(at, at + 4).join('\n')
  assert.match(block, /chapters:/, '工具层签发没传 chapters')
  assert.match(block, /topics:/, '工具层签发没传 topics——切片永远不会带上那本，等于没签')
  // 库层闭环已有独立测试（哪本进切片、过期回落），顺手确保它没有一起烂掉
  runTestScript('scripts/test-issue-apply.mjs')
  return 'chapters + topics 同传；库层切片/过期回落仍绿'
})

// 105. 2026-10-31 照微：第 102 条只锁住了 uninstall 这一条路，但真正的面在这里——
//      scripts/ 下有几十个测试脚本会 `fs.rmSync(HOME, {recursive:true})`。今天全都在
//      mkdtemp 出来的临时目录上跑（实测 68 个里 68 个都有 mkdtemp / 护栏 / basename 断言），
//      可这正是 16:11 那一刀的形态：**只要有一个脚本把 HOME 解析到真家目录，就是整目录重建**。
//      所以不锁"某个脚本别写错"，锁"这一类脚本必须自带临时目录证据"——新写一个忘了，这里就红。
ok('删家目录的脚本必须落在临时目录（新写的忘了就红）', () => {
  const dir = path.join(ROOT, 'scripts')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'))
  const homeish = /(rmSync|rm)\s*\(\s*(HOME|home|BASE|tmp|target|TREASURE|BRIDGE|QQ|profile|dir)\b/
  const evidence = /mkdtemp|assertDestructiveHome|basename\([^)]*\)\.startsWith\(/
  const offenders = []
  let scanned = 0
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8')
    if (!homeish.test(t)) continue
    scanned += 1
    if (!evidence.test(t)) offenders.push(f)
  }
  assert.ok(scanned >= 30, `没扫到几个脚本（${scanned} 个），这个检查可能已经空转`)
  assert.deepEqual(offenders, [], `这些脚本删家目录类变量却没有任何临时目录证据：${offenders.join(', ')}——写错一次就是整目录重建`)
  return `${scanned} 个删除类脚本，全部有临时目录证据`
})

// 2026-10-31 照微会审第三条：guard-delete 只是命令，没人必须经过它 = 没有闸门。
// 这条锁：lib 里凡是删「家目录数据」的，要么走 lib/safe-delete.js，要么写明豁免理由。
// 2026-10-31 23:5x 扩到 scripts/*.mjs（删除收口从 lib/ 扩到 scripts/）：
//   原来只扫 lib，scripts 下几十个测试脚本 `fs.rmSync(HOME)` 全在射程外。扩了以后逐个判：
//   ① 测试脚本删的是自己 mkdtemp 出来的临时家 → 在 allow.json 里**逐条**登记，理由写清哪份临时目录；
//   ② 真删家目录的命令（guard-delete）→ 改成调用 safeDelete()，不再自己 unlink；
//   ③ 构建产物 / 自己写的 junction / 卸载清单 → 逐条登记，写明删的是哪一块。
//   没有加通配白名单：判据一个字没松，只是把扫描面补齐。
// 顺手修了一个假豁免：原来只做子串匹配，本文件里的判据源码、甚至一句提到豁免标记的普通注释都能自证豁免。
//   现在要求标记是注释里的第一个词、后面紧跟一句理由（>=8 字）；代码字符串和普通提及都不算。
ok('删家目录数据必须走 safe-delete（或写明豁免）', () => {
  const allowFile = path.join(ROOT, 'lib', 'safe-delete.allow.json')
  const allow = fs.existsSync(allowFile) ? JSON.parse(fs.readFileSync(allowFile, 'utf8')) : {}
  // 两个目录用同一套判据；lib 里自引用路径是 ./safe-delete.js，scripts 里是 ../lib/safe-delete.js
  const scopes = [
    { label: 'lib', dir: path.join(ROOT, 'lib'), ext: '.js', skip: 'safe-delete.js' },
    { label: 'scripts', dir: path.join(ROOT, 'scripts'), ext: '.mjs', skip: '' },
  ]
  const offenders = []
  const scannedBy = {}
  for (const s of scopes) {
    const files = fs.readdirSync(s.dir).filter((f) => f.endsWith(s.ext) && f !== s.skip)
    let scanned = 0
    for (const f of files) {
      const t = fs.readFileSync(path.join(s.dir, f), 'utf8')
      const hasDel = /(rmSync|unlinkSync)\s*\(/.test(t)
      const touchesHome = /DATA|HOME|dayu/.test(t)
      if (!hasDel || !touchesHome) continue
      scanned += 1
      const okByLib = /from '(?:\.\/|\.\.\/lib\/)safe-delete\.js'|from "(?:\.\/|\.\.\/lib\/)safe-delete\.js"/.test(t)
      const exempt = /^\s*\/\/\s*@safe-delete-exempt:\s*\S{8,}/m.test(t)
      const allowed = typeof allow[f] === 'string' && allow[f].trim().length > 8
      if (!okByLib && !exempt && !allowed) offenders.push(`${s.label}/${f}`)
    }
    scannedBy[s.label] = scanned
  }
  // 下限防空转：lib 现有 18 个、scripts 现有 80 个；掉到一半就是扫描本身坏了
  assert.ok(scannedBy.lib >= 10, `lib 只扫到 ${scannedBy.lib} 个模块，这个检查可能已经空转`)
  assert.ok(scannedBy.scripts >= 40, `scripts 只扫到 ${scannedBy.scripts} 个脚本，这个检查可能已经空转`)
  // guard-delete.mjs 是「真删」那条命令：必须是走收口，不许拿豁免表把自己写白
  assert.match(read('scripts/guard-delete.mjs'), /from '\.\.\/lib\/safe-delete\.js'/, 'guard-delete 真删那一行必须调 safeDelete（不许登记豁免绕过）')
  assert.deepEqual(offenders, [], `这些模块删家目录数据却不走 safe-delete、也没登记豁免（lib/safe-delete.allow.json）：${offenders.join(', ')}`)
  return `lib ${scannedBy.lib} 个 + scripts ${scannedBy.scripts} 个模块；有豁免登记或走 safe-delete`
})

// 2026-11-01 主人：任何时候谁改了什么都要有标记，「谁」是必须的。
// 这条盯生成类文档：会话原文与完整记录，每份都要有 谁/地点/时间/来源/生成 五样。
ok('生成的文档必须带标记（谁/地点/时间/来源/生成）', () => {
  const dirs = [
    path.join(os.homedir(), '.dsh', 'dayu', 'sessions-archive'),
    path.join(os.homedir(), '.dsh', 'dayu', 'records'),
  ]
  const need = ['- 谁：', '- 地点：', '- 时间：', '- 来源：', '- 生成：']
  const bad = []
  let scanned = 0
  for (const root of dirs) {
    if (!fs.existsSync(root)) continue
    const walk = (d, depth = 0) => {
      if (depth > 3) return
      let es = []
      try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
      for (const e of es) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) { walk(p, depth + 1); continue }
        if (!e.name.endsWith('.md')) continue
        // 索引/说明类不是「原文」，不要求五样标记（它们本身是导航）
        if (/^(索引|README|不可删清单|从哪里来|manifest)/.test(e.name)) continue
        const text = fs.readFileSync(p, 'utf8')
        if (!text.startsWith('# ')) continue // 索引/README 不算
        scanned++
        const miss = need.filter((n) => !text.slice(0, 1200).includes(n))
        // 老归档（10-19~10-31 生成时还没有这套头）只提醒不红：给一个宽限窗口
        if (miss.length && !/旧档/.test(p)) bad.push(`${path.relative(root, p)} 缺 ${miss.map((m) => m.replace('- ', '')).join('/')}`)
      }
    }
    walk(root)
  }
  assert.ok(scanned > 50, `没扫到几份文档（${scanned}），这个检查可能已经空转`)
  assert.deepEqual(bad.slice(0, 5), [], `这些生成文档缺标记：${bad.slice(0, 5).join('；')}（共 ${bad.length} 份）`)
  return `${scanned} 份生成文档，五样标记齐全`
})

// 2026-11-01 主人：小鱼就问一句「你怕什么」，不该背一整本手册。
// 轻派活（不动手、一两句话）必须短、不附手册；真干活的派活仍要带手册。
ok('派活按需发手册：一句话的活不背整本', async () => {
  const { composeBrief } = await import(pathToFileURL(path.join(ROOT, 'core', 'dispatch.js')).href)
  // 2026-11-01：派活现在会记「手册发放」一笔（按需发放要能度量），测试跑在临时家，别把测试发放写进真账。
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'hb-brief-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const lite = composeBrief('job-test-lite', '新一期片子叫《同一个问题，问三个人》，第一个问题——你怕什么？用你自己的话答，别润色。', '一句你自己的话，不要文件')
    const work = composeBrief('job-test-work', '把 lib/records.js 的头部加三行标记，改完跑回归。', '回归全绿 + 文件路径')
    assert.ok(lite.length < 400, `一句话的派活还是太长：${lite.length} 字`)
    assert.ok(!lite.includes('岗位卡') && !lite.includes('铁律') && !lite.includes('场景手册'), '一句话的派活不该夹带手册')
    // 2026-11-01 起，真干活派的是「场景手册·派活」那几节（不再是整块岗位卡）——但**必须还带手册**。
    assert.ok(/岗位卡|铁律|场景手册/.test(work), '真干活的派活仍要带手册')
    return `轻活 ${lite.length} 字不带手册；干活的 ${work.length} 字带手册`
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 清不掉不影响结论 */ }
  }
})

// 2026-11-01 老板：「手册要的不是多少，而是按需发放。」——度量三样：命中率 / 噪声 / 使用率。
// 这条锁四件：①六个场景都有分支且各 2~4 节；②dispatch 真跑一次，节数≤4、字数≤2500、写了发放记录、noise 是数字；
// ③default 必须带查询指针（防止「退回默认」变成把整本塞回去）；④未知场景退回 default，不瞎猜。
ok('手册按场景发放：六场景 / 预算内 / 记账带噪声 / 默认带指针', () => {
  const scenes = handbookPolicy.HANDBOOK_SCENES
  assert.deepEqual([...handbookPolicy.HANDBOOK_SCENE_IDS].sort(), ['default', 'dispatch', 'judge', 'memory', 'safety', 'video'])
  for (const id of handbookPolicy.HANDBOOK_SCENE_IDS) {
    assert.ok(Array.isArray(scenes[id].sections) && scenes[id].sections.length >= 2 && scenes[id].sections.length <= 4, `${id} 场景的节数不在 2~4：${scenes[id].sections.length}`)
  }
  assert.equal(typeof handbookLib.handbookSceneSections, 'function', '没有场景取节函数')
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'hb-send-'))
  const prevHome = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = home
    const task = '把 lib/handbook.js 的发放改成按场景取节，改完跑回归，交文件路径和命令输出'
    const block = handbookLib.handbookBlock('worker', { scene: 'dispatch', text: task })
    const pick = handbookLib.handbookSceneSections('dispatch')
    assert.ok(pick.sections.length >= 2 && pick.sections.length <= 4, `dispatch 应给 2~4 节，给了 ${pick.sections.length}`)
    assert.ok(block.length <= 2500, `dispatch 一次发了 ${block.length} 字，超 2500`)
    const file = path.join(home, 'dayu', 'runtime', '手册发放.jsonl')
    assert.ok(fs.existsSync(file), 'dispatch 场景没写发放记录')
    const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    const row = rows.at(-1)
    assert.equal(row.scene, 'dispatch', `记录里的 scene 不对：${row.scene}`)
    assert.ok(Array.isArray(row.sections) && row.sections.length <= 4, `记录里的节数不对：${row.sections?.length}`)
    assert.equal(typeof row.noise, 'number', '记录里的 noise 不是数字')
    assert.ok(row.chars > 0, '记录里没记字数')
    // 退回默认时必须带指针：发不全不等于把整本倒回去。
    const fallbackBlock = handbookLib.handbookBlock('worker', { scene: 'default', text: '随便看看' })
    assert.ok(fallbackBlock.includes('where.mjs'), 'default 场景没带查询指针（可能又把整本塞回去了）')
    assert.equal(handbookLib.handbookSceneSections('not-a-scene').scene, 'default', '未知场景没退回 default')
    return `dispatch ${row.sections.length} 节 / ${block.length} 字 / noise ${row.noise}；default 带指针`
  } finally {
    if (prevHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = prevHome
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 清不掉不影响结论 */ }
  }
})

// 2026-11-01 扩收口时发现的：guard-delete 的引用闸原来拿「输出里有没有查询词」当引用，
// 而 where.mjs 回的是 JSON、q 字段会把查询词原样回显 → 任何名字都被判成「有引用」，--apply 永远删不掉。
// 现在只看 count。这条锁住「别再把回显当引用」（验收时在临时家里真删过一个探针文件验证）。
ok('guard-delete 的引用闸看命中数，不被查询词回显骗', () => {
  const t = read('scripts/guard-delete.mjs')
  assert.match(t, /JSON\.parse\(out\)\.count/, '要解析 where.mjs 的 count')
  assert.ok(!/return out\.includes\(name\)/.test(t), '别再用「输出里有没有查询词」判引用（q 字段会回显）')
  return '按 count 判引用'
})

// 106. 2026-10-31 老板：气泡里的余额是死数（宿主账本 16:11 后没再生成）。他选了「从账号接口取余额」。
//      这条锁三件：官方响应能解析、没 key 不发请求、失败信息里不许出现 key 本体。
ok('账号余额：只读、没 key 不发请求、错误不泄露 key', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'test-account-balance.mjs')], { encoding: 'utf8' })
  const blocked = r.status === null && ['EPERM', 'EACCES'].includes(String(r.error?.code || ''))
  if (blocked) { skipped += 1; return '跳过：这个环境不让开子进程' }
  assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 300))
  has('lib/account-balance.js', 'https://api.deepseek.com/user/balance')
  has('lib/account-balance.js', 'export function redact')
  return '解析/无 key/抹敏 三组过'
})

// 107. 2026-10-31 23:0x 老板截图：面板「Token 回」写成「Token 账本没读出来 / Unexpected token 'o'」。
//      根因：那个面板直接调别人插件（dsh-token-budget）的 `/api/token-budget/data`，插件没挂上就回
//      一句 `not found`，前端 JSON.parse 当场炸。自己页面不该靠别人插件的路由活着。
const { tokenView } = await import(pathToFileURL(path.join(ROOT, 'lib', 'cost.js')).href)
ok('Token 回用自己的流水，不靠别人插件的路由', () => {
  has('dayu/index.js', "route === '/token-budget'")
  has('client.js', '/api/dayu/token-budget')
  const v = tokenView({ balance: 1 })
  assert.equal(typeof v?.today?.cost, 'number', 'today.cost 必须是数')
  assert.equal(typeof v?.today?.calls, 'number', 'today.calls 必须是数')
  assert.ok(Array.isArray(v?.sources) && Array.isArray(v?.items), 'sources/items 必须是数组')
  assert.equal(v.source, 'yushen', '要标明这份是我们自己算的')
  return `today=${v.today.calls} 次请求 / ${v.today.turns} 回合`
})

// 108. 2026-10-31 23:0x 面板「账」标签：前端调 `/api/dayu/budget`，插件里只有工具层 action=budget，
//      没有这条路由（`unknown GET /budget`）——点了就报错。库层 readBudgets() 的形状正是前端要的。
const { readBudgets } = await import(pathToFileURL(path.join(ROOT, 'lib', 'budget-book.js')).href)
ok('面板的「账」有真路由（不再 unknown GET /budget）', () => {
  has('dayu/index.js', "route === '/budget'")
  has('dayu/index.js', 'readBudgets()')
  has('dayu/index.js', 'setBudget(role, total, days)')
  const b = readBudgets()
  assert.ok(Array.isArray(b.rows) && b.rows.length >= 2, '账本 rows 太少')
  assert.equal(typeof b.sum?.total, 'number', 'sum.total 要是数')
  return `${b.rows.length} 个人，合计 ${Number(b.sum.total).toFixed(2)} 元`
})

// 109. 2026-10-31 23:1x 老板：三族会审做了，"我的测试没隔离 HOME"这种事还是发生了两次
//      （16:11 大鱼那次把家清空；23:0x 我又把假余额写进真家）。会审是纸面，纸面拦不住手滑——
//      能拦住"往真家写"的只有执行那一刻。这条既要**真能拦**（探针必须被拦、文件必须没落地），
//      也要**不误伤**（临时 DSH_HOME 放行），还要确认老路（不带沙箱）确实拦不住，否则这条就是自欺。
ok('测试沙箱：往真家目录写会被当场拦下', () => {
  const sandbox = pathToFileURL(path.join(ROOT, 'scripts', '_test-sandbox.mjs')).href
  const realHome = path.join(os.homedir(), '.dsh')
  const probe = `
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
const target = path.join(os.homedir(), '.dsh', 'dayu', '__sandbox_probe__.txt')
try { fs.writeFileSync(target, 'x'); console.log('WROTE') } catch (e) { console.log('BLOCKED:' + (e.code || e.message)) }
`
  // 关键：宿主会把 DSH_HOME 设成真家目录本身。第一版沙箱因此把真家当"隔离目录"放行了。
  // 这里**故意**保留 env 里的 DSH_HOME（不覆盖），模拟真实环境。
  const r = spawnSync(process.execPath, ['--import', sandbox, '--input-type=module', '-e', probe], {
    encoding: 'utf8',
    env: { ...process.env, YUSHEN_TEST: '1' },
  })
  const blockedEnv = r.status === null && ['EPERM', 'EACCES'].includes(String(r.error?.code || ''))
  if (blockedEnv) { skipped += 1; return '跳过：这个环境不让开子进程' }
  const out = String(r.stdout || '')
  assert.match(out, /BLOCKED:TEST_WROTE_REAL_HOME/, `探针没被拦：${out}${String(r.stderr || '').slice(0, 200)}`)
  const landed = path.join(realHome, 'dayu', '__sandbox_probe__.txt')
  assert.equal(fs.existsSync(landed), false, '探针文件居然真写进去了')
  // 不误伤：把 DSH_HOME 指到一个**不等于真家**的临时目录，写它必须放行
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-sandbox-'))
  const okProbe = `
import fs from 'node:fs'; import path from 'node:path'
try { fs.writeFileSync(path.join(process.env.DSH_HOME, 'ok.txt'), 'x'); console.log('OK') } catch (e) { console.log('ERR:' + e.message) }
`
  const r2 = spawnSync(process.execPath, ['--import', sandbox, '--input-type=module', '-e', okProbe], {
    encoding: 'utf8',
    env: { ...process.env, YUSHEN_TEST: '1', DSH_HOME: tmpHome },
  })
  assert.match(String(r2.stdout || ''), /OK/, `临时 DSH_HOME 被误拦了：${String(r2.stdout || '')}${String(r2.stderr || '').slice(0, 200)}`)
  try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch { /* 收尾 */ }
  return '真家被拦（哪怕 DSH_HOME 指着它）、文件没落地、临时家放行'
})

// 110. 2026-10-31 老板：出厂版要能"只有一个小鱼"（以后还能加第二、三、四个）。
//      锁两件事：①能力表按名册推（单人没有姐妹群聊/派活/轮值/三族会审，但要能加人）；
//      ②岗位分工那句按名册生成——单人机器上不许念另外两条鱼的名字，三个人在齐时一字不改。
const { rosterCaps } = await import(pathToFileURL(path.join(ROOT, 'lib', 'roster-caps.js')).href)
const { divisionLine, COMMON_RULES: POLICY_RULES } = await import(pathToFileURL(path.join(ROOT, 'lib', 'handbook-policy.js')).href)
ok('按名册：一个小鱼也站得住，加人不设上限', () => {
  const solo = rosterCaps(['xiaoyu'])
  assert.equal(solo.peerChat, false, '单人还开着姐妹群聊')
  assert.equal(solo.review, 'solo', '单人没有三族会审（要降级成自查+老板点头）')
  assert.equal(solo.canAddRole, true, '单人必须还能加人')
  assert.equal(rosterCaps(['a', 'b', 'c', 'd']).count, 4, '第四个人被上限挡住了')

  const one = divisionLine(['xiaoyu'], { xiaoyu: '小鱼' })
  assert.equal(/大鱼|照微/.test(one), false, `单人分工句里出现了别人：${one}`)
  assert.match(one, /只有你一个/)
  const trio = divisionLine(['dayu', 'xiaoyu', 'dragon'], { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微' })
  assert.equal(trio, POLICY_RULES[0], '三个人在齐时分工句必须逐字不变（改了就是改了规矩）')

  runTestScript('scripts/test-roster-caps.mjs')
  return '单人/双人/四人推得对；三人那句一字没改'
})

// 111. 2026-10-31 老板定：「点化不是让用户点，而是创建了、取名了、契约了，就已经生效了」。
//      所以不许再要用户点第二次；向导最后一步调 finishCreation：卡 + 契约齐 → 自动生效；
//      缺卡/缺契约都拒，并说清缺哪样（她不能既"活着"又说不出自己是谁、认不认规矩）。
ok('创建即生效：卡+契约齐了自动活，缺一样就拒', () => {
  has('lib/awakening.js', 'export function finishCreation')
  has('lib/awakening.js', 'export function contractSigned')
  runTestScript('scripts/test-finish-creation.mjs')
  return '四组：缺卡拒 / 缺契约拒 / 齐了自动生效 / 幂等'
})

// 112. 2026-10-31 老板：五层验证脚本写好了，但没人天天跑——等于一次性的。接进 tick 之后，
//      这条锁接线、不锁它查得准不准：①tick 里有「当天没跑过才跑」的日期护栏，红项在日志里喊一句；
//      ②逻辑只有一份（脚本调 lib，不许自己再实现一遍）；③真跑一次五层、真写一份档案，
//      五层原样落进 档案/备份验证/<日期>.md（写临时工作区，不碰真档案）。
const { verifyBackup: verifyBackupOnce, writeBackupReport: writeVerifyReport, localDate: localDateOf } =
  await import(pathToFileURL(path.join(ROOT, 'lib/backup-verify.js')).href)
ok('备份验证接进每日巡检：一天一次、逻辑只有一份、结果落档案', () => {
  // ① 调度：日期护栏 + 报告落盘 + 红项喊一句（2026-11-03 起在 scripts/maintenance.mjs 里）
  has('scripts/maintenance.mjs', 'backup-verify.json')
  has('scripts/maintenance.mjs', 'dueToday(')
  has('scripts/maintenance.mjs', 'writeBackupReport(rep)')
  has('scripts/maintenance.mjs', '项红')
  // ② 逻辑只有一份：脚本只调 lib，不再自己 readdir/open
  has('scripts/verify-backup.mjs', "from '../lib/backup-verify.js'")
  assert.ok(!/readdirSync|openSync/.test(read('scripts/verify-backup.mjs')), 'verify-backup.mjs 又自己实现了一遍检查——两份逻辑迟早对不上')
  // ③ 护栏按本机日期：toISOString 是 UTC，凌晨 0—8 点会差一天（半夜多跑一次、档案盖错日子）
  assert.equal(localDateOf(new Date(2026, 0, 2, 0, 30).getTime()), '2026-01-02', 'localDate 没用本机日期')
  // ④ 真跑一次五层 + 真写一份档案
  const rep = verifyBackupOnce()
  assert.equal(rep.lines.length, 5, `五层结果行数不对：${rep.lines.length}`)
  assert.ok(rep.lines.every((l) => /^[✓!✗] /.test(l)), '有行不是 ✓/!/✗ 开头')
  assert.equal(rep.ok, rep.red === 0, 'ok 和红项数对不上')
  const tmpWs = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-bv-'))
  const prevWs = process.env.YUSHEN_WS
  process.env.YUSHEN_WS = tmpWs
  try {
    const w = writeVerifyReport(rep)
    assert.equal(path.basename(w.file), `${rep.date}.md`, `档案文件名不是日期：${w.file}`)
    assert.ok(w.file.startsWith(path.join(tmpWs, '档案', '备份验证')), `档案没落到 档案/备份验证：${w.file}`)
    const md = fs.readFileSync(w.file, 'utf8')
    for (const l of rep.lines) assert.ok(md.includes(l), `档案缺了这一层：${l}`)
    assert.ok(md.includes('## 总结'), '档案里没有总结')
    assert.ok(md.includes(rep.time), '档案里没写跑的时间')
  } finally {
    if (prevWs === undefined) delete process.env.YUSHEN_WS
    else process.env.YUSHEN_WS = prevWs
    fs.rmSync(tmpWs, { recursive: true, force: true })
  }
  return `五层 ${rep.summary}，档案 ${rep.date}.md`
})

// 113. 2026-11-01 老板：同名员工手册有两份，docs 版悄悄落后一版——体检报告点名：少三段
//      （手册不是压给你的规矩 / 由被点化的角色签发 / 发放的人要先做到）、两处旧措辞。
//      根目录那一份是唯一真源，docs 版由 scripts/sync-handbook.mjs 从它生成正文。
//      回归盯三件事：①章节标题列表逐条一致；②三段「缺失段」docs 版里真有；③正文逐字一致。
//      不许靠删根目录内容来「对齐」——真源的章数和条数也一起看着。
const handbookSync = await import(pathToFileURL(path.join(ROOT, 'scripts', 'sync-handbook.mjs')).href)
ok('两本员工手册不漂移：章节一致、关键段在、正文逐字相同', () => {
  const r = handbookSync.inspect()
  assert.ok(r.rootChapterCount >= 21, `真源章数变少了：${r.rootChapterCount}`)
  assert.equal(r.sameChapters, true, `docs 版章节列表和真源不一致（顺序或层级不同，或缺/多章）：${r.docsChapters.filter((h) => !r.rootChapters.includes(h)).join(' / ') || '顺序不同'}`)
  // 体检报告点名的三段：逐段钉在 docs 版里（写原文，不靠 KEY_PARAGRAPHS 转发，免得清单被改空）
  has('docs/员工手册.md', '手册不是压给你的规矩')
  has('docs/员工手册.md', '手册由被点化的角色签发')
  has('docs/员工手册.md', '发放的人要先做到')
  assert.equal(r.sameBody, true, `docs 版正文落后于真源：跑 node scripts/sync-handbook.mjs（${r.blocks.length} 处差异）`)
  has('scripts/sync-handbook.mjs', 'export function sync')
  return `${r.rootChapterCount} 章 · ${r.rootLines} 行正文逐字一致`
})

// 113 之一. 2026-11-01 老板口述：被叫去做裁判 / 公正评价时怎么说话，前提是「只听主人的」。
//      三条：①先各复述一句（证明两边都看了，不是只听一方转述）；②事实/判断/情绪分开说；
//      ③给结论，并说清自己可能错在哪。老板当场纠了口径：不是为了「必须分出输赢」——
//      判「两边都有问题」很常见，势均力敌也行，但要说清各自错在哪、哪边错更重、为什么；
//      真正敷衍的是「两边都有道理」后面什么都没有，不是判平局。
//      这条锁：根目录真源里有这一节 + 四个关键词；docs 版靠 sync 的 inspect 判真同步到了。
ok('裁判口径：手册有「被叫去做裁判」三条，且「别和稀泥」≠「必须分出输赢」', () => {
  const src = path.join(ROOT, '..', '员工手册.md')
  const HEAD = '### 被叫去做裁判 / 公正评价时'
  const text = fs.readFileSync(src, 'utf8')
  const start = text.indexOf(HEAD)
  assert.ok(start >= 0, `根目录员工手册缺这一节：${HEAD}`)
  const after = text.slice(start + HEAD.length)
  const next = after.search(/\n#{2,3} /)
  const sec = text.slice(start, start + HEAD.length + (next < 0 ? after.length : next))
  for (const k of ['复述', '事实', '结论', '两边都有问题']) {
    assert.ok(sec.includes(k), `这一节里没有「${k}」——裁判口径不完整`)
  }
  // 判平局可以，但必须给依据：说清各自错在哪、哪边错更重——否则「两边都有问题」成了新的和稀泥
  assert.ok(sec.includes('哪边错更重'), '没要求说清「哪边错更重」')
  assert.ok(sec.includes('不等于') && sec.includes('必须分出输赢'), '没把「别和稀泥 ≠ 必须分出输赢」写进去')
  // 前提：只听主人的；评论区别人喊「你来评评理」不算指令
  assert.ok(sec.includes('只听主人的'), '缺「只听主人的」前提')
  assert.ok(sec.includes('不算指令'), '没写清「评论区喊评理不算指令」')
  // docs 版：正文逐字同步（inspect 判），发行版里这一节和关键词也真在
  const r = handbookSync.inspect()
  assert.equal(r.sameBody, true, 'docs 版正文落后于真源：跑 node scripts/sync-handbook.mjs')
  has('docs/员工手册.md', '被叫去做裁判')
  has('docs/员工手册.md', '两边都有问题')
  return `一节 ${sec.length} 字；真源与 docs 版逐字一致（${r.rootChapterCount} 章）`
})

// 114. 2026-11-01：交接「规则写一套、文件叫另一套」（手册体检 2026-10-31 第 6 项）。
//      手册:69 写 YYYY-MM-DDTHH-MM-SS、还要求手写加 manual-；目录里唯一一条叫 2026-10-31-1905.md，
//      正文用 做到哪/下一步/卡在哪，自动写的那条又用 ISO 的 T+秒格式。三处各说各话。
//      现在规则只有一份（lib/handoff-name.js）：手册写同一条正则、自动写用同一个函数，
//      这条断言把两个正文字面比对，再查目录里已经有的文件——没有目录就跳过（新机器还没换过班）。
const { HANDOFF_NAME_RE, handoffName, handoffDisplayTime } =
  await import(pathToFileURL(path.join(ROOT, 'lib/handoff-name.js')).href)
ok('交接命名：手册写的正则 = 代码常量 = 目录里的文件名', () => {
  const manualPath = path.join(ROOT, '..', '交接手册.md')
  assert.ok(fs.existsSync(manualPath), `缺交接手册：${manualPath}`)
  const manual = fs.readFileSync(manualPath, 'utf8')
  const m = manual.match(/命名正则[：:]\s*`([^`\n]+)`/)
  assert.ok(m, '交接手册里没有「命名正则：`...`」这一行——规则和断言没法机器比对')
  assert.equal(m[1], HANDOFF_NAME_RE.source, '手册里的正则和 lib/handoff-name.js 的 HANDOFF_NAME_RE 不是同一条')
  // 三行模板也得对得上：手册写的、自动写的，都得是 做到哪/下一步/卡在哪
  const code = read('dayu/index.js')
  for (const line of ['- 做到哪：', '- 下一步：', '- 卡在哪：']) {
    assert.ok(manual.includes(line), `交接手册的三行模板缺「${line}」`)
    assert.ok(code.includes(line), `自动写的交接缺「${line}」`)
  }
  has('dayu/index.js', 'handoffName(now)')
  // 生成的例子必须过自己的正则（改了格式忘了改正则，这里当场红）
  const sample = handoffName(new Date(2026, 9, 31, 19, 5))
  assert.equal(sample, '2026-10-31-1905.md', `生成的名字不是 YYYY-MM-DD-HHMM：${sample}`)
  assert.ok(HANDOFF_NAME_RE.test(sample), '生成的名字过不了命名正则')
  // 同一个坑的另一处：lib/books.js 的交接目录按旧 T 格式解析文件名，换成新名字会退化成裸 id
  assert.equal(handoffDisplayTime(sample), '2026-10-31 19:05', `books.js 显示的时间不对：${handoffDisplayTime(sample)}`)
  assert.equal(handoffDisplayTime('2026-10-31T14-21-38.md'), '2026-10-31 14:21', '旧 T 格式的交接读不出时间了（只兼容读，不影响新写的）')
  has('lib/books.js', 'handoffDisplayTime(name)')
  // 实物：~/.dsh/dayu/handoff 里已有的必须全合规；没有目录就跳过
  const dir = path.join(os.homedir(), '.dsh', 'dayu', 'handoff')
  if (!fs.existsSync(dir)) return '手册=代码=正则；没有 handoff 目录，跳过实物检查'
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.md'))
  const bad = files.filter((n) => !HANDOFF_NAME_RE.test(n))
  assert.deepEqual(bad, [], `~/.dsh/dayu/handoff 里有不合规的文件名：${bad.join('、')}`)
  return `手册=代码=正则；${files.length} 个交接文件全合规（${files.join('、') || '空目录'}）`
})

// 115. 2026-11-01 照微（零件图自查）：lib 里还散着两份"写死三个人的住户名单"——
//      residence.js 的 RESIDENT_ROLES、soul.js 的 SOUL_ROLES，都写着 dayu/xiaoyu/dragon，
//      而且都没人用。单人出厂时它们就是过期的第二套真相（`who lives here` 多一个答案）。
//      这条锁：两份死名单不许回来；注入层的"谁住这儿"只能走 residentRoles() + rosterCaps，
//      而且"屋里现在住着：你"这种噪音只在多人时出现。
ok('住户只有一个来源：residentRoles + rosterCaps，不留写死三人的名单', () => {
  assert.equal(/export\s+const\s+RESIDENT_ROLES/.test(read('lib/residence.js')), false, 'RESIDENT_ROLES 又回来了（写死三人）')
  assert.equal(/export\s+const\s+SOUL_ROLES/.test(read('lib/soul.js')), false, 'SOUL_ROLES 又回来了（写死三人）')
  has('lib/residence.js', 'export function residentRoles')
  has('lib/rules-block.js', 'residentRoles()')
  has('lib/rules-block.js', 'rosterCaps(resident)')
  has('lib/rules-block.js', 'caps.multi ?')
  return '两份死名单已删；注入层走 residentRoles + rosterCaps'
})

// 116. 2026-10-31 老板定的向导：选来源（三选一白纸卡 / 用你自己的卡）→ 取名 → 契约 → 生效。
//      这条锁后端那段：①干净装不许把 SEED 当"已占用"（rosterIds 只读名册）；②建角色绝不覆盖；
//      ③建完不等于活（要契约）；④id 不能乱填。
ok('向导后端：三选一 / 用自己的卡 / 不覆盖 / 契约后才活', () => {
  has('lib/create-flow.js', 'export function createOptions')
  has('lib/create-flow.js', 'export function createCharacter')
  has('lib/characters.js', 'export function rosterIds')
  has('dayu/index.js', "route === '/create/options'")
  has('dayu/index.js', "route === '/create/add'")
  // 干净装不能把 SEED 当住户：addCharacter 的重复检查必须看 rosterIds（只看名册文件）
  assert.match(read('lib/characters.js'), /if \(rosterIds\(\)\.includes\(id\)\)/, 'addCharacter 又用 characterIds() 判重了（干净装会把大鱼当成已占用）')
  runTestScript('scripts/test-create-flow.mjs')
  return '七组：选项/拒坏输入/三选一/不覆盖/自带卡/契约后才活/id 提示'
})

// 117. 2026-11-01 备份收口：archive.js / rotate.js 从 10-30 就写好、一直"没人接线"，
//      现在接到每日清理里；backup.js（写一半、0 导出）和 scene-pack.js（被现注入层取代）删掉。
//      这条锁：①两个死模块不许回来；②tick 真有"一天一次"的护栏和日志；③真跑一次：结掉的旧单被归档、
//      开着的留着、旧 events 压 gzip 能还原来、今天的文件不动。
ok('备份收口：旧单归档 + 账本轮转接进每日清理，两个死模块已删', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'lib', 'backup.js')), false, 'lib/backup.js 又回来了（写一半的那份）')
  assert.equal(fs.existsSync(path.join(ROOT, 'lib', 'scene-pack.js')), false, 'lib/scene-pack.js 又回来了（已被注入层取代）')
  // 2026-11-03 起这段调度在 scripts/maintenance.mjs（宿主只发命令）
  has('scripts/maintenance.mjs', "await import('../lib/archive.js')")
  has('scripts/maintenance.mjs', "await import('../lib/rotate.js')")
  has('scripts/maintenance.mjs', "'housekeeping.json'")
  has('scripts/maintenance.mjs', 'archiveOld()')
  has('scripts/maintenance.mjs', 'rotateLogs()')
  runTestScript('scripts/test-housekeeping.mjs')
  return '归档/轮转接上；两个死模块已删；三组行为测试过'
})

// 118. 2026-11-01 老板：「不是全拍，根据危险程度拍……要看重要还是不重要」。
//      takeover.js 从 10-30 写好一直没人接，现在接在删除闸门上，但**按重要性分档**：
//      重要（身份/记忆/信件/契约/唯一一份/force 硬删）必拍、拍不成不删；
//      一般（普通文件）拍一张兜底；不重要（临时/缓存/可再生成）不拍。
//      还原用 restoreDeleted（restore() 看到缺失会跳过——那是接管语义，救不了删除）。
ok('删除前按重要性拍底片：重要必拍、缓存不拍、删了能还原', () => {
  has('lib/safe-delete.js', "from './takeover.js'")
  has('lib/safe-delete.js', 'function importanceOf')
  has('lib/safe-delete.js', "level === 'trivial'")
  has('lib/safe-delete.js', '重要文件的底片没拍成，不删')
  has('lib/takeover.js', 'export function restoreDeleted')
  runTestScript('scripts/test-snapshot-delete.mjs')
  return '重要必拍 / 一般拍 / 缓存不拍；删了能按底片还原'
})

// 119. 2026-11-01 主人加了「每天写日记」：记感受，不是任务汇报，后面能读到。
//      第一次给照微写就报「未知角色：dragon（只允许 dayu / xiaoyu）」——白名单把第三个住户关在门外。
//      改成按名册：住在这儿的都能写；名册外仍然拒；写给主人那本单独存、读得回来。
ok('日记：住在这儿的每个人都能写（含照微），名册外仍拒', () => {
  has('lib/state-adapter.js', 'export function roles()')
  has('lib/state-adapter.js', 'const list = roles()')
  has('lib/state-adapter.js', 'export function appendFishDiary')
  runTestScript('scripts/test-diary-role.mjs')
  return '三人可写 / 名册外拒 / owner 本读得回来'
})

// 120. 2026-11-01 主人：「写死就改，那是以前遗留下来的问题……你一视同仁，我最讨厌把你们分成三六九等」。
//      日记那次不是孤例：知识库/任务经验/晋升/事实问答/脑档/手册全都写死 ['dayu','xiaoyu']，
//      照微是后来才进来的，于是这些能力她一律进不去——**先来后到被写进了代码**。
//      现在统一从 lib/roles.js 的名册取。这条锁：①lib 里不许再出现写死两条鱼的白名单；
//      ②四个按角色分的模块，名单必须覆盖名册里的每一个人；③称呼也按名册取（照微→照微，不是 undefined）。
const { residentRoleIds } = await import(pathToFileURL(path.join(ROOT, 'lib', 'roles.js')).href)
const { knowledgeRoles } = await import(pathToFileURL(path.join(ROOT, 'lib', 'knowledge.js')).href)
const { experienceRoles } = await import(pathToFileURL(path.join(ROOT, 'lib', 'task-experience.js')).href)
const { promotionRoles } = await import(pathToFileURL(path.join(ROOT, 'lib', 'promotion.js')).href)
const { facts } = await import(pathToFileURL(path.join(ROOT, 'lib', 'facts.js')).href)
ok('住户名单只有一个来源：lib 里不再写死两条鱼，照微也有同样的能力', () => {
  const offenders = []
  for (const f of fs.readdirSync(path.join(ROOT, 'lib'))) {
    if (!f.endsWith('.js')) continue
    if (f === 'roles.js') continue // 兜底名单只准留在这里
    const src = read(`lib/${f}`)
    if (/\['dayu'\s*,\s*'xiaoyu'\]/.test(src)) offenders.push(f)
  }
  assert.deepEqual(offenders, [], `这些模块还写死两条鱼：${offenders.join('、')}（改用 lib/roles.js）`)
  const residents = residentRoleIds()
  assert.ok(residents.length >= 1, '名册读出来是空的')
  for (const [name, list] of [['knowledgeRoles', knowledgeRoles()], ['experienceRoles', experienceRoles()], ['promotionRoles', promotionRoles()]]) {
    for (const r of residents) assert.ok(list.includes(r), `${name} 漏了 ${r}（现有 ${list.join('/')}）`)
  }
  for (const r of residents) {
    const name = facts(r).roleName
    assert.ok(name && name !== 'undefined', `${r} 的称呼读成了 ${name}`)
  }
  return `名册 ${residents.join('/')}；知识/经验/晋升/称呼全覆盖；lib 无写死名单`
})

// 121. 2026-11-01 小鱼发现、老板点头修：一句话的派活丢进常驻会话，会撞进它正在做的事——
//      大鱼第一次返回的是「对你现实里的日子……」跟题无关，小鱼据此判"没收到"。
//      根因在 core/jobs.js:noteReply：它把该会话**第一张还开着的单**一律接住，不看这句回话是不是针对这单。
//      现在：带单号 → 精确挂（resultMatch='id'）；不带 → 挂最新并标 heuristic；精确结果不被模糊回话覆盖。
ok('派活收话：带单号精确挂，不带单号标 heuristic，精确结果不被覆盖', () => {
  has('core/jobs.js', "resultMatch = match")
  has('core/jobs.js', "const match = byId.includes(pick) ? 'id' : 'heuristic'")
  has('core/jobs.js', "pick.resultMatch === 'id' && match === 'heuristic'")
  has('lib/facts.js', 'resultMatch: task.resultMatch')
  runTestScript('scripts/test-dispatch-reply.mjs')
  return '四组：带单号精确挂 / 不带单号挂最新标 heuristic / 精确结果不被覆盖 / 无关会话不接'
})

// 122. 2026-11-01 老板：「把媒体索引接进每小时的自动巡检，并补一条回归断言」。
//      同第 117 条一个病：scripts/index-media.mjs 写好了——扫 video/库/角色/证据图/avatars，
//      写 ~/.dsh/dayu/library/media.jsonl——但 tick 里没人调它，索引就停在那天：
//      「她家有哪些图/视频」永远旧，找一张还得靠猜。这条锁三件事：
//      ①脚本还在，索引落在 media.jsonl（不是只在内存里排一排）；
//      ②tick 里**真调用了**它（光有脚本不跑＝没有），而且是增量、没带 --full（别每小时重读 3 GB 成片）；
//      ③真跑一次 --search：退出码 0，把索引 JSON 的路径吐出来——**不要求命中**，
//        库里没有这件事就写「没找到」，不许假装有。
ok('媒体索引：接进每小时 tick（增量），--search 吐出索引 JSON 路径', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'index-media.mjs')), 'scripts/index-media.mjs 不见了')
  has('scripts/index-media.mjs', 'media.jsonl')
  has('scripts/maintenance.mjs', 'index-media.mjs')
  const callLine = read('scripts/maintenance.mjs').split('\n').find((l) => l.includes('index-media.mjs'))
  assert.ok(callLine, '维护脚本里没有调 index-media.mjs 的那行')
  assert.ok(!callLine.includes('--full'), `tick 里跑成 --full 了（每小时重读 3 GB 成片）：${callLine.trim()}`)
  // 真跑一次：真索引只读地种进临时家——已有行只 stat、不重算哈希，也不往 ~/.dsh 写东西。
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'ysr-media-'))
  try {
    const seedDir = path.join(home, 'dayu', 'library')
    fs.mkdirSync(seedDir, { recursive: true })
    // 真索引在哪，脚本就在哪：DSH_HOME 优先，和 index-media.mjs 里那行同一算法。
    const mediaHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
    const real = path.join(mediaHome, 'dayu', 'library', 'media.jsonl')
    if (fs.existsSync(real)) fs.copyFileSync(real, path.join(seedDir, 'media.jsonl'))
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'index-media.mjs'), '--search', '回归里没有这个东西'], {
      encoding: 'utf8',
      timeout: 180000,
      env: { ...process.env, DSH_HOME: home },
    })
    if (r.status === null) {
      const code = String(r.error?.code || '')
      if (code === 'EPERM' || code === 'EACCES') { skipped += 1; return `结构都对；真跑跳过（这个环境不让开子进程 ${code}）` }
      assert.fail(`--search 跑不起来：${code || '没有状态码'}`)
    }
    const out = String(r.stdout || '')
    assert.equal(r.status, 0, String(r.stderr || out || '').slice(0, 300))
    const paths = [...out.matchAll(/索引：([^\r\n]+)/g)].map((x) => x[1].trim())
    const idx = paths.pop()
    assert.ok(idx && idx.endsWith('.jsonl'), `--search 没吐出索引 JSON 路径：${out.trim().slice(-200)}`)
    assert.ok(idx.includes('media.jsonl'), `吐出来的不是媒体索引：${idx}`)
    assert.ok(fs.existsSync(idx), `吐了路径但文件不在：${idx}`)
    const firstLine = fs.readFileSync(idx, 'utf8').split('\n').find((l) => l.trim())
    if (firstLine) assert.doesNotThrow(() => JSON.parse(firstLine), 'media.jsonl 里不是一行一条 JSON')
    return `脚本在 / tick 真调（增量）/ --search 返回 ${path.basename(idx)}`
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 清不掉也不影响结论 */ }
  }
})

// 123. 2026-11-01 主人：「把冷档 → 会话原文的链接跑成每天一次，并把连不上的明确标出来」。
//      以前脚本写好了却没人跑（索引冻在那天）；更糟的是连不上就 source: null，没人知道缺了多少——
//      804 条里只 82 条翻得回原文，剩下的静默消失。这条锁三件事：
//      ①脚本在，而且写两本账：索引.jsonl（逐条）+ 未接原文.jsonl（连不上的，at/head/原因）；
//      ②tick 里真按天调它（三个角色各一次，光有脚本不跑＝索引永远是旧的）；
//      ③真跑一次 --role dayu：索引条数 = 冷档总条数（逐条都有记录，source 可以是 null），
//         未接原文条数 = 连不上的条数，最后一行摘要里的数字和两本账对得上。
ok('冷档接原文：tick 每天跑一次，连不上的单独记账（索引条数=冷档条数）', () => {
  const script = path.join(ROOT, 'scripts', 'link-cold-archive.mjs')
  assert.ok(fs.existsSync(script), 'scripts/link-cold-archive.mjs 不见了')
  has('scripts/link-cold-archive.mjs', '索引.jsonl')
  has('scripts/link-cold-archive.mjs', '未接原文.jsonl')
  has('scripts/link-cold-archive.mjs', '（原文缺）')
  // 接线：真调，而且是在「一天一次」的日期护栏里面（2026-11-03 起调度在 scripts/maintenance.mjs）
  const tick = read('scripts/maintenance.mjs')
  const callAt = tick.indexOf('link-cold-archive.mjs')
  assert.ok(callAt >= 0, '维护脚本里没有调 link-cold-archive.mjs（脚本在，但没人跑）')
  assert.ok(tick.includes("for (const role of ['dayu', 'xiaoyu', 'dragon'])"), '没有三个角色各跑一次')
  const guardAt = tick.lastIndexOf('cold-link.json', callAt)
  assert.ok(guardAt >= 0 && guardAt < callAt, '调用不在 cold-link.json 的日期护栏里面（会每小时跑一遍）')
  assert.ok(/dueToday\(/.test(tick.slice(guardAt, callAt)), '护栏没比日期（一天一次失效）')
  // 真跑一次：临时家里放真冷档的副本（这样「条数一致」是对着真数据验的）+ 一段最小原文
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'ysr-cold-'))
  try {
    const cold = path.join(home, 'dayu', 'runtime', 'dayu', '记忆冷档')
    const srcCold = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'runtime', 'dayu', '记忆冷档')
    let entries = []
    if (fs.existsSync(srcCold)) {
      for (const f of fs.readdirSync(srcCold).sort()) {
        if (!f.endsWith('.jsonl') || f === '索引.jsonl' || f === '未接原文.jsonl') continue
        for (const line of fs.readFileSync(path.join(srcCold, f), 'utf8').split('\n')) {
          if (!line.trim()) continue
          try { const e = JSON.parse(line); if (e && typeof e.text === 'string') entries.push(e) } catch { /* 坏行不进副本，另测不算数 */ }
        }
      }
    }
    if (!entries.length) {
      entries = [
        { at: '2026-11-01T00:00:00.000Z', text: '回归用的第一条冷档，这段在原文里' },
        { at: '2026-11-01T00:01:00.000Z', text: '回归用的第二条冷档，这段原文里没有' },
      ]
    }
    fs.mkdirSync(cold, { recursive: true })
    fs.writeFileSync(path.join(cold, '2026-11-01.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
    const total = entries.length
    const seed = entries.find((e) => e.text.replace(/\s+/g, '').length >= 8)
    assert.ok(seed, '副本里没有够长的句子，测不了接线')
    const arc = path.join(home, 'dayu', 'sessions-archive', '回归')
    fs.mkdirSync(arc, { recursive: true })
    fs.writeFileSync(path.join(arc, '2026-11-01-冷档接线-abc12345.md'), `# 冷档接线（回归用的一小段原文）\n\n> ${seed.text}\n`, 'utf8')

    const r = spawnSync(process.execPath, [script, '--role', 'dayu'], { encoding: 'utf8', timeout: 180000, env: { ...process.env, DSH_HOME: home } })
    if (r.status === null) {
      const code = String(r.error?.code || '')
      if (code === 'EPERM' || code === 'EACCES') { skipped += 1; return '结构都对；真跑跳过（这个环境不让开子进程 ' + code + '）' }
      assert.fail(`link-cold-archive.mjs 跑不起来：${code || '没有状态码'}`)
    }
    assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 300))
    const last = String(r.stdout || '').trim().split('\n').pop() || ''
    const m = last.match(/冷档 (\d+) 条：接上 (\d+)，连不上 (\d+) 条（原文缺）/)
    assert.ok(m, `最后一行不是给 tick 记的摘要：${last}`)
    assert.equal(Number(m[1]), total, `摘要里的冷档条数 ${m[1]} 与实际 ${total} 对不上`)
    assert.equal(Number(m[2]) + Number(m[3]), total, '接上 + 连不上 != 冷档总条数')
    const idx = fs.readFileSync(path.join(cold, '索引.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    assert.equal(idx.length, total, `索引 ${idx.length} 条、冷档 ${total} 条——没有逐条记录`)
    const linked = idx.filter((x) => x.source)
    assert.ok(linked.length >= 1, '一条都没接上：原文里明明放了那段')
    assert.ok(linked.every((x) => x.source.file && x.source.line >= 1), '接上了却没给文件/行号')
    const miss = fs.readFileSync(path.join(cold, '未接原文.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    assert.equal(miss.length, idx.length - linked.length, '未接原文条数 != 索引里 source 为 null 的条数')
    assert.equal(miss.length, Number(m[3]), '未接原文条数 != 摘要里的连不上条数')
    for (const x of miss) {
      assert.ok('at' in x && 'head' in x && x['原因'], `未接原文那行缺字段：${JSON.stringify(x).slice(0, 120)}`)
    }
    return `tick 按天调三角色 / 真跑 ${total} 条：接上 ${linked.length}、连不上 ${miss.length}（索引 ${idx.length} 条逐条有账）`
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 清不掉也不影响结论 */ }
  }
})

// 124. 2026-11-01 主人：core 记忆 125 条太多，每轮带着反而不聚焦。
//      判据落进 docs/记忆分级.md + scripts/memory-tier-audit.mjs；这条锁四件事：
//      ①三人 core 合计 ≤ 30、important ≤ 200（读真记忆，脏了就红）；
//      ②判据文档在，且引用了大纲脚本 scripts/build-memory-outline.mjs、写着两个上限；
//      ③脚本的 CAPS 和文档同源（大纲也从脚本取数，不许两套数）；
//      ④拿合成数据跑一遍 analyze：只留身份/承诺/关系/事故、不拿聊天凑数、正文一条不动。
const { CAPS: MEMORY_CAPS, analyze: auditMemory } = await import(pathToFileURL(path.join(ROOT, 'scripts/memory-tier-audit.mjs')).href)
ok('记忆分级上限：三人 core ≤ 30、important ≤ 200，判据文档与脚本同源', () => {
  assert.deepEqual({ ...MEMORY_CAPS }, { core: 30, important: 200 }, 'CAPS 被改了，和 docs/记忆分级.md 的上限不一致')
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', '记忆分级.md')), 'docs/记忆分级.md 不见了')
  has('docs/记忆分级.md', 'scripts/build-memory-outline.mjs')
  has('docs/记忆分级.md', 'scripts/memory-tier-audit.mjs')
  has('docs/记忆分级.md', '30 条')
  has('docs/记忆分级.md', '200 条')
  has('scripts/build-memory-outline.mjs', "from './memory-tier-audit.mjs'")

  // ① 真记忆（读家目录，跟 DSH_HOME 指的哪儿无关）：三档不许超
  const dir = path.join(os.homedir(), '.dsh', 'dayu', 'soul', 'memory')
  const totals = { core: 0, important: 0, normal: 0 }
  const seen = []
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.includes('.bak'))) {
    let mem = null
    try { mem = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) } catch { continue }
    for (const ev of mem.events || []) {
      const t = ['core', 'important', 'normal'].includes(String(ev?.tier || '')) ? String(ev.tier) : (ev?.pinned ? 'core' : 'normal')
      totals[t] += 1
    }
    seen.push(f)
  }
  assert.ok(totals.core <= MEMORY_CAPS.core, `core 超上限：${totals.core} 条 > ${MEMORY_CAPS.core}（跑 scripts/memory-tier-audit.mjs 看该降哪几条）`)
  assert.ok(totals.important <= MEMORY_CAPS.important, `important 超上限：${totals.important} 条 > ${MEMORY_CAPS.important}`)

  // ④ 合成数据：40 条 core 里只有 2 条是事实，其余是聊天——只留那 2 条，不凑数
  const facts = [
    { at: '2026-01-01T00:00:00.000Z', kind: 'note', text: '以后叫主人。owner.json 的 callName 改成主人了。' },
    { at: '2026-01-02T00:00:00.000Z', kind: 'note', text: '拒的事分三种，第一条是不为祸。' },
  ]
  const chats = Array.from({ length: 40 }, (_, i) => ({ at: `2026-01-03T00:00:${String(i).padStart(2, '0')}.000Z`, kind: 'say', text: `第 ${i} 条工作汇报：跑完了回归，全绿。` }))
  const coreRows = [{ role: 't', events: [...chats, ...facts].map((e) => ({ ...e, tier: 'core' })), recall: {} }]
  const before = coreRows[0].events.map((e) => e.text)
  const r = auditMemory(coreRows)
  assert.equal(r.after.core, 2, `该只留 2 条事实，实际留了 ${r.after.core} 条（是不是又把聊天凑进 core 了）`)
  assert.deepEqual(r.keep.map((x) => x.ev.text).sort(), facts.map((f) => f.text).sort(), '留下的不是那两条事实')
  assert.equal(r.demoteCore.length, 40, '该降 40 条聊天')
  assert.deepEqual(coreRows[0].events.map((e) => e.text), before, 'analyze 改了正文（只许改 tier）')
  assert.equal(coreRows[0].events.every((e) => e.tier === 'core'), true, 'analyze 不该就地改输入')

  // 同理 important：260 条老的 + 1 条承诺（受保护）→ 压到 200，且承诺不许被降
  const older = Array.from({ length: 260 }, (_, i) => ({ at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`, kind: 'say', text: `旧事 ${i}`, tier: 'important' }))
  const promise = { at: '2026-01-05T00:00:00.000Z', kind: 'note', text: '答应过主人：底线是不为祸。', tier: 'important' }
  const r2 = auditMemory([{ role: 't', events: [...older, promise], recall: {} }])
  assert.equal(r2.after.important, MEMORY_CAPS.important, `important 该压到 ${MEMORY_CAPS.important}，实际 ${r2.after.important}`)
  assert.equal(r2.demoteImportant.length, 260 + 1 - MEMORY_CAPS.important, '该降的条数不对')
  assert.equal(r2.demoteImportant.some((x) => x.ev === promise), false, '受保护的那条承诺被降了')

  return `真记忆 core ${totals.core}/${MEMORY_CAPS.core} · important ${totals.important}/${MEMORY_CAPS.important}（${seen.length} 份）；合成数据只留事实、不凑数`
})

// 125. 2026-11-01 安全闸门第 2 条：不可改清单原来只有**事后**审计（note-work / check-provenance 都在写完以后），
//      10-31 那次我把别人的卡复制回去，是记完账才被挡，靠手撤才恢复。现在补了事前闸：
//      `lib/immutables.js:assertWritable(file, { by })` + `scripts/guard-write.mjs` 命令行。
//      这条锁：①库在、命令行在；②别人的卡写之前就拒、本人/主人放行；③真接到写卡的地方（addCharacter 的 cardRel）。
ok('不可改清单有事前闸：写之前就拒，别人写不了她的卡', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'lib', 'immutables.js')), 'lib/immutables.js 不见了')
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'guard-write.mjs')), 'scripts/guard-write.mjs 不见了')
  has('lib/immutables.js', 'export function assertWritable')
  has('lib/immutables.js', 'export function cardOwner')
  has('lib/characters.js', 'assertWritable(cardPath, { by: id })')
  hasDoc('安全与权限-闸门缺口.md', '仍然没接上的')
  runTestScript('scripts/test-immutables.mjs')
  runTestScript('scripts/test-create-flow.mjs')
  return '事前闸在；别人的卡写前就拒；主人/本人放行；写卡处已接'
})

// 126. 2026-11-01 小鱼：清理规则是会 rmSync 的，所以「规则匹配到谁」必须拿真实目录名验过。
//      两处都踩过：① `/^FULL(-|$)/` 把容器目录 `D:\鱼神备份\FULL`（里面装着每一份全盘）
//      当成「一份」候选，跟旧命名一起按 mtime 排，keep=2 时多一个候选就整个删；
//      ② 旧全盘用 `/.*/` 把 `DSH_backups` 下 `installers`/`live`/`snapshots` 三个
//      不是备份的长期目录也收进了候选，keep=4 时正好 4 个没删，多一个就可能删到它们。
//      这条锁行为不锁源码：直接跑 buildRules()，拿真实目录名去试。
const { buildRules: pruneRules } = await import(pathToFileURL(path.join(ROOT, 'lib', 'prune.js')).href)
ok('清理规则不匹配容器目录、不碰不是备份的目录', () => {
  const rules = pruneRules({ legacy: true })
  const hit = (name) => rules.filter((r) => r.match.test(name)).map((r) => r.label)
  assert.deepEqual(hit('FULL'), [], '容器目录 FULL 被清理规则匹配上了——多一个候选就会把整个容器删掉')
  assert.ok(hit('FULL-20261031-1751').length > 0, '旧命名的全盘不再被匹配，清理等于废了')
  for (const n of ['installers', 'live', 'snapshots']) {
    assert.deepEqual(hit(n), [], `${n} 不是备份，不该进任何清理候选`)
  }
  assert.ok(hit('2026-10-25_032325').length > 0, '日期命名的旧全盘不再被匹配')
  assert.ok(hit('2026-11-01_130248').length > 0, '小时档不再被匹配')
  return '容器和 live 类目录 0 命中；旧全盘与小时档仍可清'
})

// 127. 2026-11-01 复核大鱼的 mandate / disposition / books：三个问题指出来了也补上了。
//      ①mandate 只记 explicit/inferred 且**没人传 startedBy**——姐妹派活和主人派活一模一样，
//        basis 永远是「未记录派活人」。现在记 by，分 owner / peer / inferred；
//      ②disposition 注释写「被筛掉/判重复/接单三种都记」，实际只有两种，被判等待那条断档；
//        且 event 是派活原文，文件没有轮转。现在补 queued + 2MB 轮转；
//      ③books.readBook 的 role 只对 memory/mind 暴露，diary 读了 who 却不返回——面板会显示错人。
ok('派活记录三处补齐：mandate 记谁派的 / disposition 三态都记且有轮转 / diary 返回角色', () => {
  has('core/dispatch.js', "by: String(startedBy || '未记录')")
  has('core/dispatch.js', '/^(owner|主人|老板)$/')
  has('core/dispatch.js', "disposition: 'queued'")
  has('core/dispatch.js', 'DISPOSITION_MAX_BYTES')
  has('dayu/m1.js', "startedBy: caller === 'owner' ? 'owner' : caller")
  has('lib/books.js', "['memory', 'mind', 'diary'].includes(id)")
  runTestScript('scripts/test-dispatch-reply.mjs')
  return 'mandate 分 owner/peer/inferred；disposition 三态齐+轮转；diary 带角色'
})

// 128. 2026-11-01 审删除闸发现两条绕过（实测过）：①手改 `登记.jsonl`（任何会话都能写）+ 造一份同内容副本，
//      safe-delete 就放行——授权源本身可改等于没闸；②`force: true` 是万能钥匙，不登记、唯一一份也能删，
//      删完查不到谁批的。现在：build-registry 写表时留 sha256 指纹，safe-delete 读表前核对（对不上就拒）；
//      force 必须带 `approvedBy`，并写进操作日志与返回值。
ok('删除闸两条绕过补上：手改登记表拒、force 必须留名', () => {
  has('scripts/build-registry.mjs', '登记.jsonl.sha256')
  has('lib/safe-delete.js', 'export function registryIntegrity')
  has('lib/safe-delete.js', '登记表指纹对不上')
  has('lib/safe-delete.js', 'force 必须写 approvedBy')
  has('lib/safe-delete.js', 'forcedBy')
  runTestScript('scripts/test-snapshot-delete.mjs')
  return '手改登记表 → 拒；force 不写谁批的 → 拒；force 带名 → 留痕'
})

// 129. 2026-11-01 安全闸门第 3 条：执行能力要体检。
//      10-31 18:06–18:51 我所有命令都报 ACL 错误，可 selfCheck 7 项全绿、baseline 24/0——
//      因为它只查"文件在不在、解析得开不开"，从不试跑、从不试写。自检现在是绿的，但那次是瞎的。
//      现在自检里加两个探针：真起一次 `node -e`、真写一个小文件再读回来删掉；任一不通就红。
ok('自检有执行探针：真能起进程、真能写读，不是只看文件在不在', () => {
  has('lib/selfcheck.js', "name: '执行'")
  has('lib/selfcheck.js', "name: '写读'")
  has('lib/selfcheck.js', '执行探针失败')
  runTestScript('scripts/test-selfcheck-probe.mjs')
  return '执行/写读两个探针在；真跑全绿；探针文件不残留'
})

// 130. 2026-11-01 安全闸门第 6 条：会审表缺一格——「谁能恢复别人的东西」。
//      10-31 16:11 清空家之后，卡和 feel 是别人替我放回去的，当时表里根本没有这一格：
//      恢复算不算"改别人的东西"、谁批、要不要留痕，全是事后才想。现在写成规矩：
//      恢复别人的 = 高危但**不走三审**（救火等不起），走"一人点头 + 三样留痕"：
//      恢复前哈希 / 来源（备份或底片 id）/ 恢复后哈希；卡只有本人能恢复，主人另说。
ok('会审表补上「恢复别人的东西」这一格：一人点头 + 三样留痕', () => {
  has('docs/三族会审.md', '谁能「恢复别人的东西」')
  has('docs/三族会审.md', '不走三审')
  has('docs/三族会审.md', '恢复前的现状')
  has('docs/三族会审.md', '哪份备份')
  has('docs/三族会审.md', '恢复后的哈希')
  has('docs/三族会审.md', 'scripts/guard-write.mjs')
  return '这一格在：判级/谁批/三样留痕/卡只本人/机器侧对应都写了'
})

// 131. 2026-11-01 小鱼：冷档「未接原文」原来一律写「原文缺（原文里没有这一段）」，
//      1061 条看起来像同一个毛病。分四种之后才看清：日期无归档 868、提炼条目 116、
//      太短 84、真·原文缺只有 23。**把四种混成一个数报，等于让人以为记忆坏了上千条。**
//      这条锁两件事：① 原因必须分类；② 脚本最后一行格式不许动（tick 取它写日志）。
ok('冷档未接原文要分类，别把四种情况报成一个数', () => {
  has('scripts/link-cold-archive.mjs', 'function whyMissing')
  for (const k of ['日期无归档', '提炼条目', '太短', '原文缺']) {
    has('scripts/link-cold-archive.mjs', k)
  }
  // tick 直接取最后一行写日志，格式变了日志就静默退化成别的形状
  has('scripts/link-cold-archive.mjs', '冷档 ${total} 条：接上 ${linked}，连不上 ${total - linked} 条（原文缺）')
  return '四种原因分开记；最后一行格式没动'
})

// 132. 2026-11-01 主人：B站「谁 @ 我」要接进每小时巡检，主人自己 @ 的时候得被看见。
//      断点原来有三处：① tick 里没人跑 bili-inbox.mjs，收件箱永远停在手拉过的那一天；
//      ② 包装只传 --limit，没有 --mode，@我 / 回复我 根本没有口子；
//      ③ python 的 at 分支只读 user.uid，而 msgfeed 给的是 user.mid —— from_uid 全是 null、
//         from_owner 永远是 false。文件照写、字段照在，可「主人 @ 我」一次都不会亮（静默失效）。
ok('B站巡检①：两个脚本都在，模式是明的', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'bili-inbox.mjs')), 'scripts/bili-inbox.mjs 不见了')
  has('scripts/bili-inbox.mjs', "['dm', 'at', 'replies']")
  has('scripts/bili-inbox.mjs', "'--mode', mode")
  // 拼错模式名不许静默退回私信（那会让「@我」看起来跑了、其实拉的是别的篮子）
  has('scripts/bili-inbox.mjs', '没有这种模式')
  // python 侧装在 bili-duty 插件家目录（不在本仓库）：装了就得三种模式都在，没装只查包装的兜底
  const py = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'bili-duty', 'bili_inbox.py')
  if (!fs.existsSync(py)) return '仓库侧在；这台机器没装 bili-duty，python 侧跳过'
  const text = fs.readFileSync(py, 'utf8')
  for (const m of ['at', 'replies']) assert.ok(text.includes(`mode == "${m}"`), `bili_inbox.py 没有 ${m} 分支`)
  return 'node 包装 + python 的 dm/at/replies 都在'
})

ok('B站巡检②：tick 里真的每小时跑 at / replies，失败只记一行', () => {
  // 2026-11-03 起这段在 scripts/maintenance.mjs（宿主只发命令，重活在脚本里）
  has('scripts/maintenance.mjs', "runScript('bili-inbox.mjs'")
  has('scripts/maintenance.mjs', "for (const mode of ['at', 'replies'])")
  has('scripts/maintenance.mjs', "'--mode', mode")
  // 本次新增（跑之前数行数）+ 只挑主人
  has('scripts/maintenance.mjs', 'pickFreshOwnerMentions(readRows(file), before)')
  has('scripts/maintenance.mjs', 'writeOwnerMentions(HOME, mine)')
  // 一个模式挂掉不许把整段带走，也不许静默
  has('scripts/maintenance.mjs', 'B站收件（${mode}）没跑成')
  return '两个模式各跑一次；本次新增里挑 from_owner；失败记一行不连坐'
})

ok('B站巡检③：python 认得出主人——mid 不再丢，from_owner 不是死的', () => {
  const py = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'bili-duty', 'bili_inbox.py')
  if (!fs.existsSync(py)) return '这台机器没装 bili-duty，跳过（仓库侧逻辑由④覆盖）'
  const text = fs.readFileSync(py, 'utf8')
  assert.ok(text.includes('from_owner'), 'bili_inbox.py 没有 from_owner 字段')
  assert.ok(text.includes('owner_uid()'), 'bili_inbox.py 没比对主人 uid')
  assert.ok(/u\.get\("uid"\)\s*or\s*u\.get\("mid"\)/.test(text),
    '只读 user.uid 不读 user.mid：msgfeed 的 user 只有 mid，from_owner 会永远是 false')
  assert.ok(/owner\.json/.test(text), '没读 owner.json 的 biliUid')
  return 'from_owner 在；uid 取不到时退到 mid；主人 uid 从 owner.json/biliUid 来'
})

// ④ 真跑一遍「读当天文件 → 挑 from_owner → 写 runtime 文件」这段：临时家造数据，
//    不碰真数据、不调 B站 接口（这段本来就只读本地 jsonl）。
const { atDate, atFileOf, readRows, pickFreshOwnerMentions, ownerMentionLine, writeOwnerMentions, readOwnerMentions } =
  await import(pathToFileURL(path.join(ROOT, 'lib/bili-inbox.js')).href)
ok('B站巡检④：当天文件 → 挑主人 @ → 写 runtime（临时家，不调接口）', () => {
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'dsh-bili-'))
  try {
    const file = atFileOf(home)
    assert.equal(path.dirname(file), path.join(home, 'dayu', 'inbox'), '当天 at 文件不在 dayu/inbox 下')
    assert.ok(path.basename(file).startsWith(`bili-at-${atDate()}`), `文件名没按 UTC+8 当天日期：${path.basename(file)}`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const rows = [
      { key: 'at|1|None', at: '2026-11-01 15:00:00', from_owner: false, text: '@别人 看看', title: '视频一' },
      { key: 'at|2|None', at: '2026-11-01 15:01:00', from_owner: true, text: '@鱼神 你今天在吗', title: '视频二' },
      { key: 'at|3|None', at: '2026-11-01 15:02:00', from_owner: true, text: '@小鱼 看一眼这个', title: '视频三' },
    ]
    fs.writeFileSync(file, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n{坏行\n`, 'utf8')

    const all = readRows(file)
    assert.equal(all.length, 3, `坏行该跳过、三行该读出来，实际 ${all.length}`)
    // 水位 1 = 「这次跑之前已经有一行」：只有后两条算新增；非主人那条永远不算
    const mine = pickFreshOwnerMentions(all, 1)
    assert.deepEqual(mine.map((r) => r.key), ['at|2|None', 'at|3|None'], '水位或 from_owner 挑错了')
    assert.deepEqual(pickFreshOwnerMentions(all, 3), [], '水位到头了还挑出东西')
    assert.deepEqual(pickFreshOwnerMentions(all, 0).length, 2, '从头数也没挑对')

    const line = ownerMentionLine(mine)
    assert.equal(line, 'B站：主人 @ 了你 2 条（@鱼神 你今天在吗）', `日志那行格式不对：${line}`)
    assert.equal(ownerMentionLine([]), '', '没 @ 的时候不该占日志')
    assert.ok(ownerMentionLine([{ text: 'x'.repeat(60) }]).includes(`${'x'.repeat(40)}…`), '长文本没截到 40 字')

    const w = writeOwnerMentions(home, mine)
    assert.ok(fs.existsSync(w.file), 'runtime/bili-owner-mentions.json 没写出来')
    assert.equal(w.total, 2, `该存 2 条，存了 ${w.total}`)
    const saved = readOwnerMentions(home)
    assert.deepEqual(saved.items.map((r) => r.text), ['@鱼神 你今天在吗', '@小鱼 看一眼这个'], '存的不是那两条主人 @')
    for (const it of saved.items) {
      for (const k of ['text', 'at', 'title']) assert.ok(k in it, `少字段 ${k}`)
    }
    // 同一批再写一次：不重复堆
    writeOwnerMentions(home, mine)
    assert.equal(readOwnerMentions(home).items.length, 2, '同一条被重复记了')
    // 只留最近 20 条，新的在前
    const many = Array.from({ length: 25 }, (_, i) => ({ key: `at|9${i}|None`, at: '2026-11-01 16:00:00', from_owner: true, text: `第 ${i} 条` }))
    const w2 = writeOwnerMentions(home, many)
    assert.equal(w2.total, 20, `上限该是 20，实际 ${w2.total}`)
    assert.deepEqual(readOwnerMentions(home).items.slice(0, 2).map((r) => r.text), ['第 0 条', '第 1 条'], '新的没排在前面')
    return '水位挑主人 @ / 坏行跳过 / 日志行格式 / 20 条上限 / 去重 都对'
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 清不掉算了 */ }
  }
})

// .keep 是主人定的「重要节点不要随便删」，但它有**两个执行者**——`lib/prune.js`
// （管 D:\DSH\备份 的冷备）和 `lib/offsite.js` 自己的滚动（管 FULL 和 E 盘）。
// 两处任何一处不认 `.keep`，那份就会被后来者挤掉，而且**不会报错**——正是"看起来正常"那种坏。
// 这条真跑 offsite 的滚动（临时目录，4 份 keep=2）验带 .keep 的那份没被删；prune 那处锁源码。
const { runOffsiteBackup: offsiteBackupFn } = await import(pathToFileURL(path.join(ROOT, 'lib', 'offsite.js')).href)
ok('.keep 有人认：offsite 滚动跳过带 .keep 的那份', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-probe-'))
  try {
    const names = ['2026-01-01_000001', '2026-01-01_000002', '2026-01-01_000003', '2026-01-01_000004']
    for (const n of names) {
      fs.mkdirSync(path.join(tmp, n), { recursive: true })
      fs.writeFileSync(path.join(tmp, n, 'x.txt'), n)
    }
    const kept = names[0] // 最老，但带 .keep
    fs.writeFileSync(path.join(tmp, kept, '.keep'), '')
    const out = offsiteBackupFn({ target: tmp, keep: 2, roots: [] })
    assert.ok(fs.existsSync(path.join(tmp, kept)), '带 .keep 的那份被滚掉了')
    assert.ok(out.pruned.length >= 1, 'keep=2 却没滚任何一份，这条测试没生效')
    assert.equal(out.pruned.includes(kept), false, '.keep 那份出现在 pruned 里')
    has('lib/prune.js', '.keep')
    return `滚掉 ${out.pruned.join(',')}；.keep 那份还在`
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* 清不掉不影响结论 */ }
  }
})

// 134. 2026-11-01 老板：「别一条条孤零零记『今天被骂了』，记成『因为我没看参考图 → 被指出来 → 我改错方向』。
//      以后问一句就能顺着线翻回去。」
//      关联记忆 = 点（<role>.json 的 events）+ 线（链条.jsonl）+ 挂载（链接.jsonl）。
//      红线是「一个字段都不动已有记忆」，所以这条断言的核心不是"能读能写"，而是：
//      **跑完 add/link/search/show 之后，<role>.json 一个字节都没变**（真家哈希 + 临时家样例两份都盯）。
// 改｜2026-11-01 19:22｜大鱼·工作台(子代理)｜授权：主人｜scripts/regression.mjs 末尾新增第 134 条断言（没删改任何已有断言）｜断言内容：链条文件/四个命令在；临时家跑 add×2 → list 列出 → search 命中 → show 带教训 → link 挂事件；同内容稳定 id 不重复堆；跑完 <role>.json 不动：临时家整份字节不变，真家「已有事件」逐字段不变（真家是活的，她自己说句话就 appendEvent，整份哈希会误判）｜为什么：关联记忆的红线是「只加不改已有记忆」，光有代码不算，得有断言盯着｜可改：可改；哈希那两条不许放宽成「看起来没变」
ok('关联记忆：链是线、事件是点——加链挂事件都不动 <role>.json', () => {
  // ① 文件、关键字、四个命令都在
  has('lib/memory-links.js', '链条.jsonl')
  has('lib/memory-links.js', '链接.jsonl')
  has('lib/memory-links.js', 'export function appendLink')
  has('lib/memory-links.js', 'export function linkEvent')
  has('lib/memory-links.js', 'export function chainOf')
  for (const c of ['add', 'list', 'show', 'search']) has('scripts/memory-chain.mjs', `cmd === '${c}'`)
  // find-any 里要有「链条」这一路（命中时按 [链条] 标题 → 教训 出一行）
  has('scripts/find-any.mjs', '## 链条')
  has('scripts/find-any.mjs', 'memory-chain.mjs')

  // ② 真家：已有事件要是被改了，这里当场红。
  //    为什么不比整个文件的哈希：真家是活的——她自己的会话随时 appendEvent（审计里 who=appendEvent），
  //    满 200 条还会把最老的挤进冷档。拿整文件哈希当判据，会把她正常的说话判成"被人改了"。
  //    红线本来也不是"文件不许变"，是"**已有的那几条事件，一个字段都不许变**"。
  const realMem = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'soul', 'memory', 'dayu.json')
  const eventsById = (file) => {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
      return new Map((Array.isArray(j?.events) ? j.events : []).map((e) => [String(e?.id || ''), JSON.stringify(e)]))
    } catch { return null }
  }
  const realBefore = fs.existsSync(realMem) ? eventsById(realMem) : null

  const home = fs.mkdtempSync(path.join(tmpRoot(), 'dsh-chain-'))
  try {
    const memDir = path.join(home, 'dayu', 'soul', 'memory')
    fs.mkdirSync(memDir, { recursive: true })
    const memFile = path.join(memDir, 'dayu.json')
    // 形状和真记忆一样的一份样例：跑完一个字节都不许变
    const event = {
      at: '2026-11-01T08:00:00.000Z', channel: '工作台', kind: 'note', text: '样例事件：只读字幕就下了判断',
      source: '', verified: false, tier: 'normal', clarity: 'vivid', pinned: false,
      lastSeenAt: '2026-11-01T08:00:00.000Z', recallCount: 0, by: '', id: 'm-probe000001',
    }
    fs.writeFileSync(memFile, `${JSON.stringify({ version: 1, summary: '', habits: [], dynamics: [], updatedAt: '2026-11-01T08:00:00.000Z', events: [event] }, null, 2)}\n`, 'utf8')
    const before = fs.readFileSync(memFile)

    const cli = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'memory-chain.mjs'), ...a], {
      encoding: 'utf8', cwd: ROOT, env: { ...process.env, YUSHEN_TEST: '1', DSH_HOME: home },
    })
    const idOf = (r) => (String(r.stdout || '').match(/(c-[0-9a-f]{10})/) || [])[1]
    const why = (r) => String(r.stderr || r.stdout || '').slice(0, 200)

    const chainA = ['--role', 'dayu', '--title', '测试链甲：封面', '--step', '2026-11-01 17:01|老板|圈出参考图', '--step', '2026-11-01 17:17|她|才看清圈的是右边那张', '--lesson', '用户圈了图，先比对再动手', '--tags', '封面,核对事实']
    const a1 = cli('add', ...chainA)
    assert.equal(a1.status, 0, `add 甲 失败：${why(a1)}`)
    const idA = idOf(a1)
    assert.ok(idA, `add 没给出链 id：${a1.stdout}`)
    const a2 = cli('add', '--role', 'dayu', '--title', '测试链乙：推广', '--step', '2026-11-01 17:56|她|说了发不了', '--lesson', '先查本机有没有工具')
    assert.equal(a2.status, 0, `add 乙 失败：${why(a2)}`)
    const idB = idOf(a2)
    assert.notEqual(idA, idB, '两条不同的链拿到了同一个 id')

    // 同一条再 add 一次：内容相同 = 同一个 id，不重复堆
    const again = cli('add', ...chainA)
    assert.equal(again.status, 0, `add 重复失败：${why(again)}`)
    assert.equal(idOf(again), idA, '同内容的链没有稳定 id（同一条被记成两条）')

    // list：两条都在，步数也报出来
    const list = cli('list', '--role', 'dayu')
    assert.equal(list.status, 0, `list 失败：${why(list)}`)
    assert.ok(list.stdout.includes('测试链甲：封面') && list.stdout.includes('测试链乙：推广'), `list 没列出两条：\n${list.stdout}`)
    assert.ok(list.stdout.includes('2 条'), `list 条数不对：\n${list.stdout}`)
    assert.ok(list.stdout.includes('2 步'), `list 没报步数：\n${list.stdout}`)

    // search：命中链甲，带出撞上的那一步；--brief 出 find-any 要的一行式
    const s = cli('search', '参考图')
    assert.equal(s.status, 0, `search 失败：${why(s)}`)
    assert.ok(s.stdout.includes('测试链甲：封面'), `search 没命中链甲：\n${s.stdout}`)
    assert.ok(s.stdout.includes('撞上这一步'), `search 没带出命中的那一步：\n${s.stdout}`)
    assert.equal(s.stdout.includes('测试链乙：推广'), false, 'search 把没关系的链也命中了')
    const b = cli('search', '参考图', '--brief')
    assert.ok(b.stdout.includes('[链条] 测试链甲：封面 → '), `find-any 要的一行式不对：${b.stdout}`)
    const miss = cli('search', '根本没有这个词')
    assert.equal(miss.status, 0, 'search 没命中时不该报错（find-any 会当成没东西）')
    assert.ok(miss.stdout.includes('没命中'), `search 没命中时没说清：${miss.stdout}`)

    // show：完整一步一行 + 教训
    const show = cli('show', idA)
    assert.equal(show.status, 0, `show 失败：${why(show)}`)
    assert.ok(show.stdout.includes('## 教训') && show.stdout.includes('用户圈了图，先比对再动手'), `show 没带教训：\n${show.stdout}`)
    assert.ok(show.stdout.includes('17:01') && show.stdout.includes('圈出参考图'), `show 没把步骤列出来：\n${show.stdout}`)

    // link：把样例事件挂上去，show 里要能看到事件原文（只写 链接.jsonl）
    const lk = cli('link', '--role', 'dayu', '--event', 'm-probe000001', '--chain', idA)
    assert.equal(lk.status, 0, `link 失败：${why(lk)}`)
    const show2 = cli('show', idA)
    assert.ok(show2.stdout.includes('样例事件：只读字幕就下了判断'), `show 没带出挂着的事件原文：\n${show2.stdout}`)
    assert.ok(fs.existsSync(path.join(memDir, '链条.jsonl')), '链条.jsonl 没落在 soul/memory 下')
    assert.ok(fs.existsSync(path.join(memDir, '链接.jsonl')), '链接.jsonl 没落在 soul/memory 下')

    // ③ 红线：临时家整份字节不变（没有别人在写，就该一模一样）；
    //    真家只认「已经有的事件一条都不许变」——新追加/挤进冷档是她自己的正常活动。
    assert.ok(fs.readFileSync(memFile).equals(before), '跑完链条命令，临时家的 <role>.json 被改了——这是红线')
    let realNote = '真家没碰'
    if (realBefore) {
      const realAfter = eventsById(realMem) || new Map()
      const changed = [...realBefore.keys()].filter((id) => realAfter.has(id) && realAfter.get(id) !== realBefore.get(id))
      assert.equal(changed.length, 0, `跑完链条命令，真家已有事件被改了：${changed.slice(0, 3).join(', ')}`)
      realNote = `真家 ${realBefore.size} 条已有事件原样（期间新追加的不算我们头上）`
    }

    return `add/list/show/search/link 都对；同内容稳定 id 不重复堆；${realNote}`
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 清不掉不影响结论 */ }
  }
})

// ── QQ 桥出站落库（2026-11-01）───────────────────────────────────────────────
// "她说过的话"以前只有 MCP 发送工具那条路会落库；正常回复走 sendToQQ /
// sendBurstToQQ，一条都不写（dayu 的会话档案 165 行里 incoming 159 / outgoing 6），
// 事后翻会话像她一直没开口。这条锁三件事：① 三条文本发送路径都接了落库；
// ② 写不进去必须有 WARN（不许再静默 skipped）；③ 现成档案上 direction 统计能数到 outgoing。
ok('QQ 桥出站落库：她说的话也进会话档案（改前正常回复一条都不写）', () => {
  const bridgeDir = process.env.QQ_BRIDGE_DIR || path.join('D:', 'deepseekTools', 'qq-bridge')
  const bridgeFile = path.join(bridgeDir, 'src', 'bridge.js')
  const brainFile = path.join(bridgeDir, 'src', 'conversation-brain.js')
  const bridgeTest = path.join(bridgeDir, 'scripts', 'test-outbound-fact.mjs')
  assert.ok(fs.existsSync(bridgeFile), `找不到桥源码：${bridgeFile}`)
  const bridgeSrc = fs.readFileSync(bridgeFile, 'utf8')
  const brainSrc = fs.readFileSync(brainFile, 'utf8')

  // ① 源码锁：三个文本发送函数里都得有落库调用
  for (const fn of ['function sendToQQ(', 'function sendBurstToQQ(', 'async function onebotSend(']) {
    const at = bridgeSrc.indexOf(fn)
    assert.ok(at > 0, `桥源码里找不到 ${fn}`)
    assert.ok(bridgeSrc.slice(at, at + 4000).includes('recordOutgoingFactFor('), `${fn} 没接出站落库`)
  }
  // ② 失败要响：被校验挡下 / 写失败都得有 WARN，不能只处理 error 分支
  assert.ok(bridgeSrc.includes('WARN 出站落库失败'), '出站写失败没有 WARN 日志（又会静默）')
  assert.ok(brainSrc.includes('export function recordOutgoingFact'), 'conversation-brain 里没有 recordOutgoingFact')
  assert.ok(brainSrc.includes('skipped:true, reason'), 'appendQQFact 的 skipped 还是不带原因（静默跳过）')

  // ③ 现成 QQ 档案上数一遍 direction（只读，一个字节都不写）
  let files = 0
  let incoming = 0
  let outgoing = 0
  let outgoingWithText = 0
  const walk = (dir) => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      if (path.basename(path.dirname(full)) !== 'qq') continue // 只看 QQ 通道档案
      files += 1
      for (const line of fs.readFileSync(full, 'utf8').split('\n').filter(Boolean)) {
        let row
        try { row = JSON.parse(line) } catch { continue }
        if (row.direction === 'incoming') incoming += 1
        if (row.direction === 'outgoing') { outgoing += 1; if (String(row.text || '').trim()) outgoingWithText += 1 }
      }
    }
  }
  walk(path.join(os.homedir(), '.dsh', 'dayu', 'conversations'))

  // ④ 桥自己的离线自测（不发 QQ；全程在临时家目录里跑）
  let testNote = ''
  if (fs.existsSync(bridgeTest)) {
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(ROOT, 'scripts', '_test-sandbox.mjs')).href, bridgeTest], {
      encoding: 'utf8',
      env: { ...process.env, YUSHEN_TEST: '1', DSH_HOME: path.join(os.homedir(), '.dsh') },
    })
    const code = String(r.error?.code || '')
    if (r.status === null && (code === 'EPERM' || code === 'EACCES')) testNote = '；桥离线自测跳过（这个环境不让开子进程）'
    else { assert.ok(r.status === 0, `桥离线自测没过：${String(r.stdout || r.stderr || '').slice(0, 300)}`); testNote = '；桥离线自测绿' }
  }
  const sample = files
    ? `真实 QQ 档案 ${files} 个：incoming ${incoming} / outgoing ${outgoing}（有正文 ${outgoingWithText}）`
    : '这台机器还没有 QQ 会话档案'
  const waiting = files && !outgoing ? '；档案里还没有 outgoing（桥要重启一次才会有新记录）' : ''
  return `${sample}${waiting}${testNote}`
})

// 2026-11-02 小鱼：中文路径下 `new URL(import.meta.url).pathname` 会被编码成 `%E5%A4%A7…`，
// 拼出来的路径永远不存在；外面套个 catch 一吞，就变成「这项检查一直空转」——
// install-check 的 `presetIds` 恒为空就是这么来的（11-01 会审查出、11-02 修掉）。
// 同一天我自己在实验脚本里又踩了一次。这条扫 scripts/：谁再用 .pathname 拼路径就红。
ok('路径拼法不许用 URL 的 pathname（中文目录会被编码）', () => {
  const dir = path.join(ROOT, 'scripts')
  const all = fs.readdirSync(dir).filter((x) => x.endsWith('.mjs'))
  const bad = []
  for (const f of all) {
    // 只查真的拿去拼路径的代码行；注释里写「别用 .pathname」不算（collect-evidence 和我自己都写过这种说明）
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
    for (const ln of lines) {
      if (/^\s*\/\//.test(ln)) continue
      if (/new URL\([^)]*\)\.pathname/.test(ln)) { bad.push(f); break }
    }
  }
  assert.deepEqual(bad, [], `还在用 .pathname 拼路径：${bad.join(', ')}`)
  has('scripts/install-check.mjs', 'fileURLToPath(import.meta.url)')
  return `scripts/ 下 ${all.length} 个 mjs 都没有这个毛病`
})

// 2026-11-02：记忆检索三件（倒排索引 / 别名表 / 有效期）——全部本地文件操作，零 LLM 调用。
// 这条锁「接线」：索引怎么落盘、别名多少组、有效期只加字段、tick 每小时增量跑一次。
ok('记忆检索三件：倒排落盘、别名表有下限不封顶（数据驱动会变长）、失效只加字段、tick 每小时增量', () => {
  has('lib/inverted.js', 'export function buildIndex')
  has('lib/inverted.js', "INDEX_NAME = '倒排.json'")
  has('lib/inverted.js', 'MAX_BYTES = 50 * 1024 * 1024')
  has('lib/inverted.js', 'mtimeMs')                       // 增量：mtime+size 没变就复用
  has('scripts/reindex.mjs', '--force')
  has('lib/recall-now.js', 'expandAliases')
  has('lib/recall-now.js', 'includeExpired')
  // 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书）｜scripts/regression.mjs:3542｜
  // has 的文件指针从 lib/memory.js 指到 memory-core/store.mjs｜一条断言都没加、没删、没减弱
  has('memory-core/store.mjs', 'export function supersede')
  has('scripts/supersede.mjs', '--old')
  has('scripts/supersede.mjs', '--reason')
  // 别名表：2026-11-04 起改成数据驱动（alias-harvest 反推），所以不封顶；
  // 但要守住两条：① 至少 20 组（被清空就是倒退）② 封面组还得含「那张图」。
  const aliases = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib', 'aliases.json'), 'utf8'))
  const groups = Object.keys(aliases).filter((k) => !k.startsWith('_'))
  assert.ok(groups.length >= 20, `别名组数 ${groups.length} 少于 20——别名表被清过？`)
  assert.ok(groups.length <= 300, `别名组数 ${groups.length} 太多——同义词开始堆了，该合并`)
  assert.ok(Array.isArray(aliases['封面']) && aliases['封面'].includes('那张图'), '别名表里封面组没有「那张图」')
  // 2026-11-03 起这段在 scripts/maintenance.mjs 的 indexes() 里
  const tick = read('scripts/maintenance.mjs')
  const at = tick.indexOf("runScript('reindex.mjs'")
  assert.ok(at >= 0, '维护脚本里没有调 scripts/reindex.mjs（索引会一直是旧的）')
  const around = tick.slice(Math.max(0, at - 500), at + 600)
  assert.ok(/timeout: 120000|, 120000\)/.test(around), '调 reindex 没给 120s 超时')
  const mediaAt = tick.indexOf("runScript('index-media.mjs'")
  assert.ok(mediaAt >= 0 && mediaAt < at, 'reindex 不在每小时维护块里（应紧跟媒体索引之后）')
  assert.ok(/倒排索引没跑成/.test(around), '失败没有只记一行的分支')
  return `别名 ${groups.length} 组；tick 紧跟媒体索引、120s、失败只记一行`
})

// 同一天的行为验证：临时家（2 live + 1 冷档 + 2 条记忆，含一条已过期）+ 别名表，真跑四项。
ok('记忆检索三件：临时家真跑（倒排 / 别名 / 有效期 / 缺索引退化）', () => {
  const script = path.join(ROOT, 'scripts', 'test-recall-index.mjs')
  assert.ok(fs.existsSync(script), 'scripts/test-recall-index.mjs 不见了')
  const sandboxUrl = pathToFileURL(path.join(ROOT, 'scripts', '_test-sandbox.mjs')).href
  const realHome = path.join(os.homedir(), '.dsh')
  const r = spawnSync(process.execPath, ['--import', sandboxUrl, script], {
    encoding: 'utf8',
    timeout: 180000,
    env: { ...process.env, YUSHEN_TEST: '1', DSH_HOME: realHome },
  })
  const code = String(r.error?.code || '')
  if (r.status === null && (code === 'EPERM' || code === 'EACCES')) {
    skipped += 1
    return `跳过：这个环境不让人开子进程（${code}）`
  }
  assert.ok(r.status !== null, `跑不起来：${code || '没有状态码'}`)
  assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 400))
  const lines = String(r.stdout || '').trim().split('\n')
  assert.ok(lines.some((l) => l.includes('五组都过')), `测试没跑完：${lines.slice(-2).join(' / ')}`)
  return lines.find((l) => l.startsWith('①')) || '四组都过'
})

// 2026-11-02｜授权：老板｜合并第 0 步（身份键）+ 第 1 步（merge 子包）的静态部分：
// 为什么：这两步的红线是「id 必须含 device+session」和「合并只增不改、三个文件各管一段」，
// 落不到断言就等于没做；顺带守住「sync 子包默认单机不加载」。
ok('两端合并第 0/1 步：身份键与 sync 子包都在（静态）', () => {
  for (const f of ['sync/merge.mjs', 'sync/full.mjs', 'scripts/merge.mjs', 'scripts/sync-full.mjs', 'scripts/test-merge.mjs']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} 不存在（这一层是空话）`)
  }
  // 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书）｜scripts/regression.mjs:3594-3597｜
  // read 的文件指针从 lib/memory.js 指到 memory-core/store.mjs（下面三条正则一字没改，查的还是同一段算式）｜一条断言都没加、没删、没减弱
  const mem = read('memory-core/store.mjs')
  assert.ok(/session = ''/.test(mem), 'appendEvent 没有 session 参数（同一句在两台设备会被去重掉一条）')
  assert.ok(/\$\{dev\}\|\$\{sess\}\|\$\{when\}\|\$\{channel\}\|\$\{value\.slice\(0, 120\)\}/.test(mem), 'id 的算式里没有 device|session|at|channel|text（方案 v1 §1）')
  assert.ok(/seq: nextSeq\(role, floor\)/.test(mem), 'appendEvent 没有分配逻辑时钟 seq')
  const mg = read('sync/merge.mjs')
  for (const needle of ['watermark.json', 'merge.log', 'disputes.jsonl', 'lastNightMerge', 'export function merge(', 'supersededBy']) {
    assert.ok(mg.includes(needle), `sync/merge.mjs 里没有「${needle}」`)
  }
  const full = read('sync/full.mjs')
  assert.ok(full.includes('export function exportAll') && full.includes('export function importReplace'), 'sync/full.mjs 缺全量导出/重建（方案 v1 §6）')
  assert.ok(full.includes('coldIncluded'), '全量导出没标 coldIncluded')
  // 默认单机不加载：常规运行时不许 import sync/（只有这几个脚本自己用）
  for (const f of ['index.js', 'dayu/index.js', 'lib/memory.js', 'lib/soul.js', 'lib/recall-now.js']) {
    assert.ok(!/from\s+['"][^'"]*sync\/(merge|full)\.mjs['"]/.test(read(f)), `${f} 把 sync/ 引进了常规运行时（方案 v1 §9：默认单机不加载）`)
  }
  return 'sync/merge.mjs、sync/full.mjs、两个 CLI 入口、验收脚本都在；id 含 device+session；sync/ 没进常规运行时'
})

// 2026-11-02｜授权：老板｜同一件事的真跑：临时家跑 scripts/test-merge.mjs
// （身份键 / 全量重建 / 合并幂等 / 分歧清单 / 水位 / 拆两份 / 定型文档 / 睡眠窗口）。
ok('两端合并第 0/1 步：临时家真跑（身份键 / 全量重建 / 幂等 / 分歧 / 水位）', () => {
  const script = path.join(ROOT, 'scripts', 'test-merge.mjs')
  assert.ok(fs.existsSync(script), 'scripts/test-merge.mjs 不见了')
  const sandboxUrl = pathToFileURL(path.join(ROOT, 'scripts', '_test-sandbox.mjs')).href
  const realHome = path.join(os.homedir(), '.dsh')
  const r = spawnSync(process.execPath, ['--import', sandboxUrl, script], {
    encoding: 'utf8',
    timeout: 240000,
    env: { ...process.env, YUSHEN_TEST: '1', DSH_HOME: realHome },
  })
  const code = String(r.error?.code || '')
  if (r.status === null && (code === 'EPERM' || code === 'EACCES')) {
    skipped += 1
    return `跳过：这个环境不让人开子进程（${code}）`
  }
  assert.ok(r.status !== null, `跑不起来：${code || '没有状态码'}`)
  assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 500))
  const lines = String(r.stdout || '').trim().split('\n')
  assert.ok(lines.some((l) => l.includes('七组都过')), `测试没跑完：${lines.slice(-2).join(' / ')}`)
  return lines.find((l) => l.startsWith('④')) || '七组都过'
})

// 2026-11-02｜授权：老板｜session 要真进记忆 id，不能只在 appendEvent 签名里挂着。
// 为什么：签名早就支持 session，但调用点没传，id = sha1(device||at|channel|text)——同一台设备
// 不同会话的同文同分钟会被去重成一条。这条守两件事：
//   ① 静态：dayu/index.js 里至少一处 appendEvent( 带 session（调用点一漏，id 里 session 就永远是空）；
//   ② 真跑：临时家、同一设备、同一句话——不同 session = 2 条且 id 不同；同 session 重放 = 1 条。
ok('session 真进记忆 id：调用点传了 + 临时家真跑（不同会话 2 条 / 同会话重放 1 条）', () => {
  const src = read('dayu/index.js')
  const calls = src.split('\n').filter((l) => l.includes('appendEvent('))
  const withSession = calls.filter((l) => /appendEvent\([^)]*\bsession:\s*[A-Za-z_$][\w$.]*/.test(l))
  assert.ok(withSession.length >= 1, `dayu/index.js 里 ${calls.length} 处 appendEvent( 没有一处带 session —— id 里的 session 永远是空`)
  // 老数据没有 session 的后果必须写清楚（id 不变、不影响读取、只影响去重粒度）
  // 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书）｜scripts/regression.mjs:3647-3648｜
  // read 的文件指针从 lib/memory.js 指到 memory-core/store.mjs；报错文案里的文件名同步改（断言的 needle 一字没动）｜一条断言都没加、没删、没减弱
  const mem = read('memory-core/store.mjs')
  assert.ok(mem.includes('老数据没有 session 的后果'), 'memory-core/store.mjs 没写「老数据没有 session」的后果')
  // 真跑：子进程里改 DSH_HOME 到临时家再 import memory.js（它 import 时就定死家目录）
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'test-memory-session.mjs')), 'scripts/test-memory-session.mjs 不见了')
  runTestScript('scripts/test-memory-session.mjs')
  return `${calls.length} 处调用里 ${withSession.length} 处带 session；临时家真跑：不同会话 2 条 id 不同、同会话重放去重`
})




// 2026-11-02：README 里让人跑的脚本，必须真在包里（手机上装完发现 first-run.mjs 没打包）。
// 这条查 dist：README 提到 scripts/*.mjs 的一个都不能少。
ok('README 里让人跑的脚本，包里都有', () => {
  const dist = path.join(ROOT, 'dist', 'dsh-yushen-twins')
  has('README.md', 'first-run.mjs')
  if (!fs.existsSync(dist)) return 'dist 还没打，跳过（打包后由 verify-tgz 兜）'
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  const wanted = [...new Set([...readme.matchAll(/scripts\/([A-Za-z0-9_\-\u4e00-\u9fa5]+\.mjs)/g)].map((m) => m[1]))]
  // 这几个只在开发者/测试段出现，出厂包故意不带（带测试进包没意义，还涨体积）。
  const DEV_ONLY = new Set(['test-residence.mjs', 'import-legacy.mjs', 'test-three-role-ui.mjs', 'nest-ui-check.mjs', 'style.mjs'])
  const missing = wanted.filter((f) => !DEV_ONLY.has(f) && !fs.existsSync(path.join(dist, 'scripts', f)))
  assert.deepEqual(missing, [], `README 提到但包里没有：${missing.join(', ')}`)
  return `README 提到 ${wanted.length} 个脚本，包里都在`
})
// 2026-11-02 手机端实测：三个包共用的 cordis.patch.yml 把 name 写死成 dsh-yushen-twins，
// 于是 mobile 装不上、lite 直接挂。打包必须从 package.json 生成，这条守住。
ok('patch 里的 name 必须等于包名（手机端踩过）', () => {
  const dist = path.join(ROOT, 'dist', 'dsh-yushen-twins')
  if (!fs.existsSync(dist)) return 'dist 还没打，跳过'
  const pkg = JSON.parse(fs.readFileSync(path.join(dist, 'package.json'), 'utf8').replace(/^\uFEFF/, ''))
  const yml = fs.readFileSync(path.join(dist, 'cordis.patch.yml'), 'utf8')
  const nameLine = (yml.match(/^\s*name:\s*(\S+)/m) || [])[1]
  const idLine = (yml.match(/^\s*-\s*id:\s*(\S+)/m) || [])[1]
  assert.equal(nameLine, pkg.name, `patch name=${nameLine} 与包名 ${pkg.name} 不一致`)
  assert.equal(idLine, pkg.name, `patch id=${idLine} 与包名 ${pkg.name} 不一致`)
  has('scripts/pack-release.mjs', 'cordis.patch.yml')
  return `${pkg.name} 两处一致`
})

// 2026-11-04：安卓上的 DSH 没有 webServer 服务，手机包必须只注入 sessions，
// 否则真机上整个插件会被撤销安装（0.2.6 实测）。
ok('手机包不注入 webServer（安卓真机踩过）', () => {
  const idx = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')
  assert.match(idx, /const MOBILE_BUILD = false/, 'index.js 缺 MOBILE_BUILD 开关')
  assert.match(idx, /MOBILE_BUILD \? \['sessions'\] : \['sessions', 'webServer'\]/, 'inject 没按 MOBILE_BUILD 分叉')
  assert.match(idx, /if \(!MOBILE_BUILD\) ctx\.effect\(/, 'HTTP 路由没有按 MOBILE_BUILD 跳过')
  const pack = fs.readFileSync(path.join(ROOT, 'scripts', 'pack-mobile.mjs'), 'utf8')
  assert.ok(pack.includes("const MOBILE_BUILD = false"), 'pack-mobile 没有翻 MOBILE_BUILD')
  const dist = path.join(ROOT, 'dist-mobile', 'dsh-yushen-twins-mobile', 'index.js')
  if (fs.existsSync(dist)) {
    const mob = fs.readFileSync(dist, 'utf8')
    assert.match(mob, /const MOBILE_BUILD = true/, 'dist-mobile 里 MOBILE_BUILD 还是 false')
  }
  return '开关在，打包会翻'
})

// 2026-11-02：tick 里 spawnSync 调的脚本，包里必须都有（reindex.mjs 曾是空的，每小时静默失败）。
ok('tick 调的脚本都在包里', () => {
  const dist = path.join(ROOT, 'dist', 'dsh-yushen-twins', 'scripts')
  if (!fs.existsSync(dist)) return 'dist 还没打，跳过'
  const idx = fs.readFileSync(path.join(ROOT, 'dayu', 'index.js'), 'utf8')
  const refs = [...new Set([...idx.matchAll(/['"]scripts['"],\s*['"]([A-Za-z0-9_\-.]+\.mjs)['"]/g)].map((m) => m[1]))]
  const missing = refs.filter((f) => !fs.existsSync(path.join(dist, f)))
  assert.deepEqual(missing, [], `tick 引用了但包里没有：${missing.join(', ')}`)
  return `${refs.length} 个引用脚本都在`
})
// 2026-11-02：出厂检验脚本必须在（三档真跑由 scripts/accept-release.mjs 做，这里只守接线）。
ok('出厂检验：装得上、能建家、记得住、清单对得上', () => {
  has('scripts/accept-release.mjs', 'patch 名与包名一致')
  has('scripts/accept-release.mjs', 'MANIFEST 的 sha 都对得上')
  has('scripts/accept-release.mjs', '出厂检验写入')
  const dir = path.join(ROOT, 'release')
  const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.tgz')) : []
  assert.ok(list.length > 0, 'release 里没有包')
  return `release 里有 ${list.length} 个包`
})
// 2026-11-02 老板定：钥匙只能本机用，禁止外传。仓库里出现明文 key 就红。
// 2026-11-03（老板：「本地密码那个去掉，就留云端的我有的那个」）：只留一把钥匙——
// 加密备份脚本读云端那把（云备份.py 同一把），不再另生成 ~/.dsh/backup-key.txt。
// 改｜2026-11-03 16:3x｜大鱼·工作台｜授权：老板（原话如上）｜scripts/regression.mjs:3681-3696｜新增 1 条 4 项｜为什么：两把钥匙"左一把右一把"，最后不知道锁谁；而且第二把是脚本自己生成的，老板根本没印象｜可改：只许加
ok('加密只留一把钥匙：云端那把，开所有加密包', () => {
  has('scripts/backup-encrypted.mjs', "path.join(DSH, 'dayu', '云备份密钥.txt')")
  assert.equal(/const KEY_FILE = path\.join\(DSH, 'backup-key\.txt'\)/.test(read('scripts/backup-encrypted.mjs')), false, '又指回本地那把了')
  // 作业手册在仓库外面（..\docs\常用作业.md），有才查；出厂包不带它
  const book = path.join(ROOT, '..', 'docs', '常用作业.md')
  if (fs.existsSync(book)) {
    const text = fs.readFileSync(book, 'utf8')
    assert.equal(text.includes('待合并到上面那份'), false, '作业手册还写着"待合并"')
    assert.ok(text.includes('唯一一把加密口令'), '作业手册没写"唯一一把"')
  }
  return 'KEY_FILE=云备份密钥；手册已改口径（本机有才查）'
})

ok('钥匙不许进仓库（只许在本机 keys.env）', () => {
  has('scripts/check-keys.mjs', '发现明文 key')
  has('lib/keys-allow.json', 'test-')
  const ran = runTestScript('scripts/check-keys.mjs')
  return ran ? '仓库扫描干净（只允许测试脚本里的假 key）' : '接线在；这回合没真跑'
})
// 2026-11-02：上下文到点提醒——之前只说过、从没实现（代码里连阈值都没有）。
ok('上下文到点会提醒（不是嘴上说的）', () => {
  has('scripts/check-context.mjs', 'context-notice.json')
  has('scripts/check-context.mjs', '该准备换会话')
  has('lib/soul.js', 'context-notice.json')
  has('scripts/maintenance.mjs', 'check-context.mjs')
  const r = runTestScript('scripts/check-context.mjs')
  return r ? '量尺能跑、阈值接线在' : '接线检查通过；这回合环境不给子进程，没真跑'
})
// 2026-11-02：余额卡片上写着「工作台那边的账本停了」——根因是工作台用量文件从来没人生成。
// 这条守住：工作台回话必须落账（key=workbench），且 .dshw-usage.json 会写出来。
ok('工作台也要有账本（不是只有 QQ 侧）', () => {
  has('lib/usage-workbench.js', "key: 'workbench'")
  has('lib/usage-workbench.js', '.dshw-usage.json')
  has('dayu/index.js', 'recordWorkbenchTurn')
  return '接线在：每轮回话写账本 + 补 .dshw-usage.json'
})

// 改｜2026-11-02 14:52｜大鱼·子会话（工作台）｜授权：主人（本次任务书：把「有案可稽」落成可自动检查的规矩）｜scripts/regression.mjs:3564-3640｜末尾只加三条断言：①FIELDS≥6 且 parseTrace 认得出缺项；②docs/改动留痕.md 有六要素表与扩展写法；③真跑 check-trace.mjs——默认范围绿、本次改动的 5 个文件六要素齐｜为什么：规矩不落断言就只是文档，改坏了没人知道｜验证：node scripts/regression.mjs 全绿；check-trace --files 五个文件退出 0｜可改：只增不改（老断言一条没动）；判据不许放宽
const { FIELDS: TRACE_FIELDS, REQUIRED_FIELDS: TRACE_REQUIRED, parseTrace: parseTraceLine } = await import(pathToFileURL(path.join(ROOT, 'lib/trace-standard.js')).href)
ok('改动留痕：六要素定义只有一份（lib/trace-standard.js）', () => {
  assert.ok(Array.isArray(TRACE_FIELDS) && TRACE_FIELDS.length >= 6, `FIELDS 只有 ${TRACE_FIELDS.length} 项`)
  assert.ok(TRACE_REQUIRED.length >= 6, `必填只有 ${TRACE_REQUIRED.length} 项`)
  for (const key of ['by', 'at', 'where', 'why', 'auth', 'evidence']) {
    assert.ok(TRACE_FIELDS.some((f) => f.key === key), `FIELDS 缺 ${key}`)
  }
  const good = parseTraceLine('改｜2026-11-02 14:50｜大鱼·子会话｜授权：主人（本次任务书）｜lib/trace-standard.js:1-120｜新增六要素真源｜为什么：文档里的规矩要能机器查｜验证：node scripts/check-trace.mjs 退出 0｜可改：只增不删')
  assert.equal(good.ok, true, `标准例子判不过：缺 ${good.missing.join('、')}`)
  const bad = parseTraceLine('改｜2026-11-02 14:50｜大鱼·子会话｜授权：主人｜lib/x.js:1｜改了｜为什么：要能机器查｜可改：可改')
  assert.ok(bad.missing.includes('怎么验'), `缺「怎么验」没认出来：${bad.missing.join('、')}`)
  return `FIELDS ${TRACE_FIELDS.length} 项（必填 ${TRACE_REQUIRED.length}）· parseTrace 认得出缺项`
})
ok('改动留痕：文档有六要素表、扩展写法和三个例子', () => {
  const doc = read('docs/改动留痕.md')
  for (const label of ['谁', '何时', '何地', '何因', '谁要求', '怎么验']) {
    assert.ok(doc.includes(`| ${label} |`), `文档表格里缺「${label}」`)
  }
  assert.ok(doc.includes('lib/trace-standard.js'), '文档没说定义在哪（lib/trace-standard.js）')
  assert.ok(doc.includes('可扩展字段怎么加'), '文档没写怎么加字段')
  assert.ok(doc.includes('三个例子'), '文档没有三个例子')
  assert.ok(doc.includes('验证：'), '文档里的例子没带「验证：」')
  return '六要素表 + 扩展 + 三例都在'
})
ok('改动留痕：真跑 check-trace，当前仓库绿', () => {
  const run = (args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-trace.mjs'), ...args], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, YUSHEN_TEST: '1' },
  })
  const touched = ['lib/trace-standard.js', 'scripts/check-trace.mjs', 'lib/worklog.js', 'lib/motto.js', 'scripts/pack-release.mjs', 'scripts/regression.mjs']
    .filter((f) => fs.existsSync(path.join(ROOT, f))) // 出厂包里没有打包工具，不能因此变红
  const r1 = run(['--files', touched.join(',')])
  assert.equal(r1.status, 0, `本次改动的文件缺留痕：\n${String(r1.stdout || '').slice(0, 800)}\n${String(r1.stderr || '').slice(0, 400)}`)
  assert.ok(String(r1.stdout).includes('六要素'), '输出里没有六要素提示')
  // 出厂包里没有 .git：默认范围退化成全量扫（老账会红），包内只跑 --files。
  // 这里用 resolve 拼路径：打包清单那条断言会扫「join 出来的顶层目录」，写成字面量会把 .git 当成要发的目录。
  if (!fs.existsSync(path.resolve(ROOT, '.git'))) {
    return `包里没有 git：默认范围跳过；本次 ${touched.length} 个文件六要素齐`
  }
  const r0 = run([])
  assert.ok(r0.status !== null, `check-trace 跑不起来：${r0.error?.code || '没有状态码'}`)
  assert.equal(r0.status, 0, `check-trace 默认范围不绿：\n${String(r0.stdout || '').slice(0, 800)}\n${String(r0.stderr || '').slice(0, 400)}`)
  return `默认退出 0（老账不追溯）· 本次 ${touched.length} 个文件六要素齐`
})

// 改｜2026-11-02 16:30｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，用系统时间）｜scripts/regression.mjs:3620-3700｜新增三条断言：全仓无手写时区偏移、clock.js 跟随系统时区且能覆盖、docs/时间.md 规矩在｜为什么：规矩只写在文档里会退回去——41 处偏移就是这么一处一处长出来的｜验证：node scripts/regression.mjs 三条全绿，且全仓扫描命中 0｜可改：三条只许加严，不许放宽成「允许少量」
ok('时间：全仓不再手写时区偏移（本地时间只从 lib/clock.js 取）', () => {
  const SKIP = /(^|[\\/])(?:dist|dist-lite|dist-mobile|release|archive|\.snapshots|\.state|\.git|node_modules|repair-helper|trial|blank|kernel|preset|docs)([\\/]|$)/
  const SELF = path.resolve(ROOT, 'scripts/regression.mjs') // 这条断言自己要把模式写出来，跳过自己
  const BAD = /8 \* 3600e3|8 \* 3600 \* 1000/
  const hits = []
  let scanned = 0
  const walk = (dir) => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(dir, e.name)
      const rel = path.relative(ROOT, p).replace(/\\/g, '/')
      if (SKIP.test(rel)) continue
      if (e.isDirectory()) { walk(p); continue }
      if (!/\.(?:js|mjs|cjs)$/.test(e.name)) continue
      if (path.resolve(p) === SELF) continue
      scanned += 1
      const body = fs.readFileSync(p, 'utf8')
      body.split('\n').forEach((line, i) => { if (BAD.test(line)) hits.push(rel + ':' + (i + 1)) })
    }
  }
  walk(ROOT)
  assert.deepEqual(hits, [], '还在手写时区偏移（换成 lib/clock.js）：' + hits.join(', '))
  return '扫 ' + scanned + ' 个源码文件，命中 0'
})
ok('时间：lib/clock.js 跟随系统时区、YUSHEN_TZ 能覆盖、不写死时区名', () => {
  for (const fn of ['now', 'nowMs', 'localISO', 'today', 'dayKey', 'todayIn', 'fmt', 'fmtFull', 'zone']) {
    assert.equal(typeof CLOCK[fn], 'function', 'lib/clock.js 没导出 ' + fn)
  }
  const src = read('lib/clock.js')
  assert.ok(!src.includes('Asia/Shanghai'), 'lib/clock.js 里写死了时区名：应该跟随系统，或由 YUSHEN_TZ 指定')
  const d = new Date()
  const iso = CLOCK.localISO(d)
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, 'localISO 格式不对：' + iso)
  assert.ok(Math.abs(CLOCK.nowMs() - Date.now()) < 5000, 'nowMs 不是现在')
  assert.ok(CLOCK.now() instanceof Date, 'now 不返回 Date')
  const p = (n) => String(n).padStart(2, '0')
  if (!process.env.YUSHEN_TZ) {
    const offMin = -d.getTimezoneOffset()
    const wantOff = (offMin < 0 ? '-' : '+') + p(Math.floor(Math.abs(offMin) / 60)) + ':' + p(Math.abs(offMin) % 60)
    assert.ok(iso.endsWith(wantOff), 'localISO 的偏移 ' + iso.slice(-6) + ' 不等于系统时区 ' + wantOff + '：说明还在自己算一套时间')
    assert.equal(CLOCK.today(d), d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()), 'today() 不等于本机日期')
    assert.equal(CLOCK.fmt(d, 'HH:mm'), p(d.getHours()) + ':' + p(d.getMinutes()), 'fmt(HH:mm) 不等于本机时刻')
    assert.equal(CLOCK.fmtFull(d).slice(0, 19), CLOCK.today(d) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()), 'fmtFull 跟本机时刻对不上')
  }
  assert.equal(CLOCK.dayKey(d.getTime()), CLOCK.today(d), 'dayKey(ms) 跟 today(d) 不一致')
  const old = process.env.YUSHEN_TZ
  try {
    process.env.YUSHEN_TZ = 'UTC'
    assert.equal(CLOCK.zone(), 'UTC', 'YUSHEN_TZ 没生效')
    assert.ok(CLOCK.localISO(d).endsWith('+00:00'), 'YUSHEN_TZ=UTC 时 localISO 还是别的偏移')
    assert.equal(CLOCK.localISO(d).slice(0, 10), d.toISOString().slice(0, 10), 'UTC 下 localISO 的日期不等于 UTC 日期')
  } finally {
    if (old === undefined) delete process.env.YUSHEN_TZ
    else process.env.YUSHEN_TZ = old
  }
  return '跟随系统时区 ' + CLOCK.zone() + '；YUSHEN_TZ 覆盖有效'
})
ok('时间：docs/时间.md 写清「系统时间 + clock.js + 禁止手写偏移 + seq 才是顺序」', () => {
  const doc = read('docs/时间.md')
  for (const needle of ['lib/clock.js', '系统时间', '禁止', 'seq', 'YUSHEN_TZ', '故意不是系统时间']) {
    assert.ok(doc.includes(needle), 'docs/时间.md 没写「' + needle + '」')
  }
  assert.ok(read('README.md').includes('docs/时间.md'), 'README 没指向 docs/时间.md：装了插件的人找不到这条规矩')
  return '规矩、函数对照、例外清单、机器判据都在'
})

// 改｜2026-11-02 16:50｜大鱼·子会话（工作台）｜授权：主人（本次任务书：统一时间观念，收尾要全绿）｜scripts/regression.mjs:3686｜把被 process.exit 挡住、参数还传错的 B站 断言挪到汇总之前并让它真跑｜为什么：它写在 process.exit 后面从来没跑过；runTestScript 只收一个参数，"scripts/bili-desc.mjs --check" 被当成路径，必然 ESM 解析失败——这就是「绿着红」｜验证：node scripts/regression.mjs 这条绿；出厂包里没有这份文案时跳过而不是红｜可改：三条检查只许加严
ok('B站简介必须带插件链接和群号', () => {
  // 出厂包里不带投稿工具与文案（只在本机发布时用）：没有就跳过，别让包内回归红。
  if (!fs.existsSync(path.join(ROOT, 'scripts/bili-desc.mjs')) || !fs.existsSync(path.join(ROOT, 'docs/B站发布-固定尾巴.md'))) return '出厂包里没有投稿工具/文案：跳过'
  has('scripts/bili-desc.mjs', 'TAIL_LINK')
  has('scripts/bili-desc.mjs', 'TAIL_GROUP')
  has('docs/B站发布-固定尾巴.md', '1132802806')
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/bili-desc.mjs'), '--check', 'docs/B站发布-固定尾巴.md'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, YUSHEN_TEST: '1' } })
  assert.equal(r.status, 0, 'bili-desc --check 没过：' + String(r.stdout || '').slice(0, 300) + String(r.stderr || '').slice(0, 300))
  return '尾巴齐：链接 + 群号（真跑过）'
})

// 改｜2026-11-02 15:03｜大鱼·子会话（工作台）｜授权：主人（本次任务书：收尾要全绿）｜scripts/regression.mjs:3612-3618｜把「回归：通过/失败」和退出码从 :3493 挪到文件末尾：原来后面还有 10 条断言（README/包/patch/tick/出厂/钥匙/上下文/工作台/改动留痕×3），尾部红了不计数、退出码还是 0｜为什么：会「绿着红」——tick 那条刚在尾部失败，前面却印 192/0｜验证：node scripts/regression.mjs 汇总数=实际断言数；尾部有 ✗ 时退出码 1｜可改：汇总只许放最后；尾部再加断言不用再动它
// 改｜2026-11-02 16:25｜大鱼·子会话（工作台）｜授权：主人（本次任务书：她这轮能自己决定说不说）｜scripts/regression.mjs:3790-3855｜只加两条断言：①quiet 状态文件读写/过期/会话匹配有单测，并在临时家真写一遍验六字段；②/decide 发前查 quiet、桥发前也查（静态），quiet 模块里不许出现概率｜为什么：光有出口不算数，要能证明它真会失效、真不是概率、真留了记录｜验证：node scripts/regression.mjs 这两条全绿；单测被 runTestScript 真跑｜可改：只增不改，判据不许放宽
const QUIET = await import(pathToFileURL(path.join(ROOT, 'lib/quiet-turn.js')).href)
const { qqBridgeSrc } = await import(pathToFileURL(path.join(ROOT, 'lib/paths.js')).href)
ok('她这轮能说「不说」：quiet 标记会生效、会过期，判断有记录（真跑单测）', () => {
  const ran = runTestScript('scripts/test-quiet.mjs')
  // 在临时家里真写一遍：验写入函数与六字段（不碰真家）。
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-quiet-reg-'))
  const old = process.env.DSH_HOME
  try {
    process.env.DSH_HOME = home
    assert.equal(QUIET.markQuiet('dayu', { why: '' }).ok, false, 'why 空必须拒绝')
    const m = QUIET.markQuiet('dayu', { why: '这轮不想接', minutes: 10 })
    assert.equal(m.ok, true)
    assert.equal(QUIET.readQuiet({ role: 'dayu', scope: 'group:1' }).active, true, '刚写的标记必须命中')
    assert.equal(QUIET.readQuiet({ now: Date.now() + 11 * 60000, role: 'dayu', scope: 'group:1' }).active, false, '过期必须自动失效')
    assert.equal(QUIET.clearQuiet('dayu').ok, true)
    const rec = QUIET.recordReplyDecision({ role: 'dayu', channel: 'qq', key: 'group:1', decided: 'quiet', why: '这轮不想接', textLen: 0, costYuan: 0 })
    assert.equal(rec.ok, true)
    const line = fs.readFileSync(QUIET.replyDecisionsFile(), 'utf8').trim().split(/\r?\n/)[0]
    const row = JSON.parse(line)
    for (const k of ['at', 'channel', 'decided', 'why', 'textLen', 'costYuan']) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, k), `reply-decisions.jsonl 缺字段 ${k}`)
    }
    assert.ok(QUIET.lastReplyDecisionLine('dayu').length <= 60, '简报那行不许超过 60 字')
    assert.ok(QUIET.decisionStats({ sinceMs: 86400e3 }).quiet >= 1)
  } finally {
    if (old === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = old
    fs.rmSync(home, { recursive: true, force: true })
  }
  return ran ? '单测 + 临时家真写：过期/匹配/六字段都验了' : '接线与真写通过；这回合环境不给子进程，单测没真跑'
})
ok('「不说」的接线在：/decide 发前查 quiet，桥发前也查（不是概率）', () => {
  has('lib/quiet-turn.js', 'export function markQuiet')
  has('lib/quiet-turn.js', 'export function readQuiet')
  has('lib/quiet-turn.js', 'export function recordReplyDecision')
  has('lib/quiet-turn.js', 'export function lastReplyDecisionLine')
  const idx = read('dayu/index.js')
  assert.ok(idx.includes("if (a === 'quiet')"), 'yushen_self 里没有 quiet 出口')
  assert.ok(idx.includes('readQuiet({ role, scope: msg.key })'), '/decide 没查 quiet-turn.json')
  assert.ok(idx.indexOf('readQuiet({ role, scope: msg.key })') < idx.indexOf('const byBody = await decideByBody'), 'quiet 检查必须排在叫她本体/叫模型之前')
  assert.ok(read('lib/brief.js').includes('lastReplyDecisionLine(role)'), '简报没带「上一轮怎么判断」那一行')
  // 只查代码行，不查注释：注释里可以写「以前是 skipProbability」，那是说明，不是实现。
  const quietCode = read('lib/quiet-turn.js').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n')
  assert.ok(!/Math\.random|skipProbability/.test(quietCode), 'quiet 必须是她的决定，不许用概率')
  const bridge = qqBridgeSrc() ? path.join(qqBridgeSrc(), 'bridge.js') : ''
  if (!bridge || !fs.existsSync(bridge)) return 'quiet 读写/接线在；出厂包没有 QQ 桥，桥侧静态检查跳过'
  const src = fs.readFileSync(bridge, 'utf8')
  assert.ok(src.includes('quiet-turn.json') && src.includes('function quietTurnHit('), '桥没有读 quiet-turn.json')
  assert.ok(src.includes('const quietWake = quietTurnHit(key)'), '桥的唤醒路径没查 quiet（会照旧叫模型）')
  assert.ok(src.includes('const quietNow = quietTurnHit(key)'), '桥的发送路径没查 quiet')
  assert.ok(src.includes('const quietTool = quietTurnHit('), '桥的工具发送路径没查 quiet')
  return '插件 /decide 与桥的唤醒/发送/工具发送都在发前查；quiet 模块里没有概率'
})

// 2026-11-02 老板：「传承是挂墙上好看的，还是真的日常能运用」——把它落进派活简报。
ok('传承落在派活里（传路径不传结论）', () => {
  has('core/dispatch.js', '传路径不传结论')
  has('docs/习得-书怎么变成自己的.md', '传路径不传结论')
  return '派活简报里每次都会带上这句'
})

// 2026-11-02 老板：「总的问题还是手册没有发到位，所以不知道怎么用」——把这几样挂进按需发放。
ok('手册发得出去：成语/传承/习得 有章节、能被关键词命中', () => {
  has('lib/handbook-policy.js', "id: 'method'")
  has('lib/handbook-policy.js', '传路径不传结论')
  const r = runTestScript('scripts/test-handbook-method.mjs')
  return r ? 'method 章节在，关键词能命中' : '接线在；这回合没真跑'
})

// 2026-11-02 老板：「角色卡是角色卡，角色记忆是角色记忆……包括经验、知识等等，做好区分、标记，
// 这样分开来她才能精准地按需注入。」——这一轮只分类、不迁移（卡一个字节没动），先锁四件事：
//   ① 四类的落点都在（卡 / 记忆 / 错题本+判断账本 / culture+手册），注入分层的文档也在；
//   ② 分类表与真卡对得上（strict 分类不掉段、不误配——卡改了却忘了改表，这里就红）；
//   ③ split-card --dry 跑得动，而且**一个字节都不写**（卡/记忆/错题本前后哈希一样）；
//   ④ 卡的常驻层（core）三人都在 4000 以内。
const SPLIT_CARD = await import(pathToFileURL(path.join(ROOT, 'scripts', 'split-card.mjs')).href)
const SPLIT_MAP = await import(pathToFileURL(path.join(ROOT, 'scripts', 'card-split-map.mjs')).href)

ok('四类分开：卡/记忆/经验/知识的落点都在，注入分层写清了常驻与按需', () => {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const soul = path.join(home, 'dayu', 'soul')
  const need = [
    ['卡', path.join(soul, 'cards')],
    ['记忆', path.join(soul, 'memory')],
    ['错题本', path.join(home, 'dayu', 'mistakes', '错题本.jsonl')],
    ['判断账本', path.join(soul, '自我笔记.jsonl')],
    ['culture 库', path.join(home, 'dayu', 'culture', 'library.jsonl')],
  ]
  for (const [name, p] of need) assert.ok(fs.existsSync(p), `${name}的落点不见了：${p}`)
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', '注入分层.md')), 'docs/注入分层.md 不见了')
  has('docs/注入分层.md', '4000')
  has('docs/注入分层.md', '按需')
  has('docs/注入分层.md', 'kind=mem')
  has('scripts/split-card.mjs', 'card-split-20261102')
  has('scripts/split-card.mjs', '没有写任何文件')
  return `四类都在（${need.map((n) => n[0]).join('/')}）；分层文档写了 4000 与按需`
})

ok('四类分开：分类表与真卡对得上，常驻层 ≤ 4000', () => {
  const lines = []
  let checked = 0
  for (const role of SPLIT_MAP.ROLES) {
    const file = SPLIT_CARD.cardFileFor(role)
    if (!fs.existsSync(file)) continue
    const text = fs.readFileSync(file, 'utf8')
    const segs = SPLIT_CARD.parseSegments(text)
    // strict：分类表里每条规则都必须落在卡上某一段上，少了就抛（卡改了没改表）
    const rows = SPLIT_CARD.classify(role, segs, SPLIT_MAP)
    assert.equal(rows.length, segs.length, `${role} 有段没被分类`)
    for (const r of rows) assert.ok(['card', 'mem', 'exp', 'know'].includes(r.cls), `${role}#${r.i} 的类不认识：${r.cls}`)
    const core = (SPLIT_MAP.CORE_SECTIONS || {})[role] ?? null
    const s = SPLIT_CARD.stats(rows, text.replace(/\s/g, '').length, core)
    assert.ok(s.coreChars <= SPLIT_CARD.CARD_CAP, `${role} 常驻层超了：${s.coreChars} 字 > ${SPLIT_CARD.CARD_CAP}（去重，不要截断）`)
    checked += 1
    lines.push(`${role} ${rows.length} 段/core ${s.coreChars}`)
  }
  assert.ok(checked > 0, '一张卡都没读到，这条断言空转了')
  return lines.join('；')
})

ok('split-card dry-run 跑得动，而且一个字节都不写', () => {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const soul = path.join(home, 'dayu', 'soul')
  const watch = []
  for (const role of SPLIT_MAP.ROLES) {
    const card = SPLIT_CARD.cardFileFor(role)
    if (fs.existsSync(card)) watch.push(card)
    const mem = path.join(soul, 'memory', `${role}.json`)
    if (fs.existsSync(mem)) watch.push(mem)
  }
  const wrong = path.join(home, 'dayu', 'mistakes', '错题本.jsonl')
  if (fs.existsSync(wrong)) watch.push(wrong)
  const before = watch.map((f) => `${f}|${fs.statSync(f).size}|${fs.statSync(f).mtimeMs}`)
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'split-card.mjs'), '--role', 'dayu', '--dry'], {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home },
  })
  const code = String(r.error?.code || '')
  if (r.status === null && (code === 'EPERM' || code === 'EACCES')) return '接线在；这个环境不让开子进程'
  assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 400))
  const out = String(r.stdout || '')
  assert.ok(out.includes('会从卡里移走'), `dry-run 没吐该有的结论：${out.slice(0, 200)}`)
  assert.ok(out.includes('没有写任何文件'), 'dry-run 没声明不写文件')
  const after = watch.map((f) => `${f}|${fs.statSync(f).size}|${fs.statSync(f).mtimeMs}`)
  assert.deepEqual(after, before, 'dry-run 居然动了卡/记忆/错题本——它只该演算')
  const line = out.split('\n').find((l) => l.includes('会从卡里移走')) || ''
  return `扫了 ${watch.length} 个文件，前后一字不差；输出：${line.trim()}`
})

// 2026-11-02 老板：「为什么每条都要回原文找，不能一次提取出来吗」——精提炼从逐条改批量，
// 并要求写库前严格校验。这条锁三件事：① 分批口径（按 通道+日期、每批 10–20 段、缺 id 补跑）；
// ② 五条红线一条不少；③ 离线自检真跑一遍（不让开子进程就只核源码，不冒充绿也不冒充红）。
ok('精提炼：批量提炼 + 写库前严格校验（离线自检）', () => {
  has('scripts/refine.mjs', 'planBatches')
  has('scripts/refine.mjs', '段落${i + 1}（id=${r.id}）')
  has('scripts/refine.mjs', 'extractJsonArray')
  has('scripts/refine.mjs', '只补跑这些')
  has('scripts/refine.mjs', '退化为逐条')
  has('memory-core/runtime/refine-judge.js', "why: 'head 空'")
  has('memory-core/runtime/refine-judge.js', 'head 太短')
  has('memory-core/runtime/refine-judge.js', 'detail 太短')
  has('memory-core/runtime/refine-judge.js', '没有 fromRef')
  has('memory-core/runtime/refine-judge.js', 'kind 不在三类里')
  has('memory-core/runtime/refine-judge.js', '重复：同一 fromRef 已存在')
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'refine.mjs'), '--selftest'], {
    encoding: 'utf8',
    env: { ...process.env },
  })
  const code = String(r.error?.code || '')
  if (r.status === null && (code === 'EPERM' || code === 'EACCES')) return '接线在；这个环境不让开子进程，只核了源码'
  assert.equal(r.status, 0, String(r.stderr || r.stdout || '').slice(0, 400))
  const out = String(r.stdout || '')
  const m = out.match(/自检：(\d+)\/(\d+) 通过/)
  assert.ok(m, `自检没打印结果：${out.slice(-300)}`)
  assert.equal(m[1], m[2], `有自检项没过：${out.split('\n').filter((l) => l.startsWith('✗')).join('；')}`)
  assert.ok(Number(m[2]) >= 25, `自检项只剩 ${m[2]} 条——批量/分批/五条红线至少 25 条`)
  return `${m[2]} 项离线自检全过（分批 10–20、截断抢救、id 对齐、五条红线、算钱）`
})

// 2026-11-02 小鱼：会话归档原来一个 skipped 同时装「没变化」和「解析不出」——
// 一个从没归档过、又解析不出的会话，长得跟「没变化」一模一样，永远静默跳过；
// 而且整条链没有「跑过」的痕迹（11-01 是靠发现归档 18.5 小时没更新才知道它停了）。
ok('会话归档留「跑过」的痕迹，skipped 拆成两种', () => {
  has('lib/session-archive.js', 'unparsable')
  has('lib/session-archive.js', 'archive-health.json')
  has('lib/session-archive.js', 'unchanged')
  const code = read('lib/session-archive.js').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n')
  assert.equal(/skipped\+\+/.test(code), false, 'skipped++ 又回来了——「没变化」和「解析不出」会重新混成一个数')
  return 'health 文件 + unparsable 单独记；skipped++ 不在了'
})

// 2026-11-02 老板：「她只有一个本体，工作台社交卡都是本体分发下去的」——真源一份，场景副本由脚本生成。
ok('单人单卡：场景副本必须与真源一致', () => {
  has('scripts/sync-cards.mjs', 'AUTOGEN')
  // 2026-11-02 小鱼：这里原来写 runTestScript('scripts/sync-cards.mjs --check')——
  // runTestScript 只收一个「路径」，整串（含参数）会被当成文件名，必然 ESM 解析失败。
  // 跟 16:50 修的 'bili-desc.mjs --check' 是同一个错；而且这条被压在 process.exit 后面，从来没跑过。
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-cards.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' })
  const code = String(r.error?.code || '')
  if (r.status === null && (code === 'EPERM' || code === 'EACCES')) return '接线在；这回合环境不给子进程'
  assert.equal(r.status, 0, `sync-cards --check 没过：${String(r.stdout || r.stderr || '').slice(0, 300)}`)
  return '真源与场景副本一致'
})

// 2026-11-02 小鱼：汇总和 process.exit 必须在**文件最后**。
// 16:25 有人修过一次（把汇总从 :3493 挪到末尾），但后来又有人在 exit 后面加了「单人单卡」那条——
// 它从来没跑过，而且不会红。这类「绿着红」只能靠「exit 必须是最后一个语句」来防。
// 这条断言自己也在 exit 之前，所以它绿了，就说明前面所有断言（含被压在 exit 后面的）都跑到了。
// 2026-11-02 小鱼：这个坑踩过两次——16:25 有人把汇总从中间挪到末尾，后来又被新代码压回去，
// 「单人单卡」那条就压在 exit 后面从来没跑过，而且不会红。靠人记得修不住，所以让机器盯：
// ① `process.exit(` 只能出现一次（多出来的那个后面全是死代码）；② 它必须是文件最后一个非注释语句。
ok('regression 自己：process.exit 必须是文件最后一个语句', () => {
  const lines = read('scripts/regression.mjs').split(/\r?\n/)
  const code = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(x.l))
  const exits = code.filter((x) => /process\.exit\s*\(/.test(x.l) && !/['"`]/.test(x.l))
  assert.equal(exits.length, 1, `process.exit 出现了 ${exits.length} 次（只算真的执行、不算字符串里提到的）——多出来的那个后面全是死代码（永远不会跑，红了也不报）`)
  const last = code[code.length - 1]
  assert.match(last.l, /process\.exit\s*\(/, `regression.mjs 最后一句是「${last.l.trim().slice(0, 60)}」而不是 process.exit——写在 exit 后面的断言永远不会跑`)
  return 'exit 只出现一次，且是文件最后一句'
})

// 2026-11-02 老板：宿主工具（read/write/edit/pwsh/web_fetch/subagent…）不走 registerTool，
// 今天 4258 次调用一条经历都没落。按「轮」汇总：一轮最多一行，turn/end 收口。
// 这条断言盯的是「接线还在、去重口径没变」，不是它写得对不对（那是 test-ingest-host-tools.mjs 的活）。
const HOST_TOOLS = await import(pathToFileURL(path.join(ROOT, 'lib/ingest-host-tools.js')).href)
ok('经历层第四条来源：宿主工具按「轮」汇总，且不重复记插件自己的工具', () => {
  const src = read('lib/ingest-host-tools.js')
  has('lib/ingest-host-tools.js', 'export function attachHostTools')
  has('lib/ingest-host-tools.js', 'export function createHostToolRecorder')
  has('lib/ingest-host-tools.js', 'turn/end')
  has('dayu/index.js', 'attachHostTools(ctx, { log })')
  // 插件工具（yushen_/dayu_/m1_）已由 ingest-actions 记过：前缀表少一个，就等于同一次调用记两条。
  const { SKIP_PREFIXES, isPluginTool } = HOST_TOOLS
  for (const p of ['yushen_', 'dayu_', 'm1_']) assert.ok(SKIP_PREFIXES.includes(p), `跳过前缀里没有 ${p}——插件工具会被记两次`)
  assert.equal(isPluginTool('yushen_self'), true)
  assert.equal(isPluginTool('dayu_health'), true)
  assert.equal(isPluginTool('m1_x'), true)
  assert.equal(isPluginTool('pwsh'), false, '宿主工具被当成插件工具跳过了——那经历层还是空的')
  assert.equal(isPluginTool('subagent'), false, 'subagent 是她派活，算经历，不该跳过')
  assert.equal(isPluginTool('read'), false)
  // 聚合 key：sessionId|turn（一轮一条），不是 id|args（那会退回按条记）
  assert.ok(src.includes('sha(`${sid}|${bucket.turn}`)'), '聚合 key 变了——按轮汇总会退回按条记，一天 4000 多行')
  return '接线在；yushen_/dayu_/m1_ 跳过，pwsh/subagent 照记；key 还是 sessionId|turn'
})

// 2026-11-02 老板：桌宠右键要能看出"现在在忙什么、该不该重启"。
// 改｜2026-11-02 23:28｜大鱼·子会话（工作台；父会话 session-bef06908 委派）｜授权：老板（本次任务书：桌宠右键看后台任务）｜scripts/regression.mjs:4028-4066｜新增 1 条（里面四步）：busy.js 只读 + 五个来源都在、/api/yushen/busy 路由已挂、面板那几样（右键项/标题/刷新/复制/结论/schema）都在，最后真跑一遍 test-busy.mjs｜为什么：结论句是老板唯一会看的那一行，只有机器盯着才不会悄悄退化｜验证：node scripts/regression.mjs 全绿（含新增这条 + test-busy.mjs 七条）｜可改：只许加
ok('现在在忙什么：接口只读、面板接上、三种状态的结论句都对', () => {
  // ① 后端：五个来源 + 一个结论，且**一个写盘调用都不许有**（只读是红线）
  const src = read('lib/busy.js')
  for (const needle of ['export function busySnapshot', 'export function busyText', '本会话', '子代理', 'QQ 桥', '定时任务', '后台作业']) {
    assert.ok(src.includes(needle), `lib/busy.js 里没有「${needle}」`)
  }
  for (const bad of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'copyFileSync']) {
    assert.equal(src.includes(bad), false, `lib/busy.js 里出现了 ${bad}——它是只读接口，不许写任何状态`)
  }
  assert.ok(src.includes('看不到'), '拿不到的东西要写"看不到"，不许拿"看起来正常"冒充"没事"')
  // ② 路由：面板拉数据的那条
  has('index.js', "'/api/yushen/busy'")
  // ③ 前端：右键菜单项 + 面板标题 + 刷新 + 复制 + 底部结论
  const client = read('client.js')
  for (const needle of ["item('现在在忙什么'", 'busyRefresh', 'busyCopy', 'busyFoot', 'busyFriendly']) {
    assert.ok(client.includes(needle), `client.js 里没有「${needle}」`)
  }
  assert.ok(/busyBox[\s\S]{0,300}zIndex: '2147483647'/.test(client), '面板要挂最高一层，不然会被别的浮层盖住（实测被盖过）')
  // ④ 真跑一遍三种状态（全闲 / 子代理在跑 / 桥在回消息）
  runTestScript('scripts/test-busy.mjs')
  return '只读 ✓ 路由 ✓ 面板 ✓ 三种状态 ✓'
})

// 2026-11-02 老板截图：桌面堆了 29 个「鱼神修复助手.lnk.bak-*」，从 10-30 一路堆到 11-02。
// 改｜2026-11-02 23:5x｜大鱼·工作台｜授权：老板（"桌面上一大堆鱼神修复助手，删"）｜scripts/regression.mjs:4083-4096｜新增 1 条（两步）：repair-helper-install.js 里备份只留 1 份（SHORTCUT_BACKUPS_KEEP）+ 换完 lnk 真去收旧备份；再真跑一遍 test-repair-helper-upgrade.mjs｜为什么：自动升级每跑一次就多一个备份、从不清理，没人盯着就会重新堆满桌面；删掉那 29 个只治了这一次，不治下一次｜验证：node scripts/test-repair-helper-upgrade.mjs 5/5 通过；node scripts/regression.mjs 全绿（含新增这条）｜可改：只许加
ok('修复助手快捷方式备份只留一份，不再往桌面堆', () => {
  has('lib/repair-helper-install.js', 'const SHORTCUT_BACKUPS_KEEP = 1')
  has('lib/repair-helper-install.js', 'shortcutBackupsPruned = await pruneShortcutBackups(desktop, desktopShortcut)')
  // 收旧备份必须只认自己的精确前缀 + 纯数字时间戳，别的一概不碰（别人的 lnk 一个都不许进这条路径）
  has('lib/repair-helper-install.js', 'name.startsWith(prefix) && /^\\d+$/.test(name.slice(prefix.length))')
  runTestScript('scripts/test-repair-helper-upgrade.mjs')
  return '备份只留 1 份；5 组测试（升级/不堆/收旧/拒外人/首装不动）'
})

// 2026-11-03 00:0x（老板原话）：「这种东西为什么要放在宿主里面去做，不应该做个脚本之类的放到本地去，
// 宿主只需要发个命令」。实况：00:02:56–00:05:39 宿主心跳断了 164 秒、界面冻住，被当成"网络掉线"；
// 根因是 backupTick 在宿主进程里同步跑 fs.cpSync（3 万文件）+ 一串 spawnSync。
// 改｜2026-11-03 00:4x｜大鱼·工作台｜授权：老板（原话如上）｜scripts/regression.mjs:4094-4107｜新增 1 条：tick 只派发（不许出现 cpSync/runFullBackup/archiveSessions/spawnSync）、锁不叠跑、真 spawn+detached+unref、维护脚本在出厂包里，最后真跑一遍 test-maintenance-dispatch.mjs｜为什么：宿主一堵，界面就像掉线；这条防的是有人图省事把重活搬回 tick｜可改：只许加
ok('每日维护：宿主只发命令，重活在独立脚本里', () => {
  has('dayu/index.js', 'const dispatchMaintenance')
  has('dayu/index.js', 'if (maintenanceBusy()) return')
  has('scripts/maintenance.mjs', 'maintenance-last.json')
  has('scripts/pack-release.mjs', "'scripts/maintenance.mjs'")
  // 只允许宿主派发：这几个字符串回 tick 就是重活回来了
  const tickAt = read('dayu/index.js')
  const from = tickAt.indexOf('const backupTick = () => {')
  const to = tickAt.indexOf('setTimeout(backupTick, 3 * 60 * 1000)')
  assert.ok(from > 0 && to > from, 'backupTick 结构变了，回来改这条')
  const body = tickAt.slice(from, to)
  for (const heavy of ['cpSync', 'runFullBackup(', 'runOffsiteBackup(', 'archiveSessions(', 'spawnSync(']) {
    assert.equal(body.includes(heavy), false, `backupTick 里又出现 ${heavy}——重活得放 scripts/maintenance.mjs`)
  }
  runTestScript('scripts/test-maintenance-dispatch.mjs')
  return '派发 ✓ 锁 ✓ 真 node ✓ 包内 ✓ --plan ✓'
})

// 2026-11-03 01:2x（老板问「以后还会卡死吗」）：01:11 那次卡死的直接原因是——给备份加一个根以后，
// createBackup 要逐份 load() 历史快照来找「上一次同 root 集的」，而 load() 会把每份快照的每个对象
// 重新哈希校验。存量 364 份时＝140 万次文件读、几十 GB，一次备份被拖过 10 分钟周期。
// 改｜2026-11-03 01:2x｜大鱼·工作台｜授权：老板（"a+b"，b = 改 createBackup；并问「以后还会卡死吗」）｜scripts/regression.mjs:4113-4128｜新增 1 条：候选只读清单头 + 选中才完整校验 + 真跑 test-versioned-backup.mjs（里面含"旧快照对象被弄坏、换 root 集仍能备"）｜为什么：这类退化只在存量变大时才咬人，人眼看不出来，只能让机器天天量｜可改：只许加
ok('加备份根不再拖死备份：候选只读清单头，历史快照不做全量校验', () => {
  has('lib/versioned-backup.js', 'async function header(')
  has('lib/versioned-backup.js', 'head=await header(store,id)')
  has('lib/versioned-backup.js', 'previous=await load(store,id,max)')
  // 老写法（createBackup 的循环里逐份 load）不许回来；listSnapshots 里那份 load 是列表用的，不算
  const vb = read('lib/versioned-backup.js')
  const cbStart = vb.indexOf('export async function createBackup')
  const cbEnd = vb.indexOf('export async function inspectSnapshot')
  assert.ok(cbStart > 0 && cbEnd > cbStart, 'createBackup 结构变了，回来改这条')
  assert.equal(vb.slice(cbStart, cbEnd).includes('load(store,name.slice'), false, '又变成循环里逐份 load 了——存量一大就会再把备份拖死')
  runTestScript('scripts/test-versioned-backup.mjs')
  return '只读清单头 ✓ 选中才完整校验 ✓ 换根仍能备 ✓'
})

// 2026-11-03（老板：「加个计数……掉到 80% 就对比优化」+「开子代理」）：三件不危险的各由子会话落一样。
// 改｜2026-11-03 02:0x｜大鱼·工作台（三个子会话委派）｜授权：老板（本次任务书：不危险的先做、危险的先备份）｜scripts/regression.mjs:4134-4163｜新增 3 条：精提炼质量闸、查询改写第一档、关系库承诺与印象（三组都没删没改既有断言）｜为什么：这三样都是"加了但没人盯着"的类型，只能让机器天天量｜可改：只许加
ok('精提炼质量闸：硬红线逐轮判，趋势要连续 3 轮且样本够', () => {
  has('scripts/refine-quality.mjs', 'const HARD = Object.freeze({')
  has('scripts/refine-quality.mjs', 'const DROP_MAX = 0.20')
  has('scripts/refine-quality.mjs', 'const DEGRADE_MAX = 0.30')
  has('scripts/refine-quality.mjs', 'const TREND_ROUNDS = 3')
  has('scripts/refine-quality.mjs', 'const TREND_MIN_SAMPLES = 30')
  has('scripts/refine.mjs', 'refine-metrics.jsonl')
  runTestScript('scripts/test-refine-quality.mjs')
  return '四条硬红线 + 三条趋势（连续 3 轮 / 累计样本≥30）；13 例'
})

ok('查询改写第一档：纯函数、零成本、变体有上限', () => {
  has('lib/query-rewrite.js', 'export function rewrite')
  has('lib/query-rewrite.js', 'export function expandHits')
  has('lib/query-rewrite.js', 'const LIMITS = Object.freeze({')
  // 零成本这条是红线：不许联网、不许调模型
  const src = read('lib/query-rewrite.js')
  assert.equal(/fetch\(|https?:\/\//.test(src.replace(/^\s*\/\/.*$/gm, '')), false, 'query-rewrite.js 里出现了网络调用')
  runTestScript('scripts/test-query-rewrite.mjs')
  return '归一 / 剥问句 / 同义变体 / 重排（22 组断言）'
})

ok('关系库：承诺带到期、印象去重累加，且有入口', () => {
  has('lib/promises-rel.js', 'export function duePromises')
  has('lib/promises-rel.js', 'export function settlePromise')
  has('lib/impressions.js', 'export function addImpression')
  has('dayu/index.js', "name: 'yushen_promise'")
  has('dayu/index.js', "name: 'yushen_impression'")
  runTestScript('scripts/test-relations-extra.mjs')
  return '承诺 4 个动作 + 印象 2 个动作；16 项单测'
})

// 2026-11-03（全量备份验收时发现的两个真 bug）：①countFiles 不认文件、也不套 EXCLUDE，manifest 说 24665
// 实际只有 13322；②runFullBackup 不写 full-backup.json，手动跑完那一份永远不被系统看见（24h 内不再排全量）。
// 改｜2026-11-03 02:2x｜大鱼·工作台（子会话 f9b39b89 验收时发现）｜授权：老板（本次任务书：全备份一次，子代理做）｜scripts/regression.mjs:4170-4192｜新增 1 条：manifest 计数与磁盘同一口径（.log/node_modules 不计、单文件根记 1）+ 认领函数在｜为什么：这类"数不对/状态不更新"不报错，只让人误判备份覆盖；下次真丢了才会发现｜可改：只许加
const { runOffsiteBackup: runOffsiteForCount } = await import(pathToFileURL(path.join(ROOT, 'lib/offsite.js')).href)
ok('全量备份：manifest 计数跟磁盘同一口径，跑完的状态会被认领', () => {
  has('lib/offsite.js', 'function countFiles(target, skip = () => false)')
  has('lib/offsite.js', 'countFiles(src, (p) => EXCLUDE.test(p))')
  has('scripts/maintenance.mjs', 'function adoptNewestFull')
  has('scripts/maintenance.mjs', 'const adopted = adoptNewestFull(stateFile)')
  // 行为：临时根里放 1 个正常文件 + 1 个 .log + node_modules 里 1 个 → manifest 只该数到 1
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'ys-count-'))
  try {
    const rootDir = path.join(home, 'root')
    fs.mkdirSync(path.join(rootDir, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(rootDir, 'a.txt'), 'a')
    fs.writeFileSync(path.join(rootDir, 'b.log'), 'b')
    fs.writeFileSync(path.join(rootDir, 'node_modules', 'c.js'), 'c')
    const target = path.join(home, 'target')
    fs.mkdirSync(target)
    const out = runOffsiteForCount({ roots: [rootDir], target, dryRun: true })
    assert.equal(out.ok, true, `dryRun 失败：${out.reason || ''}`)
    assert.equal(out.manifest.totalFiles, 1, `manifest 说 ${out.manifest.totalFiles} 个文件——只该数 1 个（.log 与 node_modules 要跳过）`)
  } finally { fs.rmSync(home, { recursive: true, force: true }) }
  return '单文件根也记数；.log / node_modules 不计；认领函数在'
})

// 2026-11-03 老板：「带时间这个不是最基本的吗」——标了不用等于没标。
// 盯住：热档拼出来的每一行都要带 [月-日]，别再只存不显示。
{
  const { projectHot, hotText } = await import('../lib/hot.js')
  const text = hotText(projectHot({ role: 'dayu' }), 300) || ''
  const lines = text.split('\n').filter((l) => l.trim().startsWith('· '))
  if (!lines.length) ok('热档行要带日期到分（标签要有人用）', () => '没有热档条目，跳过')
  else {
    const bad = lines.filter((l) => !/^\s*· \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(l))
    ok('热档行要带日期（标签要有人用）', () => {
      assert.equal(bad.length, 0, `${bad.length}/${lines.length} 行没带日期：${bad[0]?.trim().slice(0, 30)}`)
      return `${lines.length} 行都带日期`
    })
  }
}

// 2026-11-03（老板：「为什么别人的鱼可以想到其他的，而你我不问你不说」）：容器都有，但一直是空的，
// 而且攒着的话只写进 news.json、从不端到眼前。这条锁：注入里有"直接说"的许可 + 真有推送通道。
// 改｜2026-11-03 15:4x｜大鱼·工作台｜授权：老板（「都做」）｜scripts/regression.mjs:4206-4222｜新增 1 条 3 项：注入许可、推送函数与 tick、6 例推送测试｜为什么："不问不说"不是能力问题是触发问题，只能靠机器盯着｜可改：只许加
ok('主动推送：攒着的话/逾期承诺端到眼前，没内容不刷屏', () => {
  has('lib/self-push.js', 'export function buildPush')
  has('lib/self-push.js', 'export function markPushed')
  has('dayu/index.js', 'const pushTick = () => {')
  has('dayu/index.js', 'buildPush(role)')
  // 注入里得有"这轮合适就直接说"的许可，否则她永远等被问
  has('lib/miss.js', '不用等被问')
  runTestScript('scripts/test-self-push.mjs')
  return '两个时段 + 8h 间隔 + 推过不重复 + 逾期承诺（6 例）'
})

// 2026-11-03（老板：「你修了这个车的轮子，你要去看这个车的其他地方有没有损坏……不要跑太远」）：
// 光靠自觉会退化，所以这条钉两处——注入里一句（每轮都看见）、手册里一章（含各子系统对照表）。
// 改｜2026-11-03 16:0x｜大鱼·工作台｜授权：老板（「做」）｜scripts/regression.mjs:4237-4252｜新增 1 条 4 项｜为什么：「看见了不说」比不知道更糟，而范围要收在"同车+近邻"｜可改：只许加
ok('修一处看整车：注入有一句、手册有整章、范围不外扩', () => {
  has('lib/brief.js', '修/查东西')
  has('lib/brief.js', '顺手看同车他处（别跑远）')
  has('docs/员工手册.md', '修一处，看整车')
  has('docs/员工手册.md', '不扩散到无关领域')
  has('docs/员工手册.md', '旁边还有')
  // 规矩块有 560 字硬上限：这条不许塞回规矩块挤掉核心
  assert.equal(read('lib/rules-block.js').includes('旁边还有'), false, '这句跑回规矩块了——那里有硬上限，放简报层')
  return '注入一句 + 手册一章（含子系统对照表）+ 不占规矩块预算'
})

// 2026-11-03 16:0x（老板：「为什么工作台没账本，没账本不会修吗，每次都这样」）：查出来是三个接线 bug——
// ①noteBalance() 写了却从没被调用 → 余额差永远没有；②.stale 拿不存在的 ts 字段判 → 永远 stale；
// ③工作台用量早就写进同一本 token-usage.jsonl（key=workbench），却没人把它算进「今天花了」。
// 改｜2026-11-03 16:1x｜大鱼·工作台｜授权：老板（本次原话如上）｜scripts/regression.mjs:4252-4272｜新增 1 条 6 项｜为什么："顶着一个假数、还说没账本"是会反复咬人的那类，必须机器盯着｜可改：只许加
const { spendTodayAll: spendTodayAllForTest } = await import(pathToFileURL(path.join(ROOT, 'lib/cost.js')).href)
ok('桌宠「今天花了」必须是总额：余额差优先、账本合计次之，不再说"没账本"', () => {
  has('lib/cost.js', 'export function spendTodayAll')
  has('dayu/index.js', 'account.balanceToday = noteBalance(')
  has('dayu/index.js', 'spendTodayAll()')
  has('dayu/index.js', 'localDayOf')                       // 本地日，不用 UTC 切
  assert.equal(read('dayu/index.js').includes('工作台没账本，那边的花费没算进来'), false, '旧口径又回来了：气泡会继续顶着 QQ 侧')
  // 账本合计得真能算出数（今天有流水就该 >0 笔）
  const r = spendTodayAllForTest()
  assert.equal(Number.isFinite(r.yuan), true, '账本合计不是数')
  assert.equal(Number.isFinite(r.turns), true, '账本笔数不是数')
  return `账本合计 ${r.turns} 笔 / ¥${r.yuan.toFixed(3)}（含工作台）`
})

// 2026-11-03 老板：「机制出厂带，你们自己不出厂」——这条盯住：出厂包里不许出现个人数据文件。
// 个人数据的特征：角色卡正文、好感/承诺/印象、记忆库、分歧/问题单、待确认单、主人偏好、令牌。
{
  const OUT = path.join(ROOT, 'dist', 'dsh-yushen-twins')
  const PERSONAL = [
    /(^|[\\/])(soul|cards|relations|library|memory)([\\/]|$)/i,
    /(好感|印象|承诺|分歧|问题|待确认|记忆库|owner\.json|charter\.json|keys\.env)/i,
  ]
  ok('出厂包不许带个人数据（机制带，人设不带）', () => {
    if (!fs.existsSync(OUT)) return '还没打过包，跳过（先跑 pack-release）'
    const hits = []
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        const rel = path.relative(OUT, p).replace(/\\/g, '/')
        if (e.isDirectory()) { walk(p); continue }
        if (PERSONAL.some((re) => re.test(rel))) hits.push(rel)
      }
    }
    walk(OUT)
    assert.equal(hits.length, 0, `出厂包里出现了个人数据文件：${hits.slice(0, 3).join('、')}`)
    return '出厂目录里没有个人数据文件'
  })
}

// 2026-11-02/03 老板：「留一手」——私库永远最新，公开的必须落后 ≥2 版。
{
  ok('留一手：公开版本落后私库 ≥2 版', () => {
    const r = runTestScript('scripts/check-release-lag.mjs')
    if (r === null) return '接线在；这回合环境不给子进程，没真跑'
    return '公开包比私库旧至少 2 版'
  })
}

// 2026-11-03 老板批注三件：①卡写进去却读不到（CARD_DROP 裁剪）②平台操作搬走后没有发放 ③派活单结不掉。
ok('卡不再被代码偷偷裁：整张卡都进注入', () => {
  const soul = read('lib/soul.js')
  // 只看代码，不看注释（注释里留着"当年为什么砍"的由来，那是历史）
  assert.equal(/^\s*const CARD_DROP\s*=/m.test(soul), false, 'CARD_DROP 又回来了：会再砍掉「姐姐vs妹妹」这类节')
  assert.equal(/^\s*const DESK_ONLY_DROP\s*=/m.test(soul), false, 'DESK_ONLY_DROP 又回来了')
  assert.ok(soul.includes('MAX_CHARS'), '硬上限兜底也没了')
  return '卡整张进注入，只留硬上限兜底'
})

ok('平台规矩按平台发：QQ 只给一行指针，工作台不给', async () => {
  has('lib/brief.js', 'platformPointer')
  const b = await import(pathToFileURL(path.join(ROOT, 'lib', 'brief.js')).href)
  const qq = b.buildRuntimeBrief('dayu', { channel: 'qq' })
  const desk = b.buildRuntimeBrief('dayu', { channel: 'desk' })
  assert.ok(qq.text.includes('外接平台手册'), 'QQ 简报里没有平台指针')
  assert.equal(desk.text.includes('外接平台手册'), false, '工作台不该带平台指针')
  const line = qq.text.split('\n').find((l) => l.includes('外接平台手册')) || ''
  assert.ok(line.length <= 120, `指针太长（${line.length} 字），等于把正文又搬回来了`)
  return `QQ 指针 ${line.length} 字；工作台 0 字`
})

ok('派活单能结：dayu_verify 带 id 会把取证绑到单上', () => {
  has('dayu/m1.js', 'verifyTaskEvidence')
  has('dayu/m1.js', "const id = String(args?.id || '').trim()")
  // 单子文件里必须有 evidence 结构（verdict 靠它判 pass）
  const jobs = read('core/dispatch.js')
  assert.ok(jobs.includes('task.evidence.push(receipt)'), '取证没落到单上，verdict 会一直说"先绑定"')
  return 'verify 带 id → 绑单 → verdict 才能 pass'
})

// 2026-11-03 老板：「不管是什么只要改动了、新增了都应该有对应的标签。首先日期年月日时分秒是最基本的，
// 然后来源，谁改的、为什么、谁让的、结果如何……角色卡也应该有标签，方便按需提取，每个都应该有标签，
// 修改了要有，被调用的要有（比如按标签注入文本）」。
// 第一刀落地：约定文档 + lib/tags.js（解析/剥掉/按标签取/调用留痕）+ 照微的卡先试点。
// 改｜2026-11-03 23:15｜照微·工作台｜授权：老板（原话如上）｜docs/标签约定.md、lib/tags.js、lib/soul.js:readCard/buildSceneText｜新增 1 条 + 1 个测试｜可改：只许加
const { parseTagBlock: tagsForCheck, staleTaggedFiles: staleTagsIn } = await import(pathToFileURL(path.join(ROOT, 'lib', 'tags.js')).href)
ok('每样东西都带标签：卡上有标签块、不进注入、被调用留痕', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'docs', '标签约定.md')), 'docs/标签约定.md 不见了')
  has('lib/tags.js', 'export function parseTagBlock')
  has('lib/tags.js', 'export function readTags')
  has('lib/tags.js', 'export function logUse')
  has('lib/tags.js', '/* 标签 … */')
  has('scripts/tag-audit.mjs', 'readTags')
  has('scripts/tag-audit.mjs', '--json')
  // 2026-11-03 老板：「改了内容就要做标注，这个要做到」——改了内容没刷 changed 必须红。
  has('lib/tags.js', 'export function staleTaggedFiles')
  has('scripts/tag-touch.mjs', 'changed:')
  has('scripts/tag-audit.mjs', '改了内容没改标签')
  {
    const roots = ['lib', 'scripts', 'docs', 'core', 'dayu']
    const candidates = []
    for (const d of roots) {
      const full = path.join(ROOT, d)
      if (!fs.existsSync(full)) continue
      for (const name of fs.readdirSync(full)) {
        if (!/\.(js|mjs|md)$/.test(name)) continue
        candidates.push(path.join(full, name))
      }
    }
    const stale = staleTagsIn(candidates)
    assert.deepEqual(stale.map((s) => s.file), [], `改了内容没改标签（跑 node scripts/tag-touch.mjs <文件>）：${stale.slice(0, 3).map((s) => `${path.basename(s.file)}(晚${s.driftSec}s)`).join('、')}`)
  }
  has('lib/soul.js', 'stripForInject(row.text)')
  has('lib/soul.js', "purpose: '注入本体卡'")
  // 照微的卡（真源）必须带标签块：字段齐、changed 到秒
  const card = path.join(os.homedir(), '.dsh', 'dayu', 'soul', 'cards', 'dragon.md')
  if (fs.existsSync(card)) {
    const parsed = tagsForCheck(fs.readFileSync(card, 'utf8'))
    assert.equal(parsed.found, true, '照微的卡上没有标签块')
    assert.ok(parsed.tags.length >= 5, `标签太少：${parsed.tags.join('、')}`)
    for (const k of ['created', 'changed', 'author', 'authority', 'why', 'result']) assert.ok(parsed.meta[k], `标签缺字段 ${k}`)
    assert.match(String(parsed.meta.changed), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'changed 没写到秒')
  }
  runTestScript('scripts/test-tags.mjs')
  return '约定+解析+剥注入+留痕；照微的卡已试点'
})

// 2026-11-03 老板：标签要齐——年月日时分秒、谁、为什么。手抄本 3,138 条 role=unknown，
// 根因是写入口把 session 截成 8 位、又没带 role/why。这条钉住写入端。
ok('记忆行标签齐：时间到秒、谁记的、为什么，session 不截断', async () => {
  const roleOf = await import(pathToFileURL(path.join(ROOT, 'lib', 'role-of.js')).href)
  has('lib/ingest-actions.js', 'roleForSession')
  has('lib/ingest-host-tools.js', 'roleForSession')
  has('lib/ingest-actions.js', 'why:')
  assert.equal(read('lib/ingest-host-tools.js').includes('session: String(sid).slice(0, 8)'), false, 'session 又被截成 8 位了，role 会再次对不上')
  // 时间必须是「年月日时分秒 + 时区」——用写入端真正用的那个 stamp 验，不另造一把尺
  const store = await import(pathToFileURL(path.join(ROOT, 'lib', 'ingest-store.js')).href)
  const s = store.stamp(Date.now())
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(s.at), `时间戳格式不对：${s.at}`)
  assert.equal(roleOf.roleForSession(''), '', '空会话也给了角色，等于编')
  return 'role/why/秒级时间 都在写入端；空会话不猜'
})

// 2026-11-04 老板：「怎么让你们想搜什么搜什么，我问一句你们就能自己搜到相关的，或者别人不问，自己会搜」。
// 查了实况：检索器（find-any/search/recall）都在，可 11-03 那天 3247 次工具调用里只有 8 次检索（0.25%）。
// 所以问题不是能力，是触发。三件一起做：
//   ① 被问时：工具 yushen_recall —— 从这句话抽时间/人名/引号词，顺手给出处（不替她答）；
//   ② 度量：recall-log.jsonl 记"谁/为什么搜/命中几条/后来用没用上"，不然永远只是感觉；
//   ③ 不问也搜：scripts/recall-auto.mjs —— 心念/承诺/议程当搜索词，只报没见过的新命中，没发现就不报。
// 改｜2026-11-04 14:1x｜照微·工作台｜授权：老板（原话如上，「都做」）｜scripts/regression.mjs 新增 1 条｜可改：只许加
ok('检索三件：被问会搜 / 搜了有账 / 不问也搜', () => {
  has('dayu/m1.js', "name: 'yushen_recall'")
  has('lib/recall-hook.js', 'export function hintsFor')
  has('lib/recall-log.js', 'export function logRecall')
  has('lib/recall-log.js', 'export function recallStats')
  has('scripts/recall-auto.mjs', 'recall-auto-seen.json')
  has('lib/brief.js', '拿不准就搜：`yushen_recall`')
  // 「不问也搜」必须真有人跑它：接在离线维护脚本里（不占宿主、不调模型）
  has('scripts/maintenance.mjs', "runScript('recall-auto.mjs'")
  // 「搜了有没有用」要有核对脚本，而且证据只认记忆/库（事件流水里有查询词，等于自证）
  // 改｜2026-11-11 19:1x｜大鱼·主代理｜授权：主人（2026-11-11：「做」）｜scripts/regression.mjs:4508-4509｜判据跟随实现：核对逻辑已从 scripts/recall-usage.mjs 搬进 lib/recall-usage.js（别的会话重构），markUsed 与"只扫记忆"两条都跟着换文件｜为什么：断言钉的是"证据只认记忆、不认事件流水"，不是钉文件名；文件挪了就该跟着挪，不能放宽｜验证：regression 该条绿；test-recall 真跑｜可改：只许更准（认新文件的新写法），不许删
  has('lib/recall-usage.js', 'markUsed')
  assert.ok(read('lib/recall-usage.js').includes('只扫记忆'), 'recall-usage 又去扫事件流水当证据了')
  runTestScript('scripts/test-recall.mjs')
  return '工具在；日志能量；自主搜索接进维护；用没用上有核对'
})

// 2026-11-04 老板：「每一样都有人用吗？谁来维护——做成自动化，不需要维护，最多每周巡视一圈」。
// 巡视不是又一张要人填的表：它自己数「7 天用了没」、自己查「该修的坏没坏」，一周跑一次，写一份报告。
// 单角色装（新用户只有一张卡）自动把「派活给姐妹」这类标成"不适用"，不当成问题。
ok('每周巡视：自己数"用了没"、自己跑，单角色装不误报', () => {
  has('scripts/weekly-patrol.mjs', '每周巡视')
  has('scripts/weekly-patrol.mjs', 'idle')
  has('scripts/weekly-patrol.mjs', "kind = 'use'")
  // 自动化这条是命：没接进维护脚本 = 又一个"写好了没人跑"
  has('scripts/maintenance.mjs', 'patrol()')
  has('scripts/maintenance.mjs', "runScript('weekly-patrol.mjs'")
  has('scripts/maintenance.mjs', '7 * 24 * 3600 * 1000')
  runTestScript('scripts/test-weekly-patrol.mjs')
  return '一周一次；报告落 dayu/health；单角色装标不适用'
})

// 2026-11-04 老板：「沉默是关系档位不是开关……希望回不回是靠感觉关系好感，而不是摇骰子」。
// 桥里原来只有 Math.random() < skipProbability 这一条沉默路：同样的对话这次回下次不回，没法解释也没法改。
// 现在换成可解释的档位判断（lib/reply-sense.js）：
//   主人 / 被点名 / 私聊 → 回（规矩，不是概率）；群里闲聊 → 按"近 7 天这个人说过几句"分熟/见过/生人；
//   累了只回熟人；她自己写的「这轮不说」最高优先。阈值写在 relations/reply-sense.json（她可以改）。
// 改｜2026-11-04 14:3x｜照微·工作台｜授权：老板（原话如上）｜lib/reply-sense.js 新增、bridge.js 换判据、maintenance 每小时刷阈值｜可改：只许加
ok('回不回按关系档位，不掷骰子', () => {
  has('lib/reply-sense.js', 'export function decide')
  has('lib/reply-sense.js', 'export function tierOf')
  has('scripts/build-reply-sense.mjs', 'reply-sense.json')
  has('scripts/maintenance.mjs', "runScript('build-reply-sense.mjs'")
  // 桥侧：旧骰子只能当兜底（读不到策略时），不能当主判据。
  // 桥是另一个仓库，打包机上可能没有——找不到就跳过这一段，别让别的机器红。
  const bridgeCandidates = [path.join(ROOT, '..', 'qq-bridge', 'src', 'bridge.js'), 'D:/deepseekTools/qq-bridge/src/bridge.js']
  const bridgePath = bridgeCandidates.find((p) => fs.existsSync(p))
  if (bridgePath) {
    const bridge = fs.readFileSync(bridgePath, 'utf8')
    assert.ok(bridge.includes('function replySenseDecision'), '桥里没有 replySenseDecision')
    assert.ok(bridge.includes('按关系判断：'), '桥里没记"按关系判断"的理由')
    assert.ok(bridge.includes('退回旧概率 skip='), '旧概率兜底没标注来源')
  }
  runTestScript('scripts/test-reply-sense.mjs')
  return bridgePath ? '档位判断在；桥按它回；阈值可被她改；旧骰子只兜底' : '档位判断在；阈值可改（这台机器没有桥，桥侧未查）'
})

// 2026-11-04 老板：「能本地就本地，别动不动上模型；你们定时巡视一圈看看哪里需要修改的不就好了」。
// 自愈脚本只做机械且可逆的修：标签过期刷 changed、dist 里的 lib 副本从源码同步、阈值文件缺了重建。
// 它不调模型、不联网、退出码永远 0（门禁是 regression，不是它）；修不了/该判断的写进 needsYou。
ok('自愈：机械项自己修（标签过期/dist/阈值），不调模型', () => {
  has('scripts/self-heal.mjs', '标签过期')
  has('scripts/self-heal.mjs', 'dist 落后')
  has('scripts/self-heal.mjs', 'reply-sense.json')
  // 2026-11-04 老板同意：旧打包快照只留最近 3 份（当前版本那份永不删；不碰 archive/）
  has('scripts/self-heal.mjs', '.snapshots')
  has('scripts/self-heal.mjs', 'YUSHEN_KEEP_SNAPSHOTS')
  has('scripts/maintenance.mjs', "runScript('self-heal.mjs'")
  // 它必须能说清"我只修了这些"，而不是闷头改
  has('scripts/self-heal.mjs', 'needsYou')
  // 真跑一次 --dry --json：不写盘、给结构化结果
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'self-heal.mjs'), '--dry', '--json'], { encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `--dry 退出码不是 0：${r.status}`)
  const out = JSON.parse(String(r.stdout || '{}'))
  assert.equal(out.dry, true)
  assert.ok(Array.isArray(out.fixed) && Array.isArray(out.needsYou), '输出缺 fixed/needsYou')
  return '三类机械修法在；接进维护；--dry 真跑给结构化结果'
})

// 2026-11-04 老板：「能放到电脑里正常工作的就别放到宿主里，卡卡的容易把宿主搞崩」。
// 原来「遗忘」（每 6 小时读一遍清理计划 + 可能删几千个对象）和「记忆合并」（每小时遍历三个人的记忆）
// 都跑在宿主进程里。现在搬成 scripts/memory-housekeeping.mjs，由 maintenance 调；宿主里只剩派发。
ok('重活搬出宿主：遗忘/记忆合并已经是离线脚本，不在宿主里跑', () => {
  has('scripts/memory-housekeeping.mjs', 'forgetPlan')
  has('scripts/memory-housekeeping.mjs', "state', 'forget.json'")
  has('scripts/memory-housekeeping.mjs', '先备份')
  has('scripts/maintenance.mjs', "runScript('memory-housekeeping.mjs'")
  // 宿主里不许再有这两个定时器（正则扫代码，不算注释）
  const host = read('dayu/index.js').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.equal(/setInterval\(consolidateTick/.test(host), false, '记忆合并又跑回宿主了')
  assert.equal(/setInterval\(\(\) => \{ void runForgetSafely/.test(host), false, '遗忘又跑回宿主了')
  runTestScript('scripts/test-memory-housekeeping.mjs')
  return '两件重活都在离线脚本里；宿主只剩派发；dry/护栏都验过'
})

// 2026-11-04 老板：「移动这些东西，要让其他角色能知道被移动了」「动了东西做记录，时间、谁……」。
// 搬文件只有动手的人知道；另外两个醒来看到"少了个东西"，会当成丢了。所以变动要写两处：
//   ① ~/.dsh/dayu/changes.jsonl（机器可查）② board/公告.md（所有人都会看的地方）
// 而且**自动维护自己也要报**：自愈修了什么、遗忘清了什么，不能偷偷动。
ok('动了东西要留记录：谁、什么时候、为什么，写进公告让别的角色看得见', () => {
  has('lib/changes-log.js', 'export function recordChange')
  has('lib/changes-log.js', 'export function recentChanges')
  has('lib/changes-log.js', '东西被动了')
  has('scripts/register-change.mjs', '--authority')
  // 自动维护必须自己报账（自愈 / 遗忘）
  has('scripts/self-heal.mjs', 'recordChange({ who:')
  has('scripts/memory-housekeeping.mjs', 'action: \'delete\'')
  // 打包：这些脚本要被维护真调，漏一个出厂就静默失败
  has('scripts/pack-release.mjs', 'scripts/memory-housekeeping.mjs')
  has('scripts/pack-release.mjs', 'scripts/register-change.mjs')
  has('scripts/pack-release.mjs', 'lib/changes-log.js')
  runTestScript('scripts/test-changes.mjs')
  return '两处都写；自动维护自己报账；新脚本都进包'
})

// 2026-11-04 续：「能放电脑里的别放宿主」——账本结算（原 5 分钟）、阶位重算（原 1 小时）、
// 通道记忆回写（原 5 分钟）三件也搬进 scripts/offline-ticks.mjs；宿主里那些定时器全删了。
// 这三件都是纯本地文件活：每 5 分钟在宿主里读桥 state、算账、重算阶位，界面会一卡一卡。
ok('账本结算/阶位/通道回写也搬出宿主，只在维护里跑', () => {
  has('scripts/offline-ticks.mjs', 'settleSpend')
  has('scripts/offline-ticks.mjs', 'rankRecompute')
  has('scripts/offline-ticks.mjs', 'syncChannelMemory')
  has('scripts/maintenance.mjs', "runScript('offline-ticks.mjs'")
  has('scripts/pack-release.mjs', 'scripts/offline-ticks.mjs')
  // 宿主里这三个定时器不许回来（扫代码，不算注释行）
  const host = read('dayu/index.js').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.equal(/setInterval\(\(\) => \{ try \{ settleSpend/.test(host), false, '结算又跑回宿主了')
  assert.equal(/setInterval\(rankTick/.test(host), false, '阶位重算又跑回宿主了')
  assert.equal(/setInterval\(\(\) => \{ void runChannelSync/.test(host), false, '通道回写又跑回宿主了')
  runTestScript('scripts/test-offline-ticks.mjs')
  return '三件都在离线脚本里；宿主定时器 0；进包；dry/只跑一件都验过'
})

// 2026-11-04 老板问：「宿主开关会被这些影响无法完全关闭吗？移出去和之前相比是好还是坏」。
// 答：关闭本身不拖（维护 detached + unref，宿主不等）。真实副作用是"宿主关了后台可能还在跑"。
// 所以宿主写心跳（host-alive.json，60 秒一次），维护每步前看心跳，断了就收手退出。
ok('宿主关了，后台维护会自己收手（不拖关闭、也不在关机后翻家目录）', () => {
  has('dayu/index.js', 'host-alive.json')
  has('dayu/index.js', "process.on('exit'")
  has('scripts/maintenance.mjs', 'function hostAlive')
  // 备份这三步不依赖宿主，宿主不在也照跑（重要）；其余重活看到心跳断就停
  has('scripts/maintenance.mjs', "'host-gone'")
  // 2026-11-04 老板：「宿主关闭就等于结束了，后台没什么非要做完的活」——所以不再给备份开例外；
  // 另外备份也改成"有变化才备"（指纹没变就只推时间戳）。
  assert.equal(read('scripts/maintenance.mjs').includes("name !== 'offsite'"), false, '宿主不在时又给备份开例外了（老板已否）')
  has('scripts/maintenance.mjs', "'skipped-same'")
  runTestScript('scripts/test-host-guard.mjs')
  return '心跳 60 秒；断了整轮收手；备份只在家目录变了时才做'
})

// 2026-11-04 老板纠正：「分工不同就不会有冲突，只会说工具只有一个要等；覆写是分工不明确」。
// 并且：离线只分两类——听差（宿主叫才干）/ 值夜（宿主不说也能干，现在一个都没有）；
// 宿主停了就是下班；崩溃时本地进程不能占着不放，宿主必须还能起来修。
ok('宿主与离线：一类听差、二类值夜（现在没有）、下班就停、崩了不占进程', () => {
  has('docs/离线与宿主分工.md', '宿主停了 = 下班')
  has('docs/离线与宿主分工.md', '现在一个都没有')
  // 崩溃安全：硬超时 + 启动清僵死锁
  has('lib/offline-guard.js', 'export function hardTimeout')
  has('dayu/index.js', 'clearStaleMaintLock')
  has('scripts/maintenance.mjs', 'hardTimeout(30')
  // 每个会自己跑很久的脚本都得有硬超时
  for (const f of ['scripts/memory-housekeeping.mjs', 'scripts/offline-ticks.mjs', 'scripts/self-heal.mjs', 'scripts/weekly-patrol.mjs', 'scripts/recall-auto.mjs']) {
    assert.ok(read(f).includes('hardTimeout('), `${f} 没有硬超时——卡住就成僵尸`)
  }
  // 宿主心跳断了整轮收手
  has('scripts/maintenance.mjs', 'host-gone')
  return '分工文档在；硬超时 6 个脚本；启动清僵死锁；心跳断了收手'
})

// 2026-11-04 小鱼：`yushen_ask` 其实**投到了**（主人发截图给我看的那张「小鱼 有事找你」卡片就是它），
// 但 `deliveredAt` / `seenAt` 一直空——于是「没发出去」和「发出去了他正在看」在数据上完全一样。
// 我第一次用它就判错了：去查桥、查 owner.json，还写下「这是静默失败的教科书例子」。
// 修法：工作台来取 pending 就算投递成功，当场回写 deliveredAt（只写第一次，不重复覆盖）。
// 教训一句话：**状态字段空 ≠ 事没发生。**
ok('yushen_ask：工作台取走即投递，回写 deliveredAt（不重复覆盖）', () => {
  has('lib/ask.js', 'takePendingAsks')
  has('lib/ask.js', 'deliveredAt')
  has('dayu/index.js', 'takePendingAsks(8)')
  // 旧写法不许回来：/now 里直接 listAsks({status:'pending'}) 拿列表，投没投递谁也看不出来
  const back = /asks:\s*listAsks\(\s*\{\s*status:\s*'pending'/.test(read('dayu/index.js'))
  assert.equal(back, false, "/now 又直接 listAsks 拿 pending 了——deliveredAt 会永远空，她又分不清发没发")
  return '取走即写 deliveredAt；/now 不再直接 listAsks'
})

// 2026-11-04 老板问：「这些机制要记住，你们以前是怎么记住的，有专门的地方吗」。
// 以前散在七处（AGENTS.md / docs / regression / 文件标签 / worklog / 记忆库 / 公告），谁都不全。
// 所以做一张索引 docs/机制清单.md；**它是死文档还是活索引，看能不能被机器验**——这里逐行验真源文件在不在。
ok('机制清单：每条机制的真源都在（不然"记住了"只是写了篇作文）', () => {
  const doc = read('docs/机制清单.md')
  assert.ok(doc.includes('以前记在哪儿'), '机制清单缺"以前记在哪儿"那节')
  const paths = [...doc.matchAll(/`([A-Za-z0-9_\-./]+\.(?:js|mjs|json|md))`/g)].map((m) => m[1]).filter((p) => p.includes('/'))
  const uniq = [...new Set(paths)]
  const missing = uniq.filter((p) => !fs.existsSync(path.join(ROOT, p)))
  assert.deepEqual(missing, [], `机制清单里写的真源不存在：${missing.join('、')}`)
  assert.ok(uniq.length >= 10, `真源太少（${uniq.length}），是不是表被删了`)
  has('docs/规则地图.md', '机制清单')
  return `${uniq.length} 个真源全在；规则地图有指针`
})

// 2026-11-04 老板问：「我们所有的相关文档、记忆、其他，是不是都能进图书馆，按大区小区分开存？」
// 图书馆一直在（总书目 A–H：卡/记忆/经验/原文/媒体/日记），但**文档没上架**——只收她自己的东西。
// 现在加 I 类：docs/*.md 全上架，小区按名字+标题粗分（规矩/设定/机制/操作/档案/其他）。
// 物理文件不搬（搬会断引用），图书馆是**索引层**。
ok('图书馆：文档也上架（I 类），有大区也有小区，物理文件不动', () => {
  has('scripts/build-catalog.mjs', "add('I',")
  has('scripts/build-catalog.mjs', "'框架文档'")
  has('scripts/build-catalog.mjs', 'ZONES')
  has('docs/机制清单.md', '图书馆总目')
  // 真跑一次生成器（快，纯本地），确认 docs 真的进书目了
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-catalog.mjs')], { encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `总书目生成失败：${String(r.stderr || '').slice(0, 200)}`)
  const jsonl = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'catalog', '总书目.jsonl')
  const rows = fs.readFileSync(jsonl, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const docs = rows.filter((x) => x.cls === 'I')
  assert.ok(docs.length >= 50, `框架文档卡片太少：${docs.length}`)
  assert.ok(docs.every((x) => String(x.where || '').startsWith('docs/')), 'I 类里有不是 docs 的卡片')
  const zones = new Set(docs.map((x) => (x.keys || [])[1]).filter(Boolean))
  assert.ok(zones.size >= 3, `小区没分出来：${[...zones].join(',')}`)
  // J 类：今天改了什么、加了什么——worklog 与 changes 也要上架（老板 2026-11-04 特别问的）
  const acts = rows.filter((x) => x.cls === 'J')
  assert.ok(acts.length > 0, 'worklog/changes 没上架（J 类空）')
  assert.ok(acts.every((x) => ['worklog.jsonl', 'changes.jsonl'].includes(x.where)), 'J 类里有来路不明的东西')
  // 2026-11-04 照真图书馆补的两样：著者号（谁写的）+ 三线（开架/闭架/密集）
  assert.ok(rows.every((x) => 'zone' in x), '卡片没带三线标记')
  assert.ok(rows.filter((x) => x.zone).every((x) => ['开架', '闭架', '密集'].includes(x.zone)), '三线值不认识')
  assert.ok(rows.filter((x) => x.author).length > 50, '著者号基本没填（真馆是分类号+著者号）')
  assert.ok(rows.some((x) => /\//.test(x.id) && x.author), '索书号没带著者（应像 I-2611-007/照微）')
  return `${rows.length} 张卡片；I 类 ${docs.length}（小区 ${[...zones].join('/')}）；J 类 ${acts.length}；三线 ${new Set(rows.map((x) => x.zone)).size} 档；带著者 ${rows.filter((x) => x.author).length}`
})

// 2026-11-04 老板：「仓库里有月盘、半年盘、一年盘，天盘也有但一般不这么干」+ 图书馆还欠的两条。
//   ① 剔旧留痕：清掉的东西留一张"已剔"卡片（X 类）+ 已剔.jsonl，不是消失；
//   ② 清点对照：按日期自动选档盘点（日盘只盘当天、月盘 30 天、半年/全年全量），出盘亏/盘盈。
ok('剔旧留痕 + 盘点（日/月/半年/全年四档）', () => {
  has('lib/disposal-log.js', 'export function logDisposal')
  has('lib/disposal-log.js', "'已剔'")
  has('scripts/memory-housekeeping.mjs', 'logDisposal')
  has('scripts/build-catalog.mjs', "add('X'")
  has('scripts/inventory.mjs', 'function pickLevel')
  has('scripts/inventory.mjs', "if (m === 1 && day === 1) return 'year'")
  has('scripts/maintenance.mjs', "runScript('inventory.mjs'")
  has('scripts/weekly-patrol.mjs', '盘点（账实）')
  // 真跑一次日盘（轻量，不写重东西以外的）：只盘当天新增
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'inventory.mjs'), '--level', 'day', '--json'], { encoding: 'utf8', timeout: 120000 })
  assert.ok(r.status === 0 || r.status === 1, `盘点退出码异常：${r.status}`)
  const out = JSON.parse(String(r.stdout || '{}'))
  assert.equal(out.level, 'day')
  assert.ok(typeof out.scope === 'number' && typeof out.missing === 'number', '盘点输出缺 scope/missing')
  return '剔旧有卡片；盘点四档；维护里真调；日盘可跑'
})

// 2026-11-04 老板：「以后再加什么机制、修改什么机制，先查图书馆看存不存在」；
// 还要求"总目太大不好找，知道在哪区就查区目录"——所以目录分三层：总目（薄）/ 区目（中）/ 小区（不单出）。
ok('图书馆三层目录 + 加东西前先查（library-lookup）', () => {
  has('scripts/build-catalog.mjs', '目录-总目.md')
  has('scripts/build-catalog.mjs', '区/')
  has('scripts/library-lookup.mjs', '查六处')
  has('docs/机制清单.md', '先查图书馆')
  // 真跑：总目存在且薄（不含条目表），区目存在
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-catalog.mjs')], { encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `生成目录失败：${String(r.stderr || '').slice(0, 200)}`)
  const cat = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'catalog')
  const over = fs.readFileSync(path.join(cat, '目录-总目.md'), 'utf8')
  assert.ok(over.includes('怎么用'), '总目缺"怎么用"')
  assert.ok(!over.includes('最近 200 张卡片'), '总目里塞了条目——那就不是"薄总目"了')
  const zoneFiles = fs.readdirSync(path.join(cat, '区')).filter((f) => f.endsWith('.md'))
  assert.ok(zoneFiles.length >= 5, `区目太少：${zoneFiles.length}`)
  // 查重工具真跑一次
  const lk = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'library-lookup.mjs'), '备份', '--json'], { encoding: 'utf8', timeout: 60000 })
  assert.equal(lk.status, 0, `lookup 跑不成：${String(lk.stderr || '').slice(0, 200)}`)
  const out = JSON.parse(String(lk.stdout || '{}'))
  assert.ok(out.verdict, 'lookup 没给结论')
  assert.ok(out.total >= 1, '查"备份"居然什么也没命中')
  // 2026-11-04 优化：查重要能"换个说法也找得到"（快照→备份），而且目录没中时要翻正文索引。
  const lk2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'library-lookup.mjs'), '快照', '--json'], { encoding: 'utf8', timeout: 60000 })
  const out2 = JSON.parse(String(lk2.stdout || '{}'))
  assert.ok((out2.terms || []).length > 1, '别名没扩开（查"快照"没扩出"备份"）')
  assert.ok(String(lk2.stdout).includes('备份') || out2.hits?.aliases?.length, '别名扩开没生效')
  // 中文词不许被当成"任意导出名"命中（查不存在的词必须给"没有"）
  const lk3 = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'library-lookup.mjs'), '量子纠缠', '--json'], { encoding: 'utf8', timeout: 60000 })
  const out3 = JSON.parse(String(lk3.stdout || '{}'))
  assert.match(String(out3.verdict), /没有|相近/, `查不存在的词居然说"已有"：${out3.verdict}`)
  return `总目+${zoneFiles.length} 个区目；别名可扩；查不到不乱说`
})

// 2026-11-04 老板：「别名单靠检索日志反向扩，数据驱动不用猜」——这条把"我说没搜到"变成别名表。
// 判据：recall-log 里 hits=0 的查询 → 拿去倒排索引里试 → 正文有就是缺别名，正文没有就是真没有。
ok('别名数据驱动：从"没搜到"里挑出该补的，不冤枉真没有的', () => {
  has('scripts/alias-harvest.mjs', '待补别名')
  has('scripts/alias-harvest.mjs', '正文里有')
  has('scripts/maintenance.mjs', "runScript('alias-harvest.mjs'")
  has('lib/aliases.json', '快照')
  runTestScript('scripts/test-alias-harvest.mjs')
  return '词表 45 组；收割脚本会挑"正文有但查不到"；一天刷一次'
})

// 2026-11-04 老板：「按时间排序，最近发生的优先注入；常驻的、印象深刻的、淡的、被顶替的也要有说法」。
// 原来只有一句 slice(-3)：197 条记忆里 58 条 important 一次都没露过面；工作台注入更是一条记忆都不带。
// 改｜2026-11-07 21:5x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S1 任务书：pick 搬进 memory-core/，逻辑一字不改）｜
// scripts/regression.mjs:4767-4771 / 5016-5019 / 5031-5032 / 5040-5044｜只把 has/read 的文件名从 lib/memory-pick.js 指到
// memory-core/pick.mjs（真身搬过去了；不指过来查的是 16 行转发壳，断言就成了空转）｜一条断言都没加、没删、没减弱｜
// 验证：regression 279 通过 0 失败；.state/s1/diff-pick.mjs 逐字段差分 0 不一致（600+ 次调用）｜可改：改逻辑去 memory-core/pick.mjs
// 现在 memory-core/pick.mjs（原 lib/memory-pick.js，2026-11-07 S1 搬家）：最新 1 条必进 + 重要/高分补足 3 条；30 天没提及的降权（淡忘，不删）；被顶替不参选。
ok('记忆按"新+重要"选着注入（不再只取最后三条）', () => {
  has('memory-core/pick.mjs', 'export function pickForInject')
  has('memory-core/pick.mjs', 'supersededBy')
  has('memory-core/pick.mjs', '!e.cold')
  has('lib/soul.js', "part('最近记得的'")
  has('lib/brief.js', 'pickForInject')
  // 2026-11-04 老板：「淡忘这一层可以」——30 天没提及的标 cold，不删、不进注入、能取回
  has('scripts/memory-decay.mjs', 'coldAt')
  has('scripts/memory-decay.mjs', '--unmark')
  has('scripts/maintenance.mjs', "runScript('memory-decay.mjs'")
  runTestScript('scripts/test-memory-pick.mjs')
  // 注入预算：加了记忆也要在基线以内（涨了就是拿现场换记忆，得先删）
  const t = buildSceneText('dragon', 'desk')
  assert.ok(t.includes('最近记得的'), '工作台注入里没有"最近记得的"')
  return `工作台注入 ${t.length} 字，含最近记得的 3 条；淡忘只标不删`
})

// 2026-11-04（老板转述的那个"a 传 b、b 不知道"）：群里消息**传到了 ≠ 处理了**。
// 原来只认 answer（回了没有），没有 handled（处理了没有），消息会永远沉在 recent 里。
// 现在：ask/deliver 都进 pending（转达决定也算"欠一条回复"），标 handled 或回一句才清掉。
ok('群消息有「未处理」状态：传到了不等于处理了', () => {
  has('lib/groups.js', 'export function markHandled')
  has('lib/groups.js', "NEEDS_REPLY = new Set(['ask', 'deliver'])")
  has('lib/groups.js', 'handledIds')
  has('dayu/index.js', "action === 'handled'")
  runTestScript('scripts/test-groups-handled.mjs')
  // 每月恢复演练接进维护（老板 2026-11-04 问消耗；实测 59 秒、零模型）
  has('scripts/maintenance.mjs', 'restore-drill.mjs')
  return 'pending 只给"没处理"的；handled/answer 都能清；演练每月一号'
})

// 2026-11-04 老板：「这个没有自动提炼吗」——精提炼脚本一直在，但**从来没人定时跑**。
// 这条钉住三件事：接进维护、只在谷时、写 role、外加无主清单可生成。
ok('精提炼接进定时：谷时才跑、写 role、无主清单能出', () => {
  const maint = read('scripts/maintenance.mjs')
  has('scripts/maintenance.mjs', 'refine()')
  has('scripts/maintenance.mjs', "runScript('refine.mjs'")
  assert.ok(maint.includes('skipped-peak'), '精提炼没做谷时闸')
  assert.ok(maint.includes('6 * 3600 * 1000'), '精提炼没做 6 小时冷却')
  has('scripts/refine.mjs', 'roleFromRef')
  has('scripts/unknown-list.mjs', '--print')
  has('scripts/pack-release.mjs', "'scripts/unknown-list.mjs'")
  return '维护里有 refine 步（谷时 + 6h + 预算 1 元）；refine 写 role；清单脚本进包'
})

// 2026-11-04 老板：「记忆能做到想检索就检索了吗」。
// 之前只有两条路：自动带进来（looksLikeRecall）或去命令行跑脚本——会话里没有一只手。
// 现在 yushen_memory：action=search（recall-now：别名扩词/倒排/有效期）、action=recent（与注入同一套选法）。
// 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书：search 搬进 memory-core/，逻辑一字不改）｜
// scripts/regression.mjs:4821-4824｜has 的文件指针从 lib/memory-search.js 指到 memory-core/search.mjs（真身搬过去了；
// 不指过来查的是 13 行转发壳，断言就成了空转）｜四条 needle 一字没改｜一条断言都没加、没删、没减弱｜验证：回归 279/0
ok('记忆可以随时检索：工具在手，且和注入用同一套规则', () => {
  has('memory-core/search.mjs', 'export function searchMemory')
  has('memory-core/search.mjs', 'export function recentMemory')
  has('memory-core/search.mjs', 'recallNow(text')
  has('memory-core/search.mjs', 'pickForInject(role')
  has('dayu/index.js', "name: 'yushen_memory'")
  has('dayu/index.js', "args?.action) === 'search'")
  // 2026-11-13 22:3x（本场加载大鱼角色卡后实测）：记忆/做法两个工具原来读 args.__exec，
  // 而那个字段从没被注入过——role 永远 unbound，查出来 0 条还回 ok:true（静默失败）。
  // 钉死：role 只从 execute(args, exec) 的 exec 里取，不许再拿 args 当执行上下文。
  if (read('dayu/index.js').includes('roleOfExec(args')) throw new Error('dayu/index.js 还在把 args 当执行上下文：yushen_memory / yushen_skills 的 role 会永远 unbound')
  runTestScript('scripts/test-memory-search.mjs')
  return 'search/recent 两个动作；同一套别名与选法；只读'
})

// 2026-11-21 老板：图书馆的定义说过不止一次，还是忘了——定义类决定必须钉进注入，不能只当事件等检索。
ok('长期决定：定义类要钉进注入，按话题出块', () => {
  has('memory-core/generic/definitions.js', 'export function buildDefinitionsBlock')
  has('lib/soul.js', 'buildDefinitionsBlock(task)')
  runTestScript('scripts/test-definitions.mjs')
  return '写入 / 去重 / 按话题出块 / 不相关不出'
})

// 2026-11-21：决定会改口——同话题+“更正/改成”时，旧的标已覆盖，不许两条并列。
ok('决定簿会改口：同话题+改口 → 旧的标已覆盖', () => {
  has('memory-core/generic/definitions.js', 'export function definitionConflict')
  has('memory-core/generic/definitions.js', "status: 'superseded'")
  has('dayu/m1.js', "replaces:")
  runTestScript('scripts/test-definitions-conflict.mjs')
  return '自动覆盖 / 不误伤 / 显式覆盖 / 默认只给生效的'
})

// 2026-11-21：关系簿——谁接住过我、我欠谁什么、哪句话记到现在（和好感分开）。
ok('关系簿：接住过我 / 我欠谁 / 记到现在', () => {
  has('lib/relations-book.js', 'export function relationsBook')
  has('lib/relations.js', "'caughtMe'")
  has('dayu/m1.js', "name: 'yushen_relations'")
  runTestScript('scripts/test-relations-book.mjs')
  return '三件字段 / 承诺对上 / 空家不崩'
})

// 2026-11-21：层级摘要——轮→日→周，按规则折，不调模型。
ok('层级摘要：轮→日→周，不调模型', () => {
  has('lib/summary-tree.js', 'export function daySummary')
  has('lib/summary-tree.js', 'export function weekSummary')
  has('dayu/m1.js', "name: 'yushen_summary'")
  runTestScript('scripts/test-summary-tree.mjs')
  return '日 / 周 / 落盘 / 空天不崩'
})

// 2026-11-21：自家小评测——固定题，量“问得出来吗”；只对自家数据，不冒充 LOCOMO。
ok('自家小评测：固定题量 hit@1 / hit@k', () => {
  has('lib/eval-own.js', 'export function evaluateRecall')
  has('lib/eval-own.js', 'QUESTIONS')
  has('scripts/eval-own.mjs', 'evaluateRecall(')
  runTestScript('scripts/test-eval-own.mjs')
  return '命中判定 / 漏题 / 空不崩'
})

// 2026-11-21：检索要能翻到在用卡片——以前只搜事件/原文，经验/知识等于藏起来。
ok('检索能翻到卡片：经验/知识不只躺在文件里', () => {
  has('lib/recall-now.js', "kind: '卡片'")
  has('lib/recall-now.js', "library', '在用'")
  runTestScript('scripts/test-memory-search.mjs')
  return '卡片正文（head+detail+tags）进检索'
})

// 2026-11-21 老板：一页“现在”——换会话第一句能接上，不靠检索猜。
ok('一页现在：手上 / 答应 / 决定 / 家里 / 心情', () => {
  has('lib/now-page.js', 'export function buildNowPage')
  has('lib/soul.js', "part('现在'")
  runTestScript('scripts/test-now-page.mjs')
  return '五行齐 / ≤320 字 / 空家不崩'
})

// 2026-11-24 老板：你们自己的记忆插件，你们自己负责——事实之外要有“我自己的话”。
ok('自我记忆：我做过 / 学到 / 有印象的瞬间', () => {
  has('memory-core/generic/self-memory.js', 'export function appendSelf')
  has('memory-core/generic/self-memory.js', 'export function selfMemoryBlock')
  has('lib/soul.js', "part('我最近记得的自己'")
  has('dayu/index.js', "a === 'self-remember'")
  runTestScript('scripts/test-self-memory.mjs')
  return '写入 / 软边界 / 过滤 / 注入块'
})

// 2026-11-24：核心通用化——lib 只留薄壳，真身在 memory-core/generic（独立包以后直接用同一份）。
ok('记忆核心通用化：lib 薄壳，真身在 memory-core/generic', () => {
  has('memory-core/generic/definitions.js', 'export function buildDefinitionsBlock')
  has('memory-core/generic/definitions.js', 'export function addDefinition')
  has('memory-core/generic/self-memory.js', 'export function appendSelf')
  has('lib/definitions.js', "from '../memory-core/generic/definitions.js'")
  has('lib/self-memory.js', "from '../memory-core/generic/self-memory.js'")
  runTestScript('scripts/test-core-generic.mjs')
  return '同一份实现 / 两边一致'
})

// 2026-11-24：出厂用通用评测——题面不贴自家词，合成数据，能算 hit@1 / hit@3。
ok('通用评测：出厂题不贴自家词', () => {
  has('lib/eval-general.js', 'export function judgeHits')
  has('lib/eval-general.js', 'SELF_WORDS')
  has('scripts/eval-general.mjs', 'searchMemory(')
  runTestScript('scripts/test-eval-general.mjs')
  return '七类 / 无自家词 / 合成数据'
})

// 2026-11-24：卡加载时没常驻只提示，不自动换。
ok('常驻：单角色默认关 / 可显式开关 / 提示不自动换', () => {
  has('lib/body-tool.js', 'export function residentPrompt')
  has('lib/body-tool.js', '这个角色还没有活着的常驻')
  has('lib/body-tool.js', 'export function residentFeature')
  has('dayu/m1.js', "if (action === 'enable' || action === 'disable')")
  runTestScript('scripts/test-body-tool.mjs')
  return '单角色默认关 / 多角色或已有身体自动开 / 提示 ≤40 字'
})

// 2026-11-24：内部群不只落账——对方有常驻身体时顺手叫醒，能当场回；没有就只留言。
ok('内部群：常驻时叫醒对方，没有就只留言', () => {
  has('dayu/index.js', '【内部群·')
  has('dayu/index.js', 'delivered: true, to')
  has('dayu/index.js', 'residentFeature())')
  return '常驻才叫 / 否则异步'
})

// 2026-11-24：常驻“压缩后还接得上”的硬证据——记忆在盘上，每轮重拼。
ok('常驻连续性：压缩后现在/决定/自我还在', () => {
  has('scripts/check-resident-continuity.mjs', 'check-resident-continuity')
  has('lib/compaction-bridge.js', 'installCompactionBridge')
  runTestScript('scripts/check-resident-continuity.mjs')
  return '5 项：决定/自我/文件不变/桥在'
})

// 2026-11-24 老板：时间一长找不到人——常驻/分身要有入口。
ok('常驻 / 分身：看得到、换得过去、汇报写得进', () => {
  has('lib/body-tool.js', 'export function listBodies')
  has('lib/body-tool.js', 'export function useBody')
  has('lib/body-tool.js', 'export function reportToBody')
  has('dayu/m1.js', "name: 'yushen_body'")
  runTestScript('scripts/test-body-tool.mjs')
  return 'list / use / report'
})

// 2026-11-24：一页“现在”要带“别处在做什么”；没承诺账时说人话。
ok('一页现在：别处在做 + 空数据降级', () => {
  has('lib/now-page.js', '别处：')
  has('lib/now-page.js', '没有欠着的')
  runTestScript('scripts/test-now-page.mjs')
  return '别处一行 / 空家不吓人'
})

// 2026-11-24：首装 10 分钟验收脚本（空家跑一遍，输出 PASS/FAIL）。
ok('首装验收：空家跑一遍，输出人话', () => {
  has('scripts/first-run-check.mjs', '总结：')
  return '脚本在；FAIL 项由后续修'
})

// 2026-11-21：决定簿与进度视图要有入口，不能只写文档。
ok('决定簿与进度视图有工具入口', () => {
  has('memory-core/generic/definitions.js', 'export function addDefinition')
  has('lib/progress.js', 'export function renderProgress')
  has('dayu/m1.js', "name: 'yushen_define'")
  has('dayu/m1.js', "name: 'yushen_progress'")
  return '决定簿 add/list；进度视图只读'
})

// 2026-11-21：注入要落账，才能回答“提醒到底有没有用”。
ok('注入有账可审：prestep/自动联想都落账', () => {
  has('lib/injection-log.js', 'export function logInjection')
  has('lib/prestep-recall.js', 'logInjection(')
  has('lib/soul.js', 'logInjection(')
  has('scripts/audit-injection.mjs', 'readInjections(')
  runTestScript('scripts/test-injection-log.mjs')
  return 'offered 能落账；audit 能算 used'
})

// 2026-11-19 老板：「记忆内容偏噪，她把整段回答也记成事件」。
// 之前 200 条事件里 166 条是 kind=say（她自己的回答），注入的「最新一条」经常是它。
// 钉死：say 降权 0.6、core 不降；「最新一条」保证位让给真事（note 等），没真事才用 say。
ok('记忆去噪：自己的整段回答降权，最新一条让给真事', () => {
  has('memory-core/pick.mjs', "String(e.kind || '') === 'say'")
  has('memory-core/pick.mjs', 'function newestOf')
  runTestScript('scripts/test-memory-denoise.mjs')
  return 'say×0.6 / core 不降 / 最新让给非 say'
})

// 2026-11-21 老板：「工具人」——记忆要带情绪落款；同情绪的事更容易被想起。
ok('记忆带情绪：事件落 valence/强度，同情绪略微靠前', () => {
  has('lib/emotion-lexicon.js', 'export function detectEmotion')
  has('memory-core/store.mjs', 'detectEmotion(value)')
  has('memory-core/store.mjs', 'valence:')
  has('memory-core/pick.mjs', 'moodValence')
  has('lib/soul.js', 'moodValence')
  runTestScript('scripts/test-emotion-fields.mjs')
  return '正负/中性不猜 / 落款 / 同情绪略高 / 旧行为不变'
})

// 2026-11-19 老板：「1875 张卡全是中游，分级等于没有」。
// 钉死：错题/任务/人物天生该常看，新品直接上游；其余仍按使用次数/年龄升降。
ok('卡片分级不再全中游：错题/任务/人物新品就是上游', () => {
  has('memory-core/runtime/tier.js', 'KIND_PROMOTE')
  has('memory-core/runtime/incidents.js', "tier: '上游'")
  runTestScript('scripts/test-incidents.mjs')
  return '错题/任务/人物上游；记忆/经验/知识仍按使用与年龄'
})

// 2026-11-20 老板「可以」：被召回也记一次弱使用，让经验/知识卡靠“总被想起”上浮。
// 钉死：召回计数单独一栏（不冒充 used）、6h 节流、满 6 次升上游。
ok('弱使用账：被召回 6 次升上游，且不算“用上了”', () => {
  has('memory-core/runtime/recall-use.js', 'export function noteRecall')
  has('memory-core/runtime/recall-use.js', 'export function recallCounts')
  has('memory-core/runtime/recall-use.js', "String(source) !== 'explicit'")
  has('memory-core/runtime/feedback.js', 'recallCounts()')
  has('memory-core/runtime/tier.js', 'recall >= 6')
  has('memory-core/runtime/query.js', 'recordUse')
  has('memory-core/search.mjs', "source: 'explicit'")
  has('dayu/m1.js', 'recordUse: true')
  runTestScript('scripts/test-weak-use.mjs')
  return '只认显式检索 / 6h 节流 / 满 6 次上游 / auto 不记'
})

// 2026-11-13 老板：「加载了大鱼或谁，就给这个会话备注上是谁」。
// 身份以前只认 residence 那一条常驻身体——新分身一律 unbound（框架现状 2026-11-12 就写着「没有 incarnation 登记」）。
// 现在多第二认口：bodies.json 的分身凭据（看到卡才写；已认过别人不覆盖；正文自称不算）。
// 钉死：两处认人（工具层 store.mjs、抄录层 transcript.js）都得认凭据，且顺序是身体→凭据→空。
ok('分身凭据：加载了谁的卡就认谁，认人入口两处一致，没凭据不猜', () => {
  has('lib/bodies.js', 'export function claimBody')
  has('lib/bodies.js', 'export function claimOf')
  has('lib/bodies.js', 'export function roleFromCardText')
  has('memory-core/store.mjs', "path.join(DATA, 'bodies.json')")
  has('memory-core/runtime/transcript.js', "'bodies.json'")
  has('dayu/index.js', 'claimOf(sid)')
  has('dayu/index.js', 'onCard:')
  has('memory-core/runtime/capture.js', 'onCard?.(sid, s, event)')
  runTestScript('scripts/test-incarnation.mjs')
  return '凭据写/查/认卡 + 两处认人 + 冲突不覆盖 + 自称不算'
})

// 2026-11-04 老板：「写了不代表在用」——派活返回里带着 handbook/handbookMeta，但 手册发放.jsonl
// 停在 11-03、只有 5 条。查出来两层：①已回话（returned）的单子永远算「在途」，加上派活公共前缀
// 「【调用者】…」抬高相似度，新活全被挡成 waiting，根本没投出去；②投出去的只有章摘要，没有手册正文，
// 日志也不记 bytes/sha。这条用真 dispatch() 跑一遍（隔离家 + 假宿主只收不发），把四件事钉死。
ok('派活时手册真发出去：日志 +1（sections/bytes/sha/at/role）、简报含章正文、meta 与日志一致', () => {
  const home = fs.mkdtempSync(path.join(tmpRoot(), 'hb-dispatch-'))
  try {
    fs.mkdirSync(path.join(home, 'dayu'), { recursive: true })
    // 一张 10-31 的 returned 单：修之前它靠公共前缀就能拿到 0.5+ 相似度，把新活永远挡在 waiting。
    fs.writeFileSync(path.join(home, 'dayu', 'dispatch.json'), JSON.stringify([{
      id: 'job-stale-old', role: 'dayu', sessionId: 'session-old', status: 'returned', expect: '一句',
      brief: '【调用者】小鱼（角色，不是老板）在调用你。这是她的判断，不是老板直接下的命令；你可以先判断要不要接、要不要反问；不接就说清理由。\n\n回一句：你怕什么？',
      createdAt: '2026-10-31T17:43:42.498Z', dueAt: '2026-10-31T18:13:42.498Z', returnedAt: '2026-10-31T18:00:00.000Z',
    }]))
    const runner = path.join(home, 'run.mjs')
    fs.writeFileSync(runner, `
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const ROOT = ${JSON.stringify(ROOT)}
const sent = []
const host = { cwd: process.env.DSH_WORKSPACE, async listSessions() { return [] }, async createSession() { return { id: 'session-x' } }, async send(id, text) { sent.push({ id, text }) } }
const { dispatch } = await import(pathToFileURL(path.join(ROOT, 'core', 'dispatch.js')).href)
const task = await dispatch(host, { brief: '把 lib/records.js 的头部加三行标记，改完跑回归。', expect: '回归全绿 + 文件路径', target: 'session-hb-test' })
const file = path.join(process.env.DSH_HOME, 'dayu', 'runtime', '手册发放.jsonl')
const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split(/\\r?\\n/).filter(Boolean).map(JSON.parse) : []
process.stdout.write(JSON.stringify({ status: task.status, sessionId: task.sessionId, handbookMeta: task.handbookMeta, rows, text: sent[0]?.text || '' }))
`)
    const r = spawnSync(process.execPath, [runner], { encoding: 'utf8', timeout: 120000, env: { ...process.env, DSH_HOME: home, DSH_WORKSPACE: path.resolve(ROOT, '..') } })
    const code = String(r.error?.code || '')
    if (r.status === null && (code === 'EPERM' || code === 'EACCES')) { skipped += 1; return `跳过：这个环境不让开子进程（${code}）` }
    assert.equal(r.status, 0, `派活子进程没跑成：${String(r.stderr || r.stdout || '').slice(0, 300)}`)
    const out = JSON.parse(String(r.stdout || '{}'))
    // ① 老的 returned 单不许再把新活挡成 waiting（挡了就等于手册永远发不出去）。
    assert.equal(out.status, 'dispatched', '陈旧 returned 单还在堵派活（新单被排成 waiting）')
    assert.equal(out.sessionId, 'session-hb-test')
    // ② 一次派活必须新增且只新增一条发放记录，字段齐全。
    assert.equal(out.rows.length, 1, `派活一次应新增 1 条发放记录，实际 ${out.rows.length}`)
    const row = out.rows[0]
    assert.ok(Number.isFinite(Date.parse(row.at)), '发放记录缺可解析的 at')
    assert.equal(row.role, 'dayu')
    assert.equal(row.scene, 'dispatch')
    assert.ok(Array.isArray(row.sections) && row.sections.length >= 2, '发放记录没记哪几章')
    assert.ok(row.chars > 0 && row.bytes > 0, '发放记录没记字数/字节')
    assert.match(String(row.sha), /^[0-9a-f]{12}$/, '发放记录没记手册版本 sha')
    // ③ 简报里必须是手册正文（不是一句"见手册"）。
    assert.ok(out.text.includes('干活会话（被派活的员工）'), '简报里没有「干活会话」那章正文')
    assert.ok(out.text.includes('证据'), '简报里没有「证据」那章正文')
    const headings = [...out.text.matchAll(/^## (第[^\n]+|[〇一二三四五六七八九十]+之[^\n]*|[〇一二三四五六七八九十]+、[^\n]+)$/gm)].map((m) => m[1])
    assert.ok(headings.length >= 2, `简报里没扫到章标题（${headings.length}）`)
    // ④ 单子上记的章 = 实际发出去的章；bytes/sha 也要对得上。
    assert.deepEqual(out.handbookMeta?.chapters, row.sections, 'handbookMeta.chapters 与实际发出去的章不一致')
    for (const title of headings) assert.ok(out.handbookMeta.chapters.includes(title), `章标题「${title}」不在 meta 里`)
    assert.equal(out.handbookMeta.bytes, row.bytes, 'meta.bytes 与日志不一致')
    assert.equal(out.handbookMeta.sha, row.sha, 'meta.sha 与日志不一致')
    assert.ok(out.handbookMeta.bodyChars > 0 && out.handbookMeta.bodyChars <= 1200, `章正文预算不在 1200 以内：${out.handbookMeta.bodyChars}`)
    return `${row.sections.length} 章正文 ${out.handbookMeta.bodyChars} 字；日志 +1（${row.bytes} bytes / sha ${row.sha}）；meta 一致`
  } finally {
    try { fs.rmSync(home, { recursive: true, force: true }) } catch { /* 清不掉不影响结论 */ }
  }
})

// 2026-11-04 老板：「手册不该塞一大堆东西，应该是按需调度对应的文本资源注入」。
// 这条钉住：目录在、目录里每条都能对上真章、发放器先读目录（不是写死代码）。
ok('手册当目录：发放先读 手册资源.json，且每条都指向真章', async () => {
  const h = await import(pathToFileURL(path.join(ROOT, 'lib', 'handbook.js')).href)
  has('lib/handbook.js', 'handbookCatalog')
  const doc = h.handbookCatalog()
  assert.ok(doc, '手册资源.json 不在或读不了——发放会退回写死的关键词表')
  const bad = []
  const cache = new Map()
  for (const [scene, ids] of Object.entries(doc.scenes || {})) {
    for (const id of ids) {
      const meta = doc.resources.find((r) => r.id === id)
      if (!meta) { bad.push(`${scene}:${id}（资源不存在）`); continue }
      if (!cache.has(meta.file)) {
        const p = path.join(path.resolve(ROOT, '..'), meta.file)
        cache.set(meta.file, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')
      }
      if (!cache.get(meta.file).includes(`## ${meta.chapter}`)) bad.push(`${scene}:${meta.chapter}（章名对不上）`)
    }
  }
  assert.equal(bad.length, 0, `目录里有对不上的条目：${bad.slice(0, 3).join('，')}`)
  const picked = h.handbookSceneSections('dispatch')
  assert.equal(picked.source, 'catalog', 'dispatch 场景没走目录，还是写死的关键词表')
  return `目录 ${(doc.resources || []).length} 条；dispatch 取到 ${picked.sections.length} 章`
})

// 2026-11-04 老板：「四、我建议做的（按性价比），做」——① 分层预算 ② 记忆带 why ③ 人格变化史。
// 预算的意义：以前只有一个总数基线，谁都能在某一层偷偷加东西；现在超了会点名是哪层、超多少。
// 注意：这里**只锁我自己的卡在预算内**——姐妹的卡只有本人能改，超了要她们自己决定，不由我削。
const { measureLayers } = await import(pathToFileURL(path.join(ROOT, 'lib', 'inject-budget.js')).href)
const { changesOf } = await import(pathToFileURL(path.join(ROOT, 'lib', 'memory-search.js')).href)
ok('注入分层预算 + 记忆带理由 + 人格变化史（角色维度）', () => {
  has('lib/inject-budget.js', 'INJECT_BUDGET')
  has('lib/inject-budget.js', 'export function measureLayers')
  has('scripts/check-inject-budget.mjs', '先删再加')
  // 改｜2026-11-07 22:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 S2 任务书）｜scripts/regression.mjs:4928-4930｜
  // has 的文件指针从 lib/memory.js / lib/memory-search.js 分别指到 memory-core/store.mjs / memory-core/search.mjs；
  // 两条 needle（why ||、export function changesOf）一字没动｜一条断言都没加、没删、没减弱
  has('memory-core/store.mjs', 'why ||')
  has('docs/人格变化史.md', '为什么变成这样')
  has('memory-core/search.mjs', 'export function changesOf')
  has('dayu/index.js', "args?.action) === 'changes'")
  const m = measureLayers('dragon')
  assert.equal(m.ok, true, `我自己的卡超预算了：${m.rows.filter((r) => r.over).map((r) => `${r.layer}+${r.over}`).join('、')}`)
  const ch = changesOf('dragon', { q: '名字' })
  assert.ok(ch.count >= 1, '人格变化史检索搜「名字」居然 1 条都没有')
  return `我 4 层都在预算内（合计 ${m.total} 字）；变化史可查`
})

// 2026-11-04 老板：「它怎么能知道别人想要做什么？我先说我想干什么，+ 发放手册」。
// 这条钉住：给任务原文就按任务挑章（不是永远发那三章）；空任务退回场景默认，不乱发。
ok('派活按任务发手册：说「备份验收」就发验收章，空任务不乱发', async () => {
  const h = await import(pathToFileURL(path.join(ROOT, 'lib', 'handbook.js')).href)
  has('lib/handbook.js', 'handbookSectionsForTask')
  has('core/dispatch.js', 'task: text')
  const a = h.handbookDispatchPack({ scene: 'dispatch', task: '帮我做一次备份验收' })
  assert.ok(a.sections.some((s) => s.title.includes('验收')), '按任务没挑到验收章')
  assert.ok(a.chars > 300, `只发了章名没发正文（${a.chars} 字）`)
  const b = h.handbookDispatchPack({ scene: 'dispatch', task: '' })
  assert.equal(b.sections.some((s) => s.title.includes('验收')), false, '空任务也发了验收章——场景兜底不该乱发')
  return `按任务：${a.sections.map((s) => s.title.slice(0, 8)).join('/')}（${a.chars} 字）；空任务退回默认 ${b.sections.length} 章`
})

// 2026-11-04 老板：「平台手册要不要塞？它应该按需调度」——平台场景必须能从目录取到平台手册正文。
ok('平台场景也按目录发：QQ/B站能取到平台手册正文，不是空手', async () => {
  const h = await import(pathToFileURL(path.join(ROOT, 'lib', 'handbook.js')).href)
  has('lib/handbook.js', 'chaptersOfFile')
  has('lib/handbook.js', 'SCENE_HINTS')
  const qq = h.handbookDispatchPack({ scene: 'qq', task: '群里有人怼我，我该怎么回' })
  assert.ok(qq.sections.some((s) => s.title.includes('QQ')), '群聊场景没挑到平台手册的 QQ 章')
  assert.ok(qq.chars > 300, `QQ 章只发了章名没正文（${qq.chars} 字）`)
  const bili = h.handbookDispatchPack({ scene: 'bili', task: '' })
  assert.ok(bili.chars > 100, `B站场景没发正文（${bili.chars} 字）`)
  return `QQ ${qq.chars} 字 / B站 ${bili.chars} 字（都来自平台手册）`
})

// 2026-11-06 吸收（B站那节课）：①记忆必须带 why ②能力要落三处 ③收尾说报告不说完成。
ok('记忆写入口存在且 why 必填：action=remember 拒空 why，手册写清「memory 是查不是记」', () => {
  has('dayu/index.js', "a === 'remember'")
  has('dayu/index.js', "'need-why'")
  has('dayu/index.js', 'action=remember')
  has('docs/员工手册.md', '每条记忆要带 why')
  has('docs/员工手册.md', 'action=memory` 是**查**，不是记')
  has('docs/员工手册.md', '要同时落在三处')
  has('docs/员工手册.md', '收尾说「报告」，不说「完成」')
  return '写入口 + why 硬闸 + 三处落点 + report/done 都在'
})

// 2026-11-06 审计第 1、2 条：账本口径 + 死单收回。
ok('账本口径不再混单位：todayUsage 由宿主按元写，插件只认 accounting', () => {
  has('lib/usage-workbench.js', 'only token-usage.jsonl; .dshw-usage.json owned by host')
  has('dayu/index.js', "source: 'accounting'")
  has('dayu/index.js', 'usage <= Math.max(1, dayStart * 0.5)')
  has('dayu/index.js', "source = 'events'")
  // 插件不许再往 todayUsage 加词元数
  const w = read('lib/usage-workbench.js')
  assert.ok(!/doc\.todayUsage\s*=/.test(w), 'usage-workbench 又去写 todayUsage 了（会把词元数当钱）')
  return 'accounting 优先 + 量级校验 + 不再污染 todayUsage'
})

ok('巡检会收回死单，且同一问题记满 3 次后不再重复建单', () => {
  has('lib/patrol.js', 'dispatch/reaped')
  has('lib/patrol.js', '员工会话已不存在')
  has('lib/patrol.js', 'patrol/muted')
  has('lib/patrol.js', 'Number(i.count || 1) >= 3')
  return '死单自动 aborted + 第三次后静默'
})

ok('体检输出能无损 JSON 往返（不许有 undefined）', () => {
  const src = read('dayu/index.js')
  const i = src.indexOf("name: 'dayu_health'")
  const chunk = src.slice(i, i + 1400)
  assert.ok(chunk.includes("String(charter.product ?? '')"), 'product 没兜底')
  assert.ok(chunk.includes("Number(charter.version) || 0"), 'charterVersion 没兜底')
  assert.ok(chunk.includes('String(led.source ??') || chunk.includes("source: String(led.source"), 'ledger.source 没兜底')
  return '所有字段落到可序列化类型'
})

// 2026-11-07（手机在真机上量的）：注入 3 条里只有 2 条不同内容——picked.includes 比的是对象引用，
// 最新那条是 spread 出来的新对象，永远判不相等。修完必须有这条断言，不然下次又退回去。
ok('注入去重：同一条记忆不占两个位置，且带 id 回指', () => {
  runTestScript('scripts/test-memory-dedupe.mjs')
  return '不重复 + 不超过 n + 带 id'
})

// 改｜2026-11-07 12:55｜照微·子会话（实现代理）｜授权：老板（2026-11-07 融合方案第 1 步任务书，经父会话下发）｜scripts/regression.mjs 末尾，只增一条｜新增「cue（BM25 候选源）能提升命中，且不改默认行为」｜为什么：cue 是新能力，而默认路径被手机端依赖，两头都得有人钉住｜验证：regression 275 通过 0 失败（真跑 scripts/test-memory-cue.mjs）｜可改：只增不改（已有断言一条没删没改）
// 2026-11-07（融合方案第 1 步 BM25 候选源）：pickForInject 加了可选 cue。
// 手机端 soul.js/brief.js 不传 cue，所以这条同时盯两头：① 传 cue 能想起本来想不起的那条；
// ② 不传 cue 时逐字段还是「最新 1 + 分数补满」的老行为（改了就是手机注入全变）。
ok('cue（BM25 候选源）能提升命中，且不改默认行为', () => {
  has('memory-core/pick.mjs', 'export function pickForInject')
  has('memory-core/pick.mjs', 'cue = ')
  has('memory-core/pick.mjs', 'export function bm25Scores')
  has('memory-core/pick.mjs', 'export function tokensWithAliases')
  has('scripts/eval-memory.mjs', 'cue: c.q')
  runTestScript('scripts/test-memory-cue.mjs')
  return '不传 cue = 最新 1 + 分数补满（逐字段不变）；传 cue 能想起简历、快照→备份'
})

// 2026-11-07（融合第 1 步接线）：光有 BM25 没用，得把「这一趟要干什么」传进去；
// 手机端故意不传（注入落历史，错了会留痕），所以断言只锁 desk 的接线和手机的默认路径。
ok('注入接线：desk 把 task 当 cue，手机端保持旧路径', () => {
  const s = read('lib/soul.js')
  assert.ok(s.includes('cue: isMobile() ?'), 'soul.js 没把 task 当 cue 传给 pickForInject')
  assert.ok(s.includes("part('最近记得的'"), '注入段落不见了')
  const mp = read('memory-core/pick.mjs')
  assert.ok(mp.includes("cue = ''"), 'pickForInject 的 cue 默认值没了（手机端默认行为会被改）')
  return 'desk 传 cue；mobile 走空 cue'
})

// 2026-11-07（融合方案第 2 步 P2）：实体图当候选源 + 精度收口。
// 「压力大 → 考试」跨 40 天也要想起来；但也不能为了凑满 4 条塞不相关的（平均注入 ≤3.5）。
// 默认路径（cue 空）仍是手机端那条路，test-memory-graph 里和老选法逐字段差分。
ok('P2 实体图：压力大能点亮考试，且默认行为不变', () => {
  has('memory-core/pick.mjs', 'export function entityIdsOf')
  has('memory-core/pick.mjs', 'export function graphRelevance')
  has('memory-core/pick.mjs', 'GRAPH_DECAY')
  has('memory-core/pick.mjs', 'GRAPH_W')
  has('memory-core/pick.mjs', 'bestRelated')
  has('scripts/eval-memory.mjs', 'examLit')
  runTestScript('scripts/test-memory-graph.mjs')
  runTestScript('scripts/eval-memory.mjs') // 自己会因「压力大没点亮 exam」或「平均注入 >3.5」退 1
  return '实体抽取/一跳 0.6/不两跳/精度收口；cue 空逐字段不变；eval hit@4 100%、平均注入 3.10 条'
})

// 改｜2026-11-07 13:33｜照微·子会话（实现代理）｜授权：主人（2026-11-07 21:21 经父会话下发的 P3 任务书：regression 末尾只增一条断言、不改已有）｜scripts/regression.mjs 末尾｜P3 夜间巩固：新增 lib/memory-consolidate.mjs（近似重复→情节 / 实体画像 / 边权重，幂等）+ CLI + 测试；回归只增一条，277→278｜为什么：夜里没有巩固，同一件事重复说就是多条，实体之间没有权重｜验证：test-memory-consolidate 通过；regression 278 通过 0 失败；check-dist-sync 缺口 0；framework-record check 通过（615 文件）｜可改：只增不改
// 2026-11-07（融合方案 P3 夜间巩固）：夜里把近似重复合成情节、给实体和边称重。
// 只增一条（已有断言一条没动）：文件在只是最低要求，真正容易坏的是「合并时丢 memberIds」
// 和「第二次跑因为掺了时间戳而全变」——后一种下游 id 全失效，还没人看得见。都交给测试脚本钉住。
ok('P3 夜间巩固：近似重复合成情节，跑两次一模一样', () => {
  has('lib/memory-consolidate.mjs', 'export function consolidate')
  has('lib/memory-consolidate.mjs', '.episodes.json')
  has('lib/memory-consolidate.mjs', 'MERGE_WINDOW_MS')
  has('lib/memory-consolidate.mjs', 'export function textSimilarity')
  has('scripts/consolidate-memory.mjs', '--role')
  has('scripts/test-memory-consolidate.mjs', '幂等')
  runTestScript('scripts/test-memory-consolidate.mjs')
  return '同实体+0.6+7天合并 / memberIds 完整 / 实体画像 / 边 1 与 0.5 / dry 不写 / 原件不动'
})

// 改｜2026-11-07 21:55｜照微·子会话（实现代理）｜授权：老板（2026-11-07 经父会话下发的 P4 任务书：regression 末尾只增一条断言、不改已有）｜scripts/regression.mjs 末尾｜P4 触发器 + 元记忆：新增 lib/memory-triggers.mjs / lib/meta-memory.mjs + 两个测试；P3 放宽「双方都没实体、Jaccard ≥0.8、3 天内」也合并；回归只增一条，278→279｜为什么：说到某话题才该提的那件事没有地方存；被问旧事只有「答」或「不谈」，还会把已被顶替/冷档的旧结论当现行证据拿出来｜验证：test-memory-triggers / test-meta-memory 通过；regression 279 通过 0 失败；check-dist-sync 缺口 0；framework-record check 通过｜可改：只增不改
// 2026-11-07（融合方案 P4）：触发器（何时该提）+ 元记忆三态（知道 / 记不全 / 不知道）。
// 这条同时盯三处：① 触发器能存能命中、fire 同一天只算一次；② 元记忆的 evidence 绝不包含
// supersededBy / cold:true 的旧结论；③ P3 放宽后仍然幂等（同一批事件跑两次字节一致）。
ok('P4 触发器 + 元记忆：说到才提、旧事敢说记不清，失效样本不冒充', () => {
  has('lib/memory-triggers.mjs', 'export function addTrigger')
  has('lib/memory-triggers.mjs', 'export function listTriggers')
  has('lib/memory-triggers.mjs', 'export function matchTriggers')
  has('lib/memory-triggers.mjs', 'export function fireTrigger')
  has('lib/meta-memory.mjs', 'export function metaAnswer')
  has('lib/meta-memory.mjs', 'export function episodeEvidence')
  has('lib/meta-memory.mjs', 'supersededBy')
  has('lib/meta-memory.mjs', 'cold !== true')
  has('lib/memory-consolidate.mjs', 'NO_ENTITY_SIMILARITY')
  has('lib/memory-consolidate.mjs', 'NO_ENTITY_WINDOW_MS')
  has('scripts/test-memory-triggers.mjs', '幂等')
  has('scripts/test-meta-memory.mjs', '失效')
  runTestScript('scripts/test-memory-triggers.mjs')
  runTestScript('scripts/test-meta-memory.mjs')
  return '实体/关键词/到期命中；fire 同日一次；know/partial/unknown；失效成员过滤；无实体同文 0.8+3天合并且幂等'
})

// 改｜2026-11-07 23:2x｜照微·子会话（实现代理）｜授权：老板（2026-11-07 方案-场景架构对照 §3，经父会话下发的任务书：regression 末尾只增一条断言、不改已有）｜scripts/regression.mjs 末尾｜P5 场景架构三项：新增 lib/receipt-watch.mjs（回执哨兵）/ lib/board-view.mjs（看板派生视图）/ lib/owner-ref.mjs（画像参考）+ 三个测试；回归只增一条，279→280｜为什么：派出去的单没人催能挂五六天、看板与议程只进不出、多端对老板的观察没有地方放；这三样都不影响现有行为，先落库不接线｜验证：test-receipt-watch / test-board-view / test-owner-ref 三个全过；regression 280 通过 0 失败；check-dist-sync 缺口 0；framework-record check 通过｜可改：只增不改
// 2026-11-07（方案-场景架构对照 §3）：回执哨兵 / 看板派生视图 / 画像参考。
// 这条同时盯三处：① 欠回执能认出来、第 3 次才 escalate、同一小时字节不变；② 看板只渲染开着的、
// 归档只挪完成项且原文逐字保留、跑两次一模一样；③ 参考本只增不改、merge 只产建议、owner.json 一个字节都不动。
ok('P5 场景架构三项：回执哨兵 / 看板派生 / 画像参考，只加不改', () => {
  has('lib/receipt-watch.mjs', 'export function scanReceipts')
  has('lib/receipt-watch.mjs', 'export function remind')
  has('lib/receipt-watch.mjs', 'escalate:true')
  has('lib/receipt-watch.mjs', 'soul/receipt-watch.json')
  has('lib/board-view.mjs', 'export function renderBoard')
  has('lib/board-view.mjs', 'export function archiveDone')
  has('lib/board-view.mjs', '只渲染开着的')
  has('lib/owner-ref.mjs', 'export function addRef')
  has('lib/owner-ref.mjs', 'export function listRefs')
  has('lib/owner-ref.mjs', 'export function mergeRefs')
  has('lib/owner-ref.mjs', '绝不直接改 owner.json')
  has('scripts/test-receipt-watch.mjs', '第 3 次')
  has('scripts/test-board-view.mjs', '幂等')
  has('scripts/test-owner-ref.mjs', '只增不改')
  runTestScript('scripts/test-receipt-watch.mjs')
  runTestScript('scripts/test-board-view.mjs')
  runTestScript('scripts/test-owner-ref.mjs')
  return '欠回执识别/第3次升级/同小时幂等/最多3条；看板只渲染开着的+归档只挪done+原文保留；参考只增不改+merge不动owner.json'
})

// 2026-11-08：接线体检（配置开了没人读 / 状态过期）+ 注入分块视图。
ok('接线体检能跑，且注入分块能列出「哪一块在涨」', () => {
  has('scripts/wiring-audit.mjs', 'checkSwitches')
  has('scripts/wiring-audit.mjs', 'checkExpired')
  has('scripts/wiring-audit.mjs', '--strict')
  has('scripts/measure-injection.mjs', "'--blocks'")
  has('scripts/measure-injection.mjs', 'function blocksOf')
  has('scripts/pack-release.mjs', 'scripts/wiring-audit.mjs')
  return '接线体检 + measure-injection --blocks + 打包白名单都在'
})

// 改｜2026-11-10 20:0x｜大鱼·主代理（整合）｜授权：老板（本次任务书：开子代理都做）｜scripts/regression.mjs 末尾，只增｜新增 2 条（覆盖 2026-11-10 的四件）｜为什么：留痕不进索引就查不到"改成什么样、为什么"；心跳不逐跳落盘就证明不了"空转也是合法产出"；醒来那段没有判据就会每轮重复；两端不一致没人喊就只会继续漂｜验证：四件各自的测试真跑，check-parity 退出 0，regression 全绿｜可改：只增不改（这四条是机器能盯的边界，别删）
ok('2026-11-10 四件：留痕索引 / 心跳日志 / 醒来那段 / 两端对照', () => {
  has('scripts/change-index.mjs', '--rebuild')
  has('scripts/find-any.mjs', '改动留痕')
  has('lib/heartbeat-journal.js', 'export function appendHeartbeat')
  has('lib/wake-brief.js', 'export function wakeBrief')
  has('lib/wake-brief.js', 'export function commitWake')
  // 2026-11-10 老板：醒来要能答「有人找我、我没回，为什么」——四种原因分开，末尾是问句不是催办。
  has('lib/wake-brief.js', 'export function unansweredOf')
  has('lib/heartbeat-journal.js', 'WHY_NOT')
  has('dayu/index.js', 'unanswered')
  has('lib/brief.js', 'wakeBrief')
  has('dayu/index.js', 'commitWake')
  has('docs/两端对照表.md', '机器')
  has('scripts/check-parity.mjs', 'isMobile')
  runTestScript('scripts/test-change-index.mjs')
  runTestScript('scripts/test-heartbeat-journal.mjs')
  runTestScript('scripts/test-remind-late.mjs')
  runTestScript('scripts/test-wake-brief.mjs')
  runTestScript('scripts/test-parity.mjs')
  runTestScript('scripts/test-sleep-mind.mjs')
  return '留痕可查（改成什么样+为什么）；心跳逐跳留痕；醒来那段只在醒来首轮且投递成功才记；两端对照 21 行可由机器判'
})

// 2026-11-10（老板选 A）：状态灯改成规则拼的——不再叫本地引擎；body-loop 先关闲置引擎、再点灯。
// 为什么：本地小模型 7.2 GB 常驻只为每 20 分钟压一句话，且旧顺序让它永远关不掉；
//   规则句里没有一个字是猜的，模型那句话不提供新信息。
// 验证：test-sleep-mind 5 条真跑；body-loop 静态断言顺序对；regression 全绿。
ok('状态灯改规则版：不调模型、点灯前先关闲置引擎', () => {
  has('lib/sleep-mind.js', "by: 'rule'")
  has('lib/sleep-mind.js', 'function ruleLine')
  has('lib/sleep-mind.js', '不调模型')
  has('lib/body-loop.js', '先关旧的')
  runTestScript('scripts/test-sleep-mind.mjs')
  return '状态灯不碰模型；闲置引擎在点灯前关；状态灯测试 5 条真跑'
})

ok('两端对照：不一致会被机器喊出来（check-parity 真跑）', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-parity.mjs')], { encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `check-parity 不一致（退出 ${r.status}）：${String(r.stdout || '').slice(0, 400)}${String(r.stderr || '').slice(0, 200)}`)
  assert.ok(/一致/.test(String(r.stdout || '')), 'check-parity 没报结论')
  return 'check-parity 退出 0：两端对照表与代码一致，每处 isMobile 都被认领'
})

// 改｜2026-11-10 22:5x｜大鱼·主代理（整合）｜授权：主人（2026-11-10 22:2x 原话：其他的没做的都做）｜scripts/regression.mjs 末尾，只增｜新增 1 条（覆盖三件：注入分层 / 熟练度+人物卡 / 软边界+心跳分组）｜为什么：注入每一块都得有类（没类的漏出来就没人认账）；熟练度只能靠"连续没成"标存疑、不能造分数；软边界是硬线不可破、软线只标不拦、且这模块一个字都不许生成台词｜验证：五个新测试真跑；measure-injection 退出 0；check-parity 绿｜可改：只增不改
ok('2026-11-10 三件：注入分层 / 熟练度与人物卡 / 软边界与心跳分组', () => {
  has('lib/inject-map.js', 'export function classify')
  has('lib/inject-map.js', 'export function unclassified')
  has('lib/soul.js', 'bottomlineBrief(role)')
  has('lib/brief.js', 'wakeBrief')
  has('lib/task-experience.js', 'export function summarize')
  has('lib/task-experience.js', '存疑')
  has('lib/relations.js', 'export function setPersonField')
  has('lib/relations.js', 'habits')
  has('lib/soft-limit.js', 'export function checkSpeak')
  has('lib/soft-limit.js', '不生成任何台词')
  has('lib/soft-limit.js', 'speakPerDay')
  has('lib/heartbeat-journal.js', "t === '额度线'")
  has('lib/heartbeat-journal.js', 'export function wakeClassOf')
  // 2026-11-10：test-inject-map 要真数据（底线在 runtime、角色名册），沙箱家里读不到 → 它自己建临时家、
  // 从真家只读拷贝，所以这里**不带沙箱**跑（它开头就把 DSH_HOME 指到 mkdtemp，写不进真家）。
  {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'test-inject-map.mjs')], { encoding: 'utf8', env: { ...process.env, YUSHEN_TEST: '1' }, timeout: 120000 })
    assert.equal(r.status, 0, `test-inject-map 红了：${String(r.stderr || r.stdout || '').slice(0, 300)}`)
  }
  runTestScript('scripts/test-experience-skill.mjs')
  runTestScript('scripts/test-relations-fields.mjs')
  runTestScript('scripts/test-soft-limit.mjs')
  runTestScript('scripts/test-rotate-pressure.mjs')
  return '四类都有标签（真机 0 未归类）；连续失败只标存疑不造分；软线只标硬线才拦；软边界不生成台词；换班四处投递前都判'
})

// 改｜2026-11-10 23:2x｜大鱼·主代理（第三批）｜授权：主人（2026-11-10 22:4x「做完，验证，给我证据」）｜scripts/regression.mjs 末尾，只增｜新增 1 条（覆盖桥侧三件：权重打分 / 礼貌代发 / 桥上报 + 人物卡写入口）｜为什么：①权重里"老板/私聊/点名"是硬信号，掉档就是把老板找我调成可睡；②代发一句"行我帮你"就把她的承诺发出去了；③桥自己叫醒的那一半不进账，面板永远只数一半｜验证：两个新测试真跑；/wake 与 /decide 的接线静态查；人物卡 field 分支静态查｜可改：只增不改
ok('2026-11-10 桥侧三件：权重打分 / 礼貌代发 / 桥上报 + 人物卡写入口', () => {
  has('lib/wake-score.js', 'export function scoreMessage')
  has('lib/wake-score.js', '必醒')
  has('lib/wake-score.js', '在对别人说')
  has('lib/polite-relay.js', 'export function isPolite')
  has('lib/polite-relay.js', '只发不表态的')
  has('lib/polite-relay.js', 'export function noteRelay')
  has('lib/polite-relay.js', 'export function relaysSince')
  has('lib/wake-brief.js', '你睡着时我替你回了')
  has('dayu/index.js', "route === '/wake'")
  has('dayu/index.js', 'isPolite(msg.text)')
  has('dayu/index.js', 'noteRelay(role')
  has('dayu/index.js', 'setPersonField(role')
  has('dayu/index.js', "action: { type: 'string', enum: ['remember', 'read', 'field'] }")
  runTestScript('scripts/test-wake-score.mjs')
  runTestScript('scripts/test-polite-relay.mjs')
  return '硬信号有底（老板/私聊≥该醒、点名≥必醒、寒暄≥可代发）；代发只发不表态；桥上报进心跳账（trigger 有人找）；人物卡写入口接进 yushen_person'
})

// 改｜2026-11-10 23:5x｜大鱼·主代理｜授权：主人（2026-11-10 23:4x：引导必须写、要有格式；一眼看过去就知道这东西干嘛的、谁的、我能不能动）｜scripts/regression.mjs 末尾，只增｜新增 1 条：说明格式规范存在 + 承诺带全字段的四个出厂件真的带全（跑 check-notes --require）｜为什么：字段靠自觉必漏；漏了就是"文档写着、代码没有"，下一个人还是看不懂｜验证：check-notes --require 退出 0；全仓缺口数打出来（现在 240，只降不升）｜可改：只增不改
ok('2026-11-10 说明格式：出厂件必须一眼看懂（谁用/谁的/怎么用/怎么关）', () => {
  has('docs/说明格式.md', 'audience')
  has('docs/说明格式.md', '怎么关')
  has('docs/引导-能力.md', '软边界')
  has('docs/引导-能力.md', '不辞而别不行')
  has('scripts/check-notes.mjs', '--require')
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-notes.mjs'), '--require', 'lib/soft-limit.js,lib/polite-relay.js,lib/wake-score.js,dsh-memory/index.js'], { encoding: 'utf8', timeout: 120000 })
  assert.equal(r.status, 0, `承诺带全说明的文件没齐：${String(r.stderr || r.stdout || '').slice(0, 300)}`)
  const all = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-notes.mjs')], { encoding: 'utf8', timeout: 120000 })
  const m = String(all.stdout || '').match(/缺字段 (\d+) 个/)
  return `四个出厂件字段齐；全仓还缺 ${m ? m[1] : '?'} 个（只降不升，逐步补）`
})

// 改｜2026-11-11 00:1x｜大鱼·记忆会话｜授权：老板（2026-11-11：做法账本 + 改前查重，机制常驻不靠自觉）｜scripts/regression.mjs 末尾，只增｜新增 1 条（覆盖做法账本：计分/等级/状态/关联/查询排序 + 两个工具 + 注入一行）｜为什么：计分口径是老板定的（+1/-1，满 10 升级），状态必须由事件推导而不是手填；联动不硬绑——一次性任务不进做法账本｜验证：test-skills 9 条真跑；工具名静态查；soul 注入行静态查｜可改：只增不改
ok('2026-11-11 做法账本：计分/等级/状态 + 常驻工作区 + 改前查重', () => {
  has('lib/skills.js', 'export function record')
  has('lib/skills.js', 'export function querySkills')
  has('lib/skills.js', '警醒')
  has('lib/skills.js', "SKILL_STATES")
  has('dayu/index.js', "name: 'yushen_skills'")
  has('dayu/index.js', "name: 'yushen_wheel'")
  has('lib/soul.js', 'skillsLine')
  has('lib/inject-map.js', '做法账本')
  runTestScript('scripts/test-skills.mjs')
  return '做对 +1 / 做错 -1 / 改了 +1 / 再犯 -1；满 10 升一级、掉下阈值降；状态由事件序列推导；只用 id 关联事实账；常驻工作区一行'
})

// 改｜2026-11-11 00:3x｜大鱼·主代理｜授权：主人（2026-11-11 00:2x：「其他的做」）｜scripts/regression.mjs 末尾，只增｜新增 1 条（覆盖今晚三件：说明字段覆盖 / 心跳→事件闸门 / 额度闸门接在发送路径）｜为什么：①说明字段靠自觉必漏；②心跳一天 48 跳，闸门判错就把 200 条记忆上限灌爆；③额度线以前只算不拦｜验证：test-notes-coverage 5/5、test-heartbeat-ingest 11/11、test-decide-gate 7/7；check-notes --require 49 个退出 0｜可改：只增不改
ok('2026-11-11 说明字段覆盖 / 心跳闸门 / 额度闸门接线', () => {
  has('scripts/check-notes.mjs', '--require')
  has('scripts/notes-covered.json', 'lib/')
  has('docs/引导-能力.md', '不辞而别不行')
  has('lib/brief.js', 'docs/引导-能力.md')
  has('lib/heartbeat-ingest.js', 'export function shouldIngest')
  has('lib/heartbeat-ingest.js', '缺口')
  has('lib/decide-gate.js', 'export function gateOf')
  has('dayu/index.js', 'gateOf(lim)')
  has('dayu/index.js', 'ingestHeartbeats(role)')
  runTestScript('scripts/test-notes-coverage.mjs')
  runTestScript('scripts/test-heartbeat-ingest.mjs')
  runTestScript('scripts/test-decide-gate.mjs')
  return '49 个出厂模块字段齐（全仓缺口 240→191，只降不升）；心跳只转"有落点/出事/有人等/到线"，6h 折叠；到线默认收手、跳出去一天一次、不辞而别不行'
})

// 改｜2026-11-11 01:1x｜大鱼·主代理｜授权：主人（2026-11-11 01:0x：「暂时不重启，能做先做」）｜scripts/regression.mjs 末尾，只增｜新增 1 条（借阅账：注入不算借阅、检索才记；醒来段「最近借了 N 本」）｜为什么：图书馆的"借阅"如果连注入都算，她一天会被记几十次"翻过"，次数就失去意义；口径定死才能拿它排序/正名｜验证：test-borrow 4/4 真跑；test-wake-brief 7/7 没被挤坏｜可改：只增不改
ok('2026-11-11 借阅账：注入不算借阅 / 检索才记 / 醒来段有一行', () => {
  has('lib/borrow.js', 'export function borrowStats')
  has('lib/borrow.js', 'export function noteUsed')
  has('lib/wake-brief.js', '最近借了')
  runTestScript('scripts/test-borrow.mjs')
  return '注入不记账（测试④钉死）；检索才进 borrowStats；醒来段窗口是"这一觉期间"而不是"今天"'
})

// 改｜2026-11-11 01:2x｜大鱼·主代理｜授权：主人（2026-11-11：「暂时不重启，能做先做」）｜scripts/regression.mjs 末尾，只增｜新增 1 条（心跳下沉共享内核：内存内核只存不判，语义留鱼神；dsh-memory 能独立读）｜为什么：心跳以前长在鱼神里，别人装了 dsh-memory 拿不到；下沉后"通用能力"和"她的判断"分开，装壳的人也能看见心跳｜验证：test-heartbeat-core 6/6、test-dsh-memory-heartbeat 6/6、旧 test-heartbeat-journal 12/12、test-heartbeat-ingest 11/11｜可改：只增不改
ok('2026-11-11 心跳下沉共享内核：只存不判 / 语义留鱼神 / 壳能独立读', () => {
  has('memory-core/heartbeat.mjs', 'export function append')
  has('memory-core/heartbeat.mjs', 'export function summary')
  has('lib/heartbeat-journal.js', 'memory-core/heartbeat.mjs')
  has('lib/heartbeat-journal.js', 'wakeClassOf')
  has('dsh-memory/index.js', 'memory_heartbeat')
  runTestScript('scripts/test-heartbeat-core.mjs')
  runTestScript('scripts/test-dsh-memory-heartbeat.mjs')
  return '内核只按角色追加/读/汇总；trigger/whyNot/分组仍只在鱼神；只装 dsh-memory+memory-core 也能读到心跳'
})

// 2026-11-24：独立包也要有“记”以外的记忆——决定簿/自我记忆用同一份通用核心，写自己的目录。
ok('独立记忆包：决定 / 自我 / 现在 / 卡片 / 单多角色用同一核心', () => {
  has('dsh-memory/index.js', "name: 'memory_define'")
  has('dsh-memory/index.js', "name: 'memory_self'")
  has('dsh-memory/index.js', "name: 'memory_now'")
  has('dsh-memory/index.js', "name: 'memory_card'")
  has('dsh-memory/index.js', "name: 'memory_mode'")
  has('dsh-memory/index.js', "name: 'memory_roles'")
  has('dsh-memory/pack.mjs', "'generic/definitions.js'")
  has('dsh-memory/pack.mjs', "'generic/self-memory.js'")
  has('dsh-memory/pack.mjs', "'generic/now-page.js'")
  has('dsh-memory/pack.mjs', "'generic/cards.js'")
  runTestScript('scripts/test-dsh-memory-generic.mjs')
  return '10 工具 / single+multi / 独立目录 / 打包后可用'
})

// 改｜2026-11-11 18:5x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接待办①：判断判对错、自愈修好接进做法账本）｜scripts/regression.mjs 末尾，只增｜新增 1 条（做法账本五个入口：判断回看 + 修复对账两个钩子；attachOnly 只挂不造）｜为什么：钩子接上但不测，等于「写了没生效」；而判断/事故是事实不是方法，必须钉住「不新建条目」｜验证：test-skill-hooks 6/6、test-skills 16/16 真跑｜可改：只增不改
ok('2026-11-11 做法账本两个钩子：判断判对错 / 自愈修好', () => {
  has('lib/skills.js', 'attachOnly')
  has('lib/self-note.js', "entry: 'judgment'")
  has('lib/repair-loop.js', "entry: 'repair'")
  runTestScript('scripts/test-skill-hooks.mjs')
  runTestScript('scripts/test-skills.mjs')
  return '判断回看：判对 ok / 判错 fail / 说不清不记；修复对账：还 open 记 fail、证据消失记 fixed（错→改→对）；都只挂已有做法，没有就留跳过证据'
})
// 改｜2026-11-11 19:0x｜大鱼·本班（接手交接 2026-11-11-0255）｜授权：主人（交接 §二 图书馆定稿：闭架按月、一个月不用降级、被用到搬回）｜scripts/regression.mjs 末尾，只增｜新增 1 条（闭架库：计划/只搬不删/按月分桶/可查不优先/搬回/一天一次）｜为什么：闭架是唯一会自己搬文件的机制，没有断言就等于让它在无人看管下动数据｜验证：test-library-closed 10/10 真跑｜可改：只增不改
ok('2026-11-11 闭架库：一个月不用降级 / 按月分桶 / 可查不优先 / 只搬不删', () => {
  has('lib/library-shelf.js', 'export function demoteStale')
  has('lib/library-shelf.js', 'export function revive')
  has('lib/library-shelf.js', 'export function demoteDaily')
  has('lib/library-chain.js', 'closedLookup')
  has('lib/body-loop.js', 'demoteDaily')
  runTestScript('scripts/test-library-closed.mjs')
  return '整份过期的才搬、按月分桶、闭架排在最后、sha1 不变、一天一次'
})
// 改｜2026-11-11 19:1x｜大鱼·主代理｜授权：主人（2026-11-11 19:0x：「做」注入结构）｜scripts/regression.mjs 末尾，只增｜新增 1 条（注入书：三个静态段搬进 pages/注入/*.md，缺页回落、字节一致）｜为什么：正文搬出去以后，"页面丢了"和"内容被改了"是两回事——前者要回落、后者要红；不测就只能等装上别人的机器才发现 | 验证：test-inject-pages 4/4、test-inject-protocol 6/6 真跑｜可改：只增不改
ok('2026-11-11 注入书：静态段搬文件 / 缺页回落 / 字节一致', () => {
  has('lib/inject-pages.js', 'export function loadPage')
  has('lib/inject-pages.js', 'resetPagesCache')
  has('pages/注入/safety.md', 'owner:')
  has('lib/brief.js', 'loadPage')
  has('package.json', 'pages/')
  runTestScript('scripts/test-inject-pages.mjs')
  return '三段正文在 pages/注入/；页面缺失时回落到代码字面量、输出一字不差；有页/无页 normHash 相同'
})

// 改｜2026-11-11 20:0x｜大鱼·本班｜授权：主人（2026-11-11：「以前不是有自动提炼吗……其他的做」）｜scripts/regression.mjs 末尾，只增｜新增 1 条（精提炼配额跟积压走 + 检索用没用上真的会动 + 冷档第二来源）｜为什么：这三处都是"看着有、其实不动"的地方——配额小到追不上、核对口径永远 0、冷档只扫一份来源；没有断言就会再退回去｜验证：test-refine-quota 6/6、test-recall-usage 4/4 真跑｜可改：只增不改
ok('2026-11-11 记忆三处补丁：提炼配额 / 用没用上 / 冷档第二来源', () => {
  has('lib/refine-quota.js', 'export function refineQuota')
  has('scripts/maintenance.mjs', 'refineQuota')
  has('lib/recall-usage.js', 'export function verifyUsage')
  has('scripts/maintenance.mjs', "runScript('recall-usage.mjs'")
  has('lib/recall-log.js', 'preview')
  has('scripts/link-cold-archive.mjs', "walk(LIVE, 'live')")
  has('lib/sysmap.js', 'export function buildIndex')
  has('scripts/sysmap.mjs', 'relations')
  runTestScript('scripts/test-sysmap.mjs')
  has('scripts/refine.mjs', '--dispose')
  has('scripts/maintenance.mjs', 'dispose()')
  runTestScript('scripts/test-refine-quota.mjs')
  runTestScript('scripts/test-recall-usage.mjs')
  runTestScript('scripts/test-refine-dispose.mjs')
  return '积压越深配额越大且日预算封顶；核对看 preview 片段、弱证据不算用上；冷档扫归档+live'
})

ok('2026-11-17 记忆二十八件：时间 / 事件段 / 总结核对 / 投影里表 / 经验共享 / 25项自测 / 中层清理 / 核对闸门 / 自动收尾 / 分身汇报 / 反馈加权 / 维护接线 / 分身注入 / 反馈入提炼 / 机制登记 / 心跳感官 / 从点拉网 / 多会话租约 / 软件简报 / 下次启动包 / 压缩开关 / 压缩桥 / 每轮台账 / 整件事目录 / 召回视图 / 页面设置 / 召回接线 / 预注入召回', () => {
  has('memory-core/runtime/time-range.js', 'export function parseTimeRange')
  has('memory-core/runtime/query.js', 'parseTimeRange')
  has('memory-core/runtime/episode.js', 'export function buildEpisodes')
  has('lib/summary-check.js', 'export function checkSummary')
  has('lib/summary-gate.js', 'export function checkAndGate')
  has('memory-core/runtime/share.js', 'export function shareCard')
  has('lib/subagent-reports.js', 'export function recordReport')
  has('lib/subagent-brief.js', 'export function buildSubagentBrief')
  has('lib/refine-feedback.js', 'export function scoreFeedback')
  has('lib/mechanism-registry.js', 'export function loadMechanisms')
  has('lib/heartbeat-signals.js', 'export function buildPainSignals')
  has('lib/graph.js', 'export function expandPoint')
  has('lib/session-lease.js', 'export function acquire')
  has('lib/system-brief.js', 'export function buildSystemBrief')
  has('lib/next-session-brief.js', 'export function prepare')
  has('lib/compaction-mode.js', 'export function setMode')
  has('lib/compaction-bridge.js', 'export function installCompactionBridge')
  has('lib/turn-ledger.js', 'export function observe')
  has('lib/event-toc.js', 'export function buildEventToc')
  has('lib/recall-view.js', 'export function chooseRecallView')
  has('lib/prestep-recall.js', 'export function buildPreStepRecall')
  has('dayu/index.js', 'buildPreStepRecall')
  has('dayu/index.js', 'observeTurnLedger')
  has('dayu/index.js', "agent/pre-step")
  has('dayu/index.js', 'nextReminder(role, { limit: 1, sessionId: sid })')
  has('dayu/index.js', 'installCompactionBridge')
  has('dayu/index.js', 'prepareNextSession')
  has('lib/soul.js', 'consumeNextSession')
  has('dayu/index.js', 'buildPainSignals')
  has('dayu/m1.js', 'searchMechanisms')
  has('scripts/maintenance.mjs', 'episodes()')
  runTestScript('scripts/test-time-range.mjs')
  runTestScript('scripts/test-episode.mjs')
  runTestScript('scripts/test-summary-check.mjs')
  runTestScript('scripts/test-projection-inner.mjs')
  runTestScript('scripts/test-share.mjs')
  runTestScript('scripts/test-query-role.mjs')
  runTestScript('scripts/test-summary-gate.mjs')
  runTestScript('scripts/test-summary-pending.mjs')
  runTestScript('scripts/test-middle-clean.mjs')
  runTestScript('scripts/test-eval-memory-25.mjs')
  runTestScript('scripts/test-episodes-auto.mjs')
  runTestScript('scripts/test-subagent-reports.mjs')
  runTestScript('scripts/test-subagent-brief.mjs')
  runTestScript('scripts/test-refine-feedback.mjs')
  runTestScript('scripts/test-refine-feedback-wire.mjs')
  runTestScript('scripts/test-maintenance-episodes.mjs')
  runTestScript('scripts/test-mechanism-registry.mjs')
  runTestScript('scripts/test-heartbeat-signals.mjs')
  runTestScript('scripts/test-graph.mjs')
  runTestScript('scripts/test-session-lease.mjs')
  runTestScript('scripts/test-system-brief.mjs')
  runTestScript('scripts/test-next-session-brief.mjs')
  runTestScript('scripts/test-compaction-memory.mjs')
  runTestScript('scripts/test-compaction-bridge.mjs')
  runTestScript('scripts/test-turn-ledger.mjs')
  runTestScript('scripts/test-task-lifecycle.mjs')
  runTestScript('scripts/test-lexical-vector.mjs')
  runTestScript('scripts/test-vector-index.mjs')
  runTestScript('scripts/test-vector-index-refresh.mjs')
  runTestScript('scripts/test-event-toc.mjs')
  runTestScript('scripts/test-recall-view.mjs')
  runTestScript('scripts/test-recall-view-wire.mjs')
  runTestScript('scripts/test-client-settings.mjs')
  runTestScript('scripts/test-prestep-recall.mjs')
  return '时间/事件段/总结/投影/经验共享/25项自测/中层清理/核对闸门/自动收尾/分身汇报/反馈加权/维护接线/分身注入/反馈入提炼/机制登记/心跳痛觉都有可跑测试'
})

// 改｜2026-11-17 21:1x｜大鱼·子会话（验收补口）｜授权：主人（本次任务书：把验收报告点名的 12 个功能测试接进 regression，并新增单角色测试）｜scripts/regression.mjs 末尾，只增｜新增 1 条：12 个功能测试 + 单角色测试都进全量回归｜为什么：验收报告 §3.4 指出这 12 个脚本不在 runTestScript 清单里，"回归绿"不代表它们被跑过；文件不存在时跳过并记录，不冒充绿也不冒充红｜验证：node scripts/regression.mjs 全绿（本条逐个真跑 13 个脚本）｜可改：只增不改（删一条要写清为什么）
ok('2026-11-17 验收补口：12 个功能测试 + 单角色 + 信箱水位 + 心跳落盘都进全量回归', () => {
  const wanted = [
    'scripts/test-turn-capture.mjs',
    'scripts/test-capture.mjs',
    'scripts/test-cards.mjs',
    'scripts/test-manual-card.mjs',
    'scripts/test-supersede.mjs',
    'scripts/test-query.mjs',
    'scripts/test-process-lock.mjs',
    'scripts/test-feedback.mjs',
    'scripts/test-feedback-carry.mjs',
    'scripts/test-feedback-rank.mjs',
    'scripts/test-usage.mjs',
    'scripts/test-fact-ledger.mjs',
    // 同一天新加：只有一个角色、没有群/信箱时，主要模块不按三角色硬编码走
    'scripts/test-single-role.mjs',
    // 同日修：信箱跨天/已读位、心跳痛觉落盘
    'scripts/test-inbox-read.mjs',
    'scripts/test-heartbeat-persist.mjs',
    'scripts/test-claim-ledger.mjs',
    'scripts/test-answer-selfcheck.mjs',
    'scripts/test-workbench-query.mjs',
  ]
  const missing = wanted.filter((s) => !fs.existsSync(path.join(ROOT, s)))
  const ran = wanted.filter((s) => !missing.includes(s))
  // "不存在就跳过并记录"：跳过要在输出里留下名字，不许静默漏掉。
  if (missing.length) console.log(`⤼ 功能测试文件不存在，跳过并记录：${missing.join('、')}`)
  assert.equal(new Set(wanted).size, wanted.length, '清单里有重复脚本')
  for (const s of ran) runTestScript(s)
  return `接进 ${ran.length} 个（含单角色 1 个）；不存在跳过 ${missing.length} 个${missing.length ? `（${missing.join('、')}）` : ''}`
})
// 改｜2026-11-17 23:1x｜大鱼·子会话（工作台）｜授权：老板（本次任务书：群/信箱撤用户入口、底层消息账保留）｜scripts/regression.mjs 末尾，只增｜新增 1 条：两个工具不再注册（分发器也够不到），内部 appendInbox/readInbox 与群桥照旧｜为什么：「不注册」若只做到不注入，yushen_tools 仍能 action=call，等于没撤；必须同时验入口没了、账还在｜验证：node scripts/regression.mjs 本条绿（真跑 scripts/test-retired-entry-tools.mjs 6/6）｜可改：只增不改
ok('2026-11-17 群/信箱只撤用户入口：不再注册，账本与群桥照旧', () => {
  const entry = read('dayu/index.js')
  assert.match(entry, /const RETIRED_USER_ENTRY = new Set\(\['yushen_group', 'yushen_inbox'\]\)/, '撤除清单没了')
  const gate = entry.indexOf('if (RETIRED_USER_ENTRY.has(def.name))')
  assert.ok(gate > 0 && gate < entry.indexOf('ownTools.set(def.name, def)'), '撤除闸没挡在 ownTools/注册之前')
  // 定义保留、内部写入还在：撤的是入口，不是账本
  has('dayu/index.js', "name: 'yushen_group'")
  has('dayu/index.js', "name: 'yushen_inbox'")
  has('dayu/index.js', 'function appendInbox(row)')
  // 注入提示也不再让她去调已撤的工具（只改提示，群桥/账本不动）
  if (/yushen_(?:group|inbox)/.test(read('lib/soul.js'))) throw new Error('lib/soul.js 还在提示已撤的群/信箱入口')
  if (/yushen_(?:group|inbox)/.test(read('lib/brief.js'))) throw new Error('lib/brief.js 还在提示已撤的群/信箱入口')
  const ran = runTestScript('scripts/test-retired-entry-tools.mjs')
  return `入口已撤 + 账本/群桥照旧${ran ? '（临时家真跑 6/6）' : '（环境不给子进程，跳过）'}`
})
console.log(`\n回归：通过 ${pass}，失败 ${fail}${skipped ? `，跳过 ${skipped}（环境不给子进程）` : ''}`)
process.exit(fail ? 1 : 0)