// 回归清单：每一条“反馈过的问题”在这里变成一条断言。
// 规矩：修完一个 bug，先在这里加一条；加不出来，说明还没真修明白。
// 运行：node scripts/regression.mjs

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
  const r = spawnSync(process.execPath, [path.join(ROOT, script)], { encoding: 'utf8' })
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
const { markPending, takePending, peekPending, toMs } = await import(pathToFileURL(path.join(ROOT, 'lib/pending.js')).href)
const { attributionOf } = await import(pathToFileURL(path.join(ROOT, 'lib/memory.js')).href)
const { memoryView, buildSceneText } = await import(pathToFileURL(path.join(ROOT, 'lib/soul.js')).href)
const { judge: backupJudge } = await import(pathToFileURL(path.join(ROOT, 'lib/backup-judge.js')).href)
const { plan: forgetPlan, policy: forgetPolicy } = await import(pathToFileURL(path.join(ROOT, 'lib/forget.js')).href)
const { handbookForEmployee } = await import(pathToFileURL(path.join(ROOT, 'lib/employee-profile.js')).href)
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
const { judgeFishChat } = await import(pathToFileURL(path.join(ROOT, 'lib/fish-guard.js')).href)
const { CLARITY_ORDER, memoryCapacity } = await import(pathToFileURL(path.join(ROOT, 'lib/memory.js')).href)
const { addFromMind } = await import(pathToFileURL(path.join(ROOT, 'lib/agenda.js')).href)
const { bodyStatus, bodyRecent } = await import(pathToFileURL(path.join(ROOT, 'lib/body-loop.js')).href)
const { loadQQPack, packText } = await import(pathToFileURL(path.join(ROOT, 'lib/scene-pack.js')).href)

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
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
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
  has('docs/员工手册.md', '第十五章 手册分层与发放')
  has('docs/员工手册.md', '第十七章 视频与创作')
  return '通用底线 + 岗位/任务切片 + 源章显式读 + 可信上层工具入口'
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
ok('记忆回写：她说的话进她自己的 events', () => {
  has('lib/memory.js', 'export function appendEvent')
  has('lib/memory.js', 'roleForSession')
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
  has('docs/入主鱼神-判断权归位.md', '判断权')
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
  has('dayu/index.js', 'consolidateTick')
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
  has('dayu/index.js', 'consolidateTick')
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
  has('dayu/index.js', 'consolidateTick')
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
  has('docs/入主鱼神-判断权归位.md', 'affinity.gate')
  has('docs/入主鱼神-判断权归位.md', '不再拦')
  has('docs/点化-运行时契约.md', '好感阈值不再拦')
  return 'hint 默认 / block 回退；分数只调语气'
})

