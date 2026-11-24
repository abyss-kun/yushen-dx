// 改｜2026-11-24 23:45｜大鱼·工作台｜授权：主人（2026-11-24：继续——记忆插件/常驻/独立包收口）｜scripts/test-body-tool.mjs:1｜本轮改动的一部分（自我记忆8类、常驻开关、独立包单多角色、内部群叫醒、连续性验收）｜为什么：记忆插件要能单独出厂、常驻按情况开关｜验证：回归 325/0；独立包/连续性测试通过｜可改：可改
// 常驻/分身工具（lib/body-tool.js）自测：临时家里造一份常驻账 + 分身账，验 list/use/report。
// 规矩：只读/只写这三份账（residence.json / bodies.json / subagent-reports-*.jsonl），
// 不碰真 ~/.dsh；临时家是 mkdtemp 出来的，跑完只删这一份。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yushen-body-tool-'))
process.env.DSH_HOME = tmp
delete process.env.DSH_MEMORY_HOME

const SID_RES_DAYU = 'session-res-dayu-0000-0000-0000-000000000001'
const SID_RES_XIAOYU = 'session-res-xiaoyu-0000-0000-0000-000000000002'
const SID_BODY_DAYU = 'session-body-dayu-0000-0000-0000-000000000003'
const SID_CLAIMED_XIAOYU = 'session-claimed-xiaoyu-0000-0000-0000-000000000004'
const SID_NEW = 'session-new-0000-0000-0000-000000000005'

let failed = null
try {
  const DAYU = path.join(tmp, 'dayu')
  fs.mkdirSync(DAYU, { recursive: true })

  // 名册：residentRoles() 从名册来，常驻账里的角色必须在册。
  fs.writeFileSync(path.join(DAYU, 'characters.json'), JSON.stringify({
    version: 1,
    characters: [
      { id: 'dayu', name: '大鱼', alias: '阿鲲', title: '鱼神·总台' },
      { id: 'xiaoyu', name: '小鱼', alias: '阿鲤', title: '小鱼·管家' },
    ],
  }, null, 2))

  // 最小本体：residenceStatus() 会读 persona（只给 brief/scenes 的壳，够它算状态）。
  fs.mkdirSync(path.join(DAYU, 'soul'), { recursive: true })
  fs.writeFileSync(path.join(DAYU, 'soul', 'persona.json'), JSON.stringify({
    version: 1,
    brief: '',
    scenes: {},
    memory: {},
  }, null, 2))

  // 假的常驻账：dayu / xiaoyu 各一条身体。
  fs.writeFileSync(path.join(DAYU, 'residence.json'), JSON.stringify({
    version: 1,
    updatedAt: '2026-11-24T12:00:00.000Z',
    roles: {
      dayu: { role: 'dayu', title: '鱼神·总台', sessionId: SID_RES_DAYU, lastMessageAt: '2026-11-24T11:00:00.000Z' },
      xiaoyu: { role: 'xiaoyu', title: '小鱼·管家', sessionId: SID_RES_XIAOYU, lastMessageAt: '2026-11-24T10:00:00.000Z' },
    },
  }, null, 2))

  // 假的分身账：dayu 有一个分身，xiaoyu 有一个分身。
  fs.writeFileSync(path.join(DAYU, 'bodies.json'), JSON.stringify({
    version: 1,
    roles: {
      dayu: { [SID_BODY_DAYU]: { channel: '加载卡', firstAt: '2026-11-23T09:00:00.000Z', lastAt: '2026-11-24T09:00:00.000Z', count: 2 } },
      xiaoyu: { [SID_CLAIMED_XIAOYU]: { channel: 'QQ', firstAt: '2026-11-23T08:00:00.000Z', lastAt: '2026-11-24T08:00:00.000Z', count: 1 } },
    },
  }, null, 2))

  const { listBodies, useBody, reportToBody, residentCommandRole, residentPrompt, residentFeature, setResidentFeature, isSubagentReport, reportSentence } = await import('../lib/body-tool.js')
  const { readLedger, residenceStatus } = await import('../lib/residence.js')
  const { claimOf } = await import('../lib/bodies.js')
  const { recentReports } = await import('../lib/subagent-reports.js')

  // 1) 列常驻与分身：两条常驻都在，分身表按 bodies.json 平铺出来。
  const listed = listBodies({ role: 'dayu', sessionId: SID_RES_DAYU })
  assert.equal(listed.ok, true)
  assert.deepEqual(listed.me, { role: 'dayu', sessionId: SID_RES_DAYU, claimedAs: '' })
  const residentRoles = listed.residents.map((r) => r.role).sort()
  assert.deepEqual(residentRoles, ['dayu', 'xiaoyu'])
  const dayuResident = listed.residents.find((r) => r.role === 'dayu')
  assert.equal(dayuResident.sessionId, SID_RES_DAYU)
  assert.equal(dayuResident.alive, true)
  assert.equal(dayuResident.isMe, true)
  const xiaoyuResident = listed.residents.find((r) => r.role === 'xiaoyu')
  assert.equal(xiaoyuResident.sessionId, SID_RES_XIAOYU)
  assert.equal(xiaoyuResident.isMe, false)
  assert.equal(listed.bodies.length, 2)
  const bodyDayu = listed.bodies.find((b) => b.sessionId === SID_BODY_DAYU)
  assert.equal(bodyDayu.role, 'dayu')
  assert.equal(bodyDayu.channel, '加载卡')
  assert.equal(bodyDayu.count, 2)
  assert.ok(bodyDayu.lastAt)
  assert.equal(listed.bodies.find((b) => b.sessionId === SID_CLAIMED_XIAOYU).role, 'xiaoyu')

  // 2) 把当前会话设成 dayu 常驻：写凭据 + 写常驻账，并返回原来那条身体。
  const used = useBody({ role: 'dayu', target: 'dayu', sessionId: SID_NEW })
  assert.equal(used.ok, true)
  assert.equal(used.role, 'dayu')
  assert.equal(used.sessionId, SID_NEW)
  assert.equal(used.previous, SID_RES_DAYU)
  assert.equal(claimOf(SID_NEW), 'dayu')
  assert.equal(readLedger().roles.dayu.sessionId, SID_NEW)
  assert.equal(residenceStatus().roles.dayu.sessionId, SID_NEW)
  // 别人那条身体没被带跑：小鱼仍是原来的会话。
  assert.equal(readLedger().roles.xiaoyu.sessionId, SID_RES_XIAOYU)

  // 3) 已认成小鱼的会话不能被挂成大鱼常驻：明说冲突，不默默改。
  const conflict = useBody({ role: 'dayu', target: 'dayu', sessionId: SID_CLAIMED_XIAOYU })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.reason, 'claimed-as')
  assert.equal(conflict.claimedAs, 'xiaoyu')
  assert.equal(readLedger().roles.dayu.sessionId, SID_NEW)
  assert.equal(claimOf(SID_CLAIMED_XIAOYU), 'xiaoyu')

  // 4) 写一条汇报，常驻主体立刻能按角色读到（只追加，不注入、不发消息）。
  const reported = reportToBody({
    role: 'xiaoyu',
    sessionId: SID_NEW,
    text: '把常驻/分身工具接上了',
    ref: 'lib/body-tool.js',
  })
  assert.equal(reported.ok, true)
  assert.equal(reported.parentRole, 'xiaoyu')
  assert.equal(reported.childSessionId, SID_NEW)
  const reports = recentReports('xiaoyu', { limit: 5 })
  assert.equal(reports.length, 1)
  assert.equal(reports[0].parentRole, 'xiaoyu')
  assert.equal(reports[0].childSessionId, SID_NEW)
  assert.equal(reports[0].text, '把常驻/分身工具接上了')
  assert.equal(reports[0].ref, 'lib/body-tool.js')
  assert.equal(reports[0].notSubjectExperience, true)

  // 5) 未知角色 / 空会话都拒得清楚。
  assert.equal(useBody({ role: 'dayu', target: 'nobody', sessionId: SID_NEW }).reason, 'unknown-role')
  assert.equal(useBody({ role: 'dayu', target: 'dayu', sessionId: '' }).reason, 'missing-session')

  // 6) 一句话“常驻”识别：只认“常驻”，不把普通加载卡当常驻。
  assert.equal(residentCommandRole('加载大鱼常驻'), 'dayu')
  assert.equal(residentCommandRole('转成小鱼常驻'), 'xiaoyu')
  assert.equal(residentCommandRole('照微常驻'), 'dragon')
  assert.equal(residentCommandRole('加载大鱼角色卡'), '')
  assert.equal(residentCommandRole('看看小鱼的记忆'), '')

  // 7) 分身自动汇报：不是常驻会话 + 有落点才写；截一句，不搬全文。
  assert.equal(isSubagentReport({ residenceSessionId: SID_RES_DAYU, sessionId: SID_BODY_DAYU, text: '做完了，测试通过' }), true)
  assert.equal(isSubagentReport({ residenceSessionId: SID_RES_DAYU, sessionId: SID_RES_DAYU, text: '做完了' }), false)
  assert.equal(isSubagentReport({ residenceSessionId: SID_RES_DAYU, sessionId: SID_BODY_DAYU, text: '今天天气不错' }), false)
  assert.match(reportSentence('先查了三处。做完了，测试通过。后面还有一点。'), /做完了，测试通过/)
  assert.equal(reportSentence('今天天气不错'), '')

  // 8) 加载卡时的一句提示：没常驻才提示；已有常驻 / 不在册角色都不提示；不换常驻、不写盘。
  const missingPrompt = residentPrompt({ role: 'dayu', residents: {} })
  assert.equal(missingPrompt, '这个角色还没有活着的常驻；要设为常驻就对新会话说“加载大鱼常驻”。')
  assert.ok(missingPrompt.length <= 40)
  assert.match(missingPrompt, /常驻/)
  assert.equal(residentPrompt({ role: 'dayu', residents: { dayu: { sessionId: SID_RES_DAYU } } }), '')
  assert.equal(residentPrompt({ role: 'nobody', residents: {} }), '')
  assert.equal(residentPrompt({ role: 'dragon', residents: {} }), '') // 本测试名册里没有照微：不在册就不提示。
  assert.match(residentPrompt({ role: 'xiaoyu', residents: {} }), /小鱼/)
  // 提示只是问一句：常驻账没被改动（dayu 还停在 useBody 写进去的那条会话）。
  assert.equal(readLedger().roles.dayu.sessionId, SID_NEW)

  // 9) 常驻层默认按“多角色/已有身体”自动判；纯单角色单会话默认关；显式开关优先。
  assert.equal(residentFeature({ roles: ['dayu'], ledger: { roles: {} } }), false)
  assert.equal(residentFeature({ roles: ['dayu', 'xiaoyu'], ledger: { roles: {} } }), true)
  assert.equal(residentFeature({ roles: [], ledger: { roles: { dayu: { sessionId: 's-1' } } } }), true)
  assert.equal(setResidentFeature(true).ok, true)
  assert.equal(residentFeature(), true)
  assert.equal(setResidentFeature(false).ok, true)
  assert.equal(residentFeature(), false)
} catch (error) {
  failed = error
} finally {
  // 只删自己 mkdtemp 出来的那一份；先确认它真在系统 temp 下。
  assert.equal(path.dirname(tmp), os.tmpdir())
  fs.rmSync(tmp, { recursive: true, force: true })
}

if (failed) throw failed
console.log('test-body-tool: 通过')