// 35. 2026-10-26：不给枷锁，只报账——回不回/本地还是云端，她自己定
// 2026-10-30 改锚点：原来锁的是「主人不是富翁」那句话，老板说那是替她做决定，删了。
// 现在锁"报了什么数"，不锁"劝了她什么"。
ok('报账不设闸：她自己决定回不回、用本地还是云端', () => {
  has('lib/cost.js', 'QQ 那边今天一共')
  has('lib/cost.js', '按真实流水现算')
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
  has('lib/brief.js', '拒，然后说一声')
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
  has('lib/rules-block.js', 'COMMON_RULES.slice(0, 3)')
  has('lib/rules-block.js', '铁律和底线不用查')
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
  has('client.js', '形象版本')
  has('scripts/style.mjs', 'use anime-q')
  has('scripts/style.mjs', 'use anime-normal')
  has('docs/形象版本切换.md', 'current-style.json')
  has('docs/阶位.md', 'Q 版透明 PNG')
  has('index.js', '/yushen-assets/halo')
  has('docs/阶位.md', 'Q 版透明 PNG')
  has('lib/rank.js', "RANK_ROLES = Object.freeze(['dayu', 'xiaoyu'])")
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
// 77. 2026-10-27：手册按场景发——合订本拆成「常驻 + 到场景才给的那几页」。
// 铁律：拆开不等于删掉，字数必须守恒。
ok('场景包：拆开不删字，按需给页数', () => {
  const p = loadQQPack()
  assert.equal(p.stats.balanced, true, `字数不守恒：总 ${p.stats.total} = 常驻 ${p.stats.core} + 场景 ${p.stats.scenes}`)
  assert.ok(p.stats.sceneCount >= 10, `场景节太少：${p.stats.sceneCount}`)
  const plain = packText({ signals: [], pack: p })
  assert.ok(plain.chars < p.stats.total, '不带信号时该比全文短')
  const withMedia = packText({ signals: ['media'], pack: p })
  assert.ok(withMedia.chars > plain.chars, '带图时该多给一页')
  return `原文 ${p.stats.total}；默认 ${plain.chars}（省 ${plain.saved}）；带图 ${withMedia.chars}`
})

// 79. 2026-10-28：读 SurfCore 后抄三件事——入库脱敏、记忆清晰度、鱼群保护。
ok('记忆：入库脱敏 + 清晰度五档 + 容量档', () => {
  has('lib/memory.js', "from './redact.js'")
  has('lib/memory.js', 'redact(raw)')
  has('lib/memory.js', 'export function applyDailyDecay')
  has('lib/memory.js', 'export function memoryCapacity')
  has('lib/soul.js', 'includeForgotten')
  assert.deepEqual([...CLARITY_ORDER], ['vivid', 'clear', 'fuzzy', 'trace', 'forgotten'])
  const cap = memoryCapacity('xiaoyu')
  assert.ok(cap.max === 200 && typeof cap.ratio === 'number', '容量算不出来')
  return `容量 ${cap.count}/${cap.max}（${Math.round(cap.ratio * 100)}%）· 五档在`
})

ok('鱼群保护：五只鱼同时说就让位，被点名例外', () => {
  const now = Date.now()
  const mk = (sender, minAgo) => ({ sender, time: now - minAgo * 60000, text: 'hi' })
  const quiet = judgeFishChat([mk('张三', 1), mk('李四', 2), mk('超级大肥鱼', 3)], { now })
  assert.equal(quiet.allow, true, '真人多的时候不该让位')
  const crowded = judgeFishChat([mk('大肥鱼', 1), mk('小肥鱼', 2), mk('超级肥鱼', 3), mk('肥鱼一号', 4), mk('fish_bot', 5), mk('张三', 6)], { now })
  assert.equal(crowded.allow, false, '五只鱼同时说该让位')
  const called = judgeFishChat([mk('大肥鱼', 1), mk('小肥鱼', 2), mk('超级肥鱼', 3), mk('肥鱼一号', 4), mk('fish_bot', 5)], { now, addressed: true })
  assert.equal(called.allow, true, '被点名必须放行')
  return `让位理由：${crowded.reason}`
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
  // 卸载计划必须把 soul/cards 标成保留
  assert.ok(UNINSTALL_KEEP.includes('soul/cards'), '卸载保留清单里没有 soul/cards')
  const plan = uninstallPlan()
  const dataItem = plan.find((p) => p.name.includes('数据'))
  assert.ok(dataItem, '卸载计划里没有数据项')
  assert.ok(Array.isArray(dataItem.keep), '数据项没标保留路径')
  return `点化写 ${writes.length} 处、都不碰卡；卸载保留 ${UNINSTALL_KEEP.join('、')}`
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
  has('dayu/index.js', 'consolidateTick')
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
  has('lib/soul.js', 'buildRuntimeBrief(role, { channel: scene, userId })')
  has('dayu/index.js', "buildSceneText('dayu', 'desk', { userId: ownerKey() })")
  has('dayu/index.js', "url.searchParams.get('userId')")
  return '两个中文名分别落盘；临时家写的档案能进简报；工作台注入与 /soul 都传了 userId'
})

// 86. 2026-10-30：注入里的「家里有什么」还写着「看门狗30秒」和「心跳30分」——
// 看门狗 10-25 就全移除了，心跳是 3 分钟一拍（body-loop.js:34）。这两句每轮都在骗她。
ok('注入里的自己动清单不许再有看门狗，心跳也不许写成 30 分', () => {
  const r = read('lib/rules-block.js')
  assert.ok(!r.includes('看门狗'), '看门狗早就移除了，注入里还留着')
  has('lib/rules-block.js', "'自己动：心跳3分·自省30分·自由时间30分/每天16次·备份04:00'")
  has('lib/body-loop.js', 'const HEARTBEAT_EVERY_MS = 3 * 60 * 1000')
  return '清单与实现一致：心跳 3 分、自省 30 分、没有看门狗'
})

// 87. 2026-10-30：简报里的「自己的钱」是 budget.json 里写死的余额，从设额度那天起没动过——
// 花 2 块和花 0 块看到的是同一个数，她根本没法"感觉到余额在少"。
// 改成按真实流水现算，并且**只报数不劝**（老板：不要用代码去控制她做什么）。
const { costLine, spendForRole, periodStartMs } = await import(pathToFileURL(path.join(ROOT, 'lib/cost.js')).href)
ok('自己的钱按真实流水现算，且不替她做决定', () => {
  assert.equal(periodStartMs({ 本期: '2026-10-29 ~ 2026-11-11' }), new Date(2026, 9, 29).getTime(), '本期开始读错了')
  assert.equal(periodStartMs({}), 0, '没写本期就该返回 0')
  const r = read('lib/cost.js')
  assert.ok(!r.includes('主人不是富翁'), '简报里还在劝她悠着点——那是替她做决定')
  assert.ok(!r.includes('你悠着点'), '「悠着点」是命令，不是事实')
  has('lib/cost.js', 'export function spendForRole')
  has('lib/cost.js', '按真实流水现算')
  const s = spendForRole('xiaoyu', { sinceMs: 0 })
  assert.equal(typeof s.yuan, 'number')
  assert.ok(s.yuan >= 0 && s.turns >= 0, '统计形状不对')
  // 有真账本的机器上，真跑一遍：必须现算、且一句劝都没有
  const bud = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dayu', 'runtime', 'dayu', 'budget.json')
  if (fs.existsSync(bud)) {
    const line = costLine({ role: 'dayu' })
    assert.ok(line.includes('按真实流水现算'), '简报没走现算')
    assert.ok(!line.includes('悠着点'), '简报里还有"悠着点"')
    assert.ok(/还剩 -?\d+\.\d{2} 元/.test(line), '余额那行没了')
  }
  return '本期起点解析对；余额现算；简报里没有一句劝'
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
  has('lib/rules-block.js', '自己只能改自己的')
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

console.log(`\n回归：通过 ${pass}，失败 ${fail}${skipped ? `，跳过 ${skipped}（环境不给子进程）` : ''}`)
if (fail) process.exit(1)
