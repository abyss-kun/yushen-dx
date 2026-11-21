// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: dayu-m1
 * kind: module
 * summary: M1 接线：派活/收话/取证/下结论的 DSH 注册层；逻辑在 core/dispatch.js，这里只注册工具与通知。
 * tags: M1, 派活, 工具注册, 接线
 * created: 2026-11-11 00:55:00
 * changed: 2026-11-11 00:55:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 宿主（DSH）、维护者
 * owner: 框架；改判定口径（pass/reject）要老板点头
 * mutable: 可改；**判定逻辑别在这里写**（挪去 core/dispatch.js，这里只接）
 * usage: export apply(ctx) —— 注册派活/验收/补丁/命令工具；收话走 noteReply
 * why: 入口层混了判定逻辑就没人能单测；现在判定在 core，切面在 m1
 * result: 一层薄接线：注册六个工具 + 通知总台，没有自己的业务规则
 */
// 改｜2026-11-11 19:4x｜大鱼·本班｜授权：主人（「用没用上这个数是死的」）｜dayu/m1.js:386-390｜yushen_recall 记检索时多记一份 preview（最多 3 条、各 60 字的返回片段）｜为什么：日志里只有路径、没有行号，事后核对"用没用上"时不知道当时给她看的是哪句话，于是永远 0｜验证：node scripts/test-recall-usage.mjs 4/4；新增检索行带 preview｜可改：可改；preview 只增不删，别把全文塞进来
// 改｜2026-11-17 19:1x｜照微（子会话）｜授权：老板（任务书：yushen_recall 接 viewMode/task）｜dayu/m1.js 的 yushen_recall｜yushen_recall 接 lib/recall-view.js 的 shapeRecallView：新增 viewMode/task（+ explicitFull/contextPct）参数，返回里多 view/maxChars/why（full 档另带 fullEntry 入口）；默认 balanced，items 结构不变｜为什么：召回一条条都甩内容会吃光上下文，但只给标题又不够用；要能按档位给多少，且 full 不等于把全文塞进返回｜验证：node --check + scripts/test-recall-view-wire.mjs + scripts/test-recall-view.mjs｜可改：可改；full 档别真的塞全文，默认档别改 items 结构
// 鱼神双子星 · M1：派活、收话、取证据、下结论。
// 逻辑已挪进 core/dispatch.js；这里只做 DSH 接线：注册工具、通知总台。

import { createDshAdapter } from '../adapters/dsh.js'
import { reviewWaitingTask, verifyTaskEvidence } from '../core/dispatch.js'
import { readAll, clip, noteReply as coreNoteReply, verifyEvidence } from '../core/jobs.js'
import { dispatch as coreDispatch, verdict as coreVerdict } from '../core/dispatch.js'
import { award } from '../lib/growth.js'
import { createPatch, listPatches } from '../lib/patch.js'
import { runCommand } from '../lib/exec.js'
import { has } from '../lib/authz.js'
import { shapeRecallView } from '../lib/recall-view.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dataRoot } from '../memory-core/runtime/root.js'
import { selectModelRpc, listSessionsRpc, dshBaseUrl } from '../lib/dsh-rpc.js'

// 2026-10-30：新版宿主要求每个工具声明 output，没声明的（如 dayu_dispatch）直接注册不上。
const toolOutput = {
  schema: { type: 'object', additionalProperties: true },
  render(args, value) {
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  },
}

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
function readRecallView() {
  try {
    const file = path.join(dataRoot(HOME), 'switches.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    const v = String(raw?.recallView || '')
    return ['thrifty', 'balanced', 'full'].includes(v) ? v : 'balanced'
  } catch { return 'balanced' }
}

let notifyReply = null

/** 收话：某条会话回了一句，挂到它的单子上，并通知总台。 */
export function noteDispatchReply(sessionId, text) {
  const hit = coreNoteReply(sessionId, text)
  if (!hit) return
  try {
    notifyReply?.({
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      text: `单子 ${hit.id} 有回话了：\n${clip(text, 1200)}`,
      role: 'fish',
      label: '回话',
      status: 'reply',
      sessionId,
    })
  } catch { /* 总台写不了不影响挂单 */ }
}

// 2026-10-30：新版宿主要求 output 声明 {schema, render}；原来只有 schema，dayu_dispatch 直接注册不上。
const output = {
  schema: { type: 'object', additionalProperties: true },
  render(args, value) {
    return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
  },
}

// 2026-10-30: these 8 tools only went through tools.register, so yushen_tools could not list them.
export const M1_TOOLS = []

/** 给路由/看板用：最近几单。 */
export function listJobs(limit = 20) {
  return readAll().slice(0, Math.max(1, Math.min(200, Number(limit) || 20)))
}

export function applyM1(ctx, { log = () => {}, appendInbox = () => {}, notify } = {}) {
  const host = createDshAdapter(ctx, { log })
  notifyReply = notify || appendInbox

  const tools = (() => { try { return ctx.get?.('tools') ?? ctx.tools } catch { return undefined } })()

  M1_TOOLS.push({
    name: 'dayu_dispatch',
    description: '派活：给某个会话或新开一个会话，投一份简报，等它回话。写清任务和验收标准。',
    parameters: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: '任务是什么，一两句' },
        expect: { type: 'string', description: '怎样算做完（证据要求）' },
        target: { type: 'string', description: '会话 id；不填就自己挑一个空闲的或新开' },
        reviewedId: { type: 'string', description: '复查通过的 waiting 单号；仅 dayu_review_waiting 提供证据后使用' },
        caller: { type: 'string', enum: ['dayu', 'xiaoyu', 'dragon', 'owner'], description: '谁在调用：你自己（dayu/xiaoyu/dragon）还是老板；默认大鱼' },
      },
      required: ['brief'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const brief = String(args?.brief ?? '').trim()
      if (!brief) throw new Error('brief 不能为空')
      if (brief.length > 500) throw new Error('一次最多 500 字')
      const caller = ['dayu', 'xiaoyu', 'dragon', 'owner'].includes(String(args?.caller)) ? String(args.caller) : 'dayu'
      const callerName = { dayu: '大鱼', xiaoyu: '小鱼', dragon: '照微', owner: '老板' }[caller]
      const callerLine = `【调用者】${callerName}${caller === 'owner' ? '' : '（角色，不是老板）'}在调用你。这是她的判断，不是老板直接下的命令；你可以先判断要不要接、要不要反问；不接就说清理由。`
      const task = await coreDispatch(host, {
        brief: `${callerLine}\n\n${brief}`,
        expect: String(args?.expect ?? '').trim(),
        target: String(args?.target ?? '').trim(),
        reviewedId: String(args?.reviewedId ?? '').trim(),
        // 2026-11-01：mandate 要记「谁派的」。原来这里没传 startedBy，于是单子里
        // strength 永远是 inferred、basis 永远是「未记录派活人」——那两个字段等于摆设。
        startedBy: caller === 'owner' ? 'owner' : caller,
      })
      if (task.deduped) {
        return { ...task, notice: `已有相同任务 ${task.id} 在途；已复用该单，不重复派活。先看 dayu_tasks 的回话与证据，核对后再决定是否补充新任务。` }
      }
      if (task.waiting) {
        try { appendInbox({ id: `note-${task.id}`, at: task.createdAt, text: `任务 ${task.id} 与在途任务部分重叠，已登记等待，不会抢先开工。依赖：${task.dependsOn.join('、')}`, role: 'fish', label: '等待冲突', status: 'notice' }) } catch { /* 忽略 */ }
        return task
      }
      try {
        appendInbox({
          id: `note-${task.id}`,
          at: task.createdAt,
          text: `派了一单给「${task.employee}」：${brief}`,
          role: 'fish',
          label: '派活',
          status: 'notice',
          sessionId: task.sessionId,
        })
      } catch { /* 总台写不了就算 */ }
      log(`派活 ${task.id} → ${task.employee}（${task.sessionId}）`)
      return task
    },
  })

  M1_TOOLS.push({
    name: 'dayu_review_waiting',
    description: '前置任务结束后复查 waiting 单：带实际证据选择复用跳过、继续剩余工作或核实不冲突后启动。',
    parameters: { type: 'object', properties: { id: { type: 'string' }, action: { type: 'string', enum: ['skip','continue','start'] }, evidence: { type: 'string' }, note: { type: 'string' } }, required: ['id','action','evidence'], additionalProperties: false },
    output,
    async execute(args) {
      const out = await reviewWaitingTask(args)
      if (out.task.status === 'ready') {
        return { ...out, next: '继续执行请再次调用 dayu_dispatch，并传 reviewedId=该单号；不会自动开工。' }
      }
      if (out.task.status === 'ready-for-review') {
        return { ...out, next: '已确认不冲突；继续执行请再次调用 dayu_dispatch，并传 reviewedId=该单号。' }
      }
      return out
    },
  })

  M1_TOOLS.push({
    name: 'dayu_tasks',
    description: '看派活单：默认最近 10 单，可带 id 查单条；包括 waiting 等待中的冲突任务。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '单号；不填就列最近几单' },
        limit: { type: 'number', description: '列几条，默认 10' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const id = String(args?.id ?? '').trim()
      const list = readAll()
      if (id) {
        const task = list.find((item) => item.id === id)
        if (!task) throw new Error(`没有这单：${id}`)
        return { ok: true, task }
      }
      const limit = Math.max(1, Math.min(50, Number(args?.limit) || 10))
      return { ok: true, tasks: list.slice(0, limit) }
    },
  })

  M1_TOOLS.push({
    name: 'dayu_verify',
    description: '验收取证据：kind=file 读文件（大小/哈希/开头）、grep 搜工作区、check 用 node --check 验语法。带 id（单号）时会把这回取证**绑到那张单子上**——`dayu_verdict pass` 前必须先绑，否则会被拒（"先给此单绑定实际取证结果"）。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['file', 'grep', 'check'], description: '取哪种证据' },
        path: { type: 'string', description: 'file / check 用；绝对路径或相对工作区' },
        pattern: { type: 'string', description: 'grep 用的正则' },
        maxLines: { type: 'number', description: 'file 读多少行，默认 60' },
        id: { type: 'string', description: '单号（job-…）：给了就把这次取证绑到该单，之后才能 pass' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      // 2026-11-03 修：原来只调 verifyEvidence，取证结果从不落到单子上，
      // 于是 verdict(pass) 永远报"先绑定取证"——单子结不掉，后面的等待单全堵着。
      const id = String(args?.id || '').trim()
      if (id) return verifyTaskEvidence(id, args)
      return verifyEvidence(args)
    },
  })

  M1_TOOLS.push({
    name: 'dayu_patch',
    description: '写一个“改我自己”的补丁草案（不落地）。老板在界面上点头后才落；action=propose 写草案，list 看现有。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['propose', 'list'], description: '写草案 / 看列表' },
        title: { type: 'string', description: '这个补丁修什么' },
        note: { type: 'string', description: '为什么改、怎么验证' },
        files: {
          type: 'array',
          description: '要改的文件：path 相对插件根，content 是完整新内容',
          items: {
            type: 'object',
            properties: { path: { type: 'string' }, content: { type: 'string' } },
            required: ['path', 'content'],
          },
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const action = String(args?.action ?? '')
      if (action === 'list') return { ok: true, patches: listPatches(20) }
      if (action !== 'propose') throw new Error('action 只能是 propose / list')
      const patch = createPatch({ title: args?.title, note: args?.note, files: args?.files || [] })
      try {
        appendInbox({
          id: `patch-${patch.id}`,
          at: patch.at,
          text: `写了一个补丁草案「${patch.title}」，等你点头才落：${patch.id}`,
          role: 'fish',
          label: '补丁',
          status: 'notice',
        })
      } catch { /* 忽略 */ }
      log(`补丁草稿 ${patch.id}：${patch.title}`)
      return { ok: true, patch }
    },
  })

  M1_TOOLS.push({
    name: 'dayu_exec',
    description: '执行层：软件自己的三个目录（工作区/.dsh/deepseekTools）里读写直接来；写到外面或动系统（注册表/服务/系统目录/开关机/杀进程）要先申请权限，老板批一次跑一次。每次记账。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '一条命令（不许管道/重定向）' },
        confirm: { type: 'string', description: '写/危险操作传「老板点头」' },
        approvalId: { type: 'string', description: '系统级动作：老板批准后的申请号' },
        reason: { type: 'string', description: '为什么需要这条系统权限' },
      },
      required: ['command'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      if (!has('exec.run')) throw new Error('没开这个能力：exec.run')
      const result = await runCommand(args?.command, { confirm: args?.confirm, approvalId: args?.approvalId, reason: args?.reason })
      if (result?.needsApproval) {
        try {
          appendInbox({
            id: `perm-${result.approval.id}`,
            at: result.approval.at,
            text: `【要系统权限】${result.approval.command}（申请号 ${result.approval.id}）\n原因：${result.approval.reason || '没写'}；同意请去全知页「待批权限」。`,
            role: 'fish',
            label: '权限',
            status: 'notice',
          })
        } catch { /* 忽略 */ }
        // 老板说过可以发到 QQ：配了 webhook 就尽力发一条。
        try {
          if (process.env.YUSHEN_QQ_WEBHOOK) {
            fetch(process.env.YUSHEN_QQ_WEBHOOK, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: `鱼神申请系统权限：${result.approval.command}（${result.approval.id}）` }),
            }).catch(() => {})
          }
        } catch { /* 忽略 */ }
      }
      return result
    },
  })

  M1_TOOLS.push({
    name: 'dayu_model',
    description: '给某条会话换模型（走 DSH 的 session/selectModel，不改配置文件，不用重启）。不填 sessionId 就列出当前会话的模型。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '目标会话；不填就只列' },
        model: { type: 'string', description: '模型名，例如 deepseek-flash' },
        provider: { type: 'string', description: '默认 deepseek-account' },
        reasoningEffort: { type: 'string', description: 'high / medium / low' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args) {
      if (!has('model.switch')) throw new Error('没开这个能力：model.switch')
      if (!dshBaseUrl()) throw new Error('还不知道 DSH 地址（先让宿主收到一次请求）')
      const sessions = await listSessionsRpc().catch(() => [])
      if (!args?.sessionId || !args?.model) return { ok: true, sessions }
      const out = await selectModelRpc({
        sessionId: String(args.sessionId),
        provider: String(args.provider || 'deepseek-account'),
        model: String(args.model),
        reasoningEffort: String(args.reasoningEffort || 'high'),
      })
      return { ok: true, sessionId: args.sessionId, model: args.model, result: out }
    },
  })

  M1_TOOLS.push({
    name: 'dayu_verdict',
    description: '给一单下结论：pass 收工 / reject 打回（note 写清哪对不上）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '单号' },
        verdict: { type: 'string', enum: ['pass', 'reject'], description: '收还是打回' },
        note: { type: 'string', description: '结论依据（证据）' },
      },
      required: ['id', 'verdict'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const id = String(args?.id ?? '').trim()
      const v = String(args?.verdict ?? '')
      if (!['pass', 'reject'].includes(v)) throw new Error('verdict 只能是 pass / reject')
      const out = await coreVerdict(host, { id, verdict: v, note: args?.note })
      try { if (v === 'pass') award('验收通过', 10); else award('打回一单', 2) } catch { /* 经验算不了不影响收工 */ }
      try {
        appendInbox({
          id: `verdict-${id}-${Date.now()}`,
          at: new Date().toISOString(),
          text: `单子 ${id} ${v === 'pass' ? '验收通过' : '打回'}：${String(args?.note || '').slice(0, 120)}`,
          role: 'fish',
          label: '验收',
          status: 'notice',
          sessionId: out.task.sessionId,
        })
      } catch { /* 忽略 */ }
      return out
    },
  // 2026-10-30：统一注册，M1_TOOLS 同时也是 yushen_tools 的目录来源
  })

  // 2026-11-04 老板：「问一句你们就能自己搜到相关的」。
  // 检索器早就有，但一天三百多回合只搜了 8 次——缺的是"该搜了"的那一下。
  // 这个工具只做两件事：①把话里值得翻旧账的词指出来 ②顺手搜一遍把出处摆出来。
  // 不替她答、不改判断；搜不搜、用不用，她自己定。
  M1_TOOLS.push({
    name: 'yushen_recall',
    description: '拿不准就搜：把这句话里值得翻旧账的词抽出来（时间/人名/引号词/问法），顺手在记忆、库、文档、代码里搜一遍，只给出处。给多少可用 viewMode 选（thrifty 省流更少更短 / balanced 默认预览 / full 只标全文入口，不塞正文）。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '她听到的那句话 / 自己想查的问题' },
        limit: { type: 'number', description: '最多几条出处，默认 5' },
        episodeId: { type: 'string', description: '可选：给事件段 id 时，直接展开这段的原文（先搜索拿 id，再展开）' },
        nodeKind: { type: 'string', enum: ['episode', 'card', 'mechanism'], description: '可选：从某个点拉网（配合 nodeId）' },
        nodeId: { type: 'string', description: '可选：事件段/卡片/机制 id；给了它就不用再给 question' },
        depth: { type: 'number', description: '拉几层，默认 2，最多 3' },
        toc: { type: 'boolean', description: '事件段：只给整件事目录和全文入口，不拉邻居' },
        role: { type: 'string', description: '哪个角色；卡片隐私过滤用，默认 dayu' },
        // 2026-11-17：给多少由 chooseRecallView 决定（只影响预览/条数/入口，不改检索本身）。
        viewMode: { type: 'string', enum: ['thrifty', 'balanced', 'full'], description: '可选：给多少。thrifty=省流（更少更短的索引，≤3 条、每条 ≤60 字）/ balanced=默认预览（和原来一样）/ full=允许更全，但只给全文入口、不塞正文' },
        task: { type: 'string', description: '可选：这次要干什么；里面明说「看原文/全文发我」时才给全文入口（仍然只是入口，不塞全文）' },
        explicitFull: { type: 'boolean', description: '可选：用户是不是亲手点了「查看原文」；true 且上下文不紧时 full 档的入口标 granted' },
        contextPct: { type: 'number', description: '可选：上下文已占百分比（0-100，0.86 也认）；超过 85% 一票否决全文入口' },
      },
      required: [],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const nodeId = String(args?.nodeId || '').trim()
      if (nodeId) {
        if (args?.toc) {
          const { buildEventToc } = await import('../lib/event-toc.js')
          const toc = buildEventToc(String(args?.role || 'dayu'), nodeId, { limit: Math.max(1, Math.min(50, Number(args?.limit) || 20)) })
          return { ok: Boolean(toc?.ok), toc, note: '这是整件事目录和全文入口；全文按 fullEntry 展开。' }
        }
        const { expandGraph } = await import('../lib/graph.js')
        const kind = String(args?.nodeKind || 'episode')
        const graph = expandGraph({ kind, id: nodeId, role: String(args?.role || 'dayu'), limit: Math.max(1, Math.min(15, Number(args?.limit) || 5)), depth: Math.max(1, Math.min(3, Number(args?.depth) || 2)) })
        return { ok: true, graph, note: '这是从该点拉出的相关网；要不要继续展开、怎么用，由模型/她判断。' }
      }
      const question = String(args?.question ?? '').trim()
      if (!question) throw new Error('question 不能为空')
      const limit = Math.max(1, Math.min(10, Number(args?.limit) || 5))
      const episodeId = String(args?.episodeId || '').trim()
      if (episodeId) {
        const { expandEpisodeAny, cardsForEpisode } = await import('../memory-core/runtime/episode.js')
        const expanded = expandEpisodeAny(episodeId)
        let cards = []
        try {
          cards = cardsForEpisode(String(expanded?.role || 'dayu'), episodeId, { limit: 5 })
        } catch { /* 卡坏了不影响原文展开 */ }
        return {
          ok: true,
          expanded,
          cards,
          note: cards.length
            ? '这是事件段展开的原文片段和这段产生的卡；怎么用由模型/她判断。'
            : '这是事件段展开的原文片段；这段还没有挂上的卡。',
        }
      }
      const { hintsFor } = await import('../lib/recall-hook.js')
      const { logRecall } = await import('../lib/recall-log.js')
      const { findAnything } = await import('../lib/find.js')
      const hints = hintsFor(question)
      let items = []
      let episodeHits = []
      let mechanismHits = []
      let query = ''
      try {
        query = (hints.keywords[0] || hints.times[0] || question).slice(0, 40)
        const res = findAnything(query, { limit })
        items = (res.items || []).slice(0, limit).map((it) => ({ kind: it.kind || 'file', title: it.title || '', path: it.path || '', snippet: String(it.snippet || '').slice(0, 160), at: it.at || '' }))
        // 新投影/中层/浅层：同一轮能一起命中，命中带 turnId 和出处。
        try {
          const { find: findTurns } = await import('../memory-core/runtime/query.js')
          // 2026-11-20：显式召回（她主动查）才算弱使用；每轮自动联想不算。
          const layerHits = findTurns(query, { limit, recordUse: true }).map((h) => ({
            kind: 'turn', title: `${h.layer} · ${h.turnId}`, path: h.ref || h.turnId, snippet: h.snippet, at: h.at,
          }))
          items = [...layerHits, ...items].slice(0, limit)
        } catch { /* 新查找失败不影响老检索 */ }
        // 事件段目录：先给“那一段时间/那一类事”的入口，细节仍要回 refs。
        try {
          const { findEpisodesAny } = await import('../memory-core/runtime/episode.js')
          const eps = findEpisodesAny(query, { limit: 2 }).map((e) => ({
            kind: 'episode',
            title: `事件段 · ${e.startAt || ''}–${e.endAt || ''}`,
            path: (Array.isArray(e.refs) && e.refs[0]) || '',
            snippet: String(e.label || '').slice(0, 180),
            at: e.startAt || '',
            role: e.role || '',
          }))
          if (eps.length) items = [...eps, ...items].slice(0, limit)
          episodeHits = eps
        } catch { /* 事件段坏了不影响老检索 */ }
        // 机制登记：问“事件段/检索/注入怎么运行”时，直接给机制名、原理、文件和测试。
        try {
          const { searchMechanisms } = await import('../lib/mechanism-registry.js')
          const mechs = searchMechanisms(query, { limit: 2 }).map((m) => ({
            kind: 'mechanism',
            title: `机制 · ${m.name}`,
            path: (Array.isArray(m.files) && m.files[0]) || '',
            snippet: String(m.principle || '').slice(0, 180),
            at: '',
            mechanismId: m.mechanismId,
            files: m.files,
            tests: m.tests,
            status: m.status,
          }))
          if (mechs.length) items = [...mechs, ...items].slice(0, limit)
          mechanismHits = mechs
        } catch { /* 机制表坏了不影响老检索 */ }
      } catch { items = [] }
      // 2026-11-17：给多少由档位决定（thrifty/balanced/full）。只裁剪返回的预览和条数，
      // 不读全文、不改检索本身；默认 balanced，条目结构和以前一模一样。
      const shaped = shapeRecallView({
        mode: String(args?.viewMode ?? '') || readRecallView(),
        task: String(args?.task ?? ''),
        items,
        episodes: episodeHits,
        mechanisms: mechanismHits,
        explicitFull: args?.explicitFull === true,
        contextPct: args?.contextPct,
      })
      // 2026-11-11：顺手把返回的片段记进检索日志（preview）——只有路径的话，事后核对"用没用上"时
      // 根本不知道当时给她看的是哪句话（老账 77 条就是这么全对不上的）。
      // 2026-11-17：记的是**实际给她看的**那几条（省流档会少几条、短一些），不是裁剪前的。
      try { logRecall({ who: '她', why: question.slice(0, 120), query, hits: shaped.items.length, refs: shaped.items.slice(0, 3).map((i) => i.path || i.title), preview: shaped.items.slice(0, 3).map((i) => i.snippet).filter(Boolean), source: 'yushen_recall' }) } catch { /* 记不上不影响搜 */ }
      return {
        ok: true,
        line: hints.line || '这句话里没抽到值得翻旧账的词（要搜就自己给关键词）。',
        keywords: hints.keywords,
        times: hints.times,
        asks: hints.asks,
        query,
        view: shaped.view,
        maxChars: shaped.maxChars,
        why: shaped.why,
        hits: shaped.items.length,
        items: shaped.items,
        episodes: shaped.episodes,
        mechanisms: shaped.mechanisms,
        ...(shaped.fullEntry ? { fullEntry: shaped.fullEntry } : {}),
        note: shaped.items.length ? '这些是出处/事件段/机制目录，不是结论；用不用、怎么写，你自己判断。' : '没搜到；没搜到就说没搜到，别拿印象补。',
      }
    },
  })

  M1_TOOLS.push({
    name: 'yushen_compaction',
    description: '压缩摘要开关：看/设 default（官方）/ memory（记忆完整）/ off（只提醒不自动压）；不自己替换会话。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'set', 'preview', 'run', 'probe'], description: '默认 status；run=走官方 /compact 真压当前会话；probe=看当前 agent 的 compaction 挂在哪' },
        mode: { type: 'string', enum: ['default', 'memory', 'off'] },
      },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const { describeMode, setMode } = await import('../lib/compaction-mode.js')
      const action = String(args?.action || 'status')
      if (action === 'probe') {
        const agent = exec?.agent
        const ctx = agent?.ctx
        const getSvc = (c) => { try { return c?.get?.('compaction') } catch { return null } }
        const engine = getSvc(ctx)
        const loopEngine = getSvc(agent?.loopCtx)
        const scopeEngine = getSvc(agent?.scope?.ctx)
        const candidates = [
          ['ctx', ctx],
          ['loopCtx', agent?.loopCtx],
          ['loopCtx.fiber', agent?.loopCtx?.fiber],
          ['loopCtx.fiber.ctx', agent?.loopCtx?.fiber?.ctx],
          ['scope', agent?.scope],
          ['scope.ctx', agent?.scope?.ctx],
          ['runtimeContext', agent?.runtimeContext],
          ['dispatch', agent?.dispatch],
        ]
        let f = agent?.loopCtx?.fiber
        for (let i = 0; f && i < 6; i += 1, f = f?.parent) {
          candidates.push([`fiber[${i}].ctx`, f?.ctx])
          candidates.push([`fiber[${i}]`, f])
        }
        const seen = candidates.map(([name, c]) => {
          let e = null
          try { e = c?.get?.('compaction') } catch { /* 不能直接点 */ }
          return { name, keys: Object.keys(c || {}), hasCompaction: Boolean(e), hasSummarize: typeof e?.summarize === 'function' }
        })
        return {
          ok: true,
          agentKeys: Object.keys(agent || {}),
          ctxKeys: Object.keys(ctx || {}),
          loopCtxKeys: Object.keys(agent?.loopCtx || {}),
          scopeKeys: Object.keys(agent?.scope || {}),
          scopeCtxKeys: Object.keys(agent?.scope?.ctx || {}),
          hasCompaction: Boolean(engine),
          hasSummarize: typeof engine?.summarize === 'function',
          loopHasCompaction: Boolean(loopEngine),
          scopeHasCompaction: Boolean(scopeEngine),
          engineKeys: Object.keys(engine || {}),
          candidates: seen,
          sessionId: String(agent?.session?.id || ''),
        }
      }
      if (action === 'run') {
        const sid = String(exec?.agent?.session?.id || '')
        if (!sid) return { ok: false, why: '拿不到当前会话 id' }
        let bridge = null
        try {
          const getSvc = (c) => { try { return c?.get?.('compaction') } catch { return null } }
          const engine = getSvc(exec?.agent?.ctx) || getSvc(exec?.agent?.loopCtx) || getSvc(exec?.agent?.scope?.ctx)
          if (engine) {
            const { installCompactionBridge } = await import('../lib/compaction-bridge.js')
            bridge = installCompactionBridge({ ctx: exec.agent.ctx, engine })
          } else bridge = { ok: false, why: 'agent/loop/scope ctx 都没有 compaction' }
        } catch (e) { bridge = { ok: false, why: e?.message || String(e) } }
        const { executeCommandRpc } = await import('../lib/dsh-rpc.js')
        const out = await executeCommandRpc({ sessionId: sid, line: '/compact' })
        return { ok: true, bridge, command: out, ...describeMode() }
      }
      if (action === 'set') {
        const r = setMode(String(args?.mode || ''))
        return { ok: r.ok, ...r, ...describeMode() }
      }
      if (action === 'preview') {
        const { buildMemorySummaryInstruction } = await import('../lib/compaction-summary.js')
        return { ok: true, ...describeMode(), instruction: buildMemorySummaryInstruction(), note: '这是“记忆完整”模式要用的摘要模板；provider 接线后才会真正替换。' }
      }
      return { ok: true, ...describeMode(), note: '开关只影响下一次压缩摘要和自动压缩，不影响已有原文。' }
    },
  })

  M1_TOOLS.push({
    name: 'yushen_summary_check',
    description: '拿一段总结和原文/轮次核对：查漏掉的明确决定、总结里没依据的话、把计划写成完成。只出核对单，不改总结；不确定的放 needs_model。',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '要核对的总结原文' },
        role: { type: 'string', description: '哪个角色（默认 dayu）；用于把“该叫”的核对排队给对应角色' },
        sources: {
          type: 'array',
          description: '原文/轮次数组，每项至少 text；可带 at/turnId/ref',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              at: { type: 'string' },
              turnId: { type: 'string' },
              ref: { type: 'string' },
            },
            required: ['text'],
            additionalProperties: true,
          },
        },
      },
      required: ['summary'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { checkAndGate } = await import('../lib/summary-gate.js')
      const { enqueue } = await import('../lib/summary-pending.js')
      const summary = String(args?.summary || '')
      const sources = Array.isArray(args?.sources) ? args.sources : []
      const role = String(args?.role || 'dayu')
      const gate = checkAndGate(summary, sources)
      const queued = gate.wake ? enqueue(role, gate) : { queued: false, why: '不到唤醒线' }
      return {
        ok: true,
        check: gate.check,
        gate: { wake: gate.wake, reason: gate.reason, dedupeKey: gate.dedupeKey, counts: gate.counts },
        queued,
        note: '这是核对单，不是判决；该叫的已排队等一次唤醒，要不要补总结由模型/她判断。',
      }
    },
  })

  M1_TOOLS.push({
    name: 'yushen_feedback',
    description: '回写一句：这次召回/这条记忆用没用上、结果好不好。给 turnId 或 ref；只追加，不改旧结论。',
    parameters: {
      type: 'object',
      properties: {
        turnId: { type: 'string', description: '哪一轮，例如 session-...#40' },
        ref: { type: 'string', description: '哪条出处/指针' },
        layer: { type: 'string', description: '深层/中层/浅层' },
        used: { type: 'string', description: '用上了/没用上/不确定' },
        outcome: { type: 'string', description: '好/坏/一般' },
        note: { type: 'string', description: '一句为什么' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { recordFeedback } = await import('../memory-core/runtime/feedback.js')
      return recordFeedback(args || {})
    },
  })

  M1_TOOLS.push({
    name: 'yushen_memo',
    description: '现在就想记一张：手动写一张纸（事件/办法/知识/待办/错题/看法/人物），必须带类别和出处；可直接钉顶游。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'event/method/knowledge/task/incident/view/person（或中文）' },
        head: { type: 'string', description: '一句话标题' },
        detail: { type: 'string', description: '摘要/细节' },
        turnId: { type: 'string', description: '出自哪一轮' },
        ref: { type: 'string', description: '出自哪个出处' },
        role: { type: 'string', description: '谁的事；不填 unbound' },
        topic: { type: 'string', description: '话题' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签' },
        pin: { type: 'boolean', description: 'true=直接钉顶游' },
      },
      required: ['head'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { writeManualCard } = await import('../memory-core/runtime/manual.js')
      return writeManualCard(args || {})
    },
  })

  // 2026-11-21：决定簿——老板定过的口径/设计，用她自己的话记一句，下次重复提到时自动摆到眼前。
  M1_TOOLS.push({
    name: 'yushen_define',
    description: '决定簿：记/看长期决定（老板定过的口径、设计、边界）。只记一句话+出处；同文去重。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add'], description: 'list 看最近 / add 记一条' },
        text: { type: 'string', description: '用一句话复述这条决定（add 必填）' },
        quote: { type: 'string', description: '老板原话（可选，便于以后核对）' },
        source: { type: 'string', description: '出自哪次对话/哪份文档（可选）' },
        replaces: { type: 'string', description: '要覆盖哪条旧决定的 id（可选；不填就按“更正/改成”同话题自动判）' },
        limit: { type: 'number', description: 'list 看几条，默认 10' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { addDefinition, readDefinitions } = await import('../lib/definitions.js')
      const action = String(args?.action || '')
      if (action === 'add') {
        return addDefinition({
          text: String(args?.text || ''),
          quote: String(args?.quote || ''),
          source: String(args?.source || ''),
          replaces: String(args?.replaces || ''),
        })
      }
      return { ok: true, items: readDefinitions({ limit: Number(args?.limit) || 10 }) }
    },
  })

  // 2026-11-21：进度视图——在做/卡住/等谁/最近做完，从议程、承诺、派活、worklog 合成一张只读表。
  M1_TOOLS.push({
    name: 'yushen_progress',
    description: '进度视图：在做/卡住/等谁/最近做完（从议程、承诺、派活、worklog 合成）。只读，不改任何账。',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: '最近几天算“做完”，默认 7' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { renderProgress } = await import('../lib/progress.js')
      return { ok: true, text: renderProgress({ days: Number(args?.days) || 7 }) }
    },
  })

  // 2026-11-21：关系簿——谁接住过我、我欠谁什么、哪句话记到现在（和好感分开）。
  M1_TOOLS.push({
    name: 'yushen_relations',
    description: '关系簿：每个人一条（我们关系/接住过我/我欠/记到现在/我怎么看/答应过），只读。',
    parameters: {
      type: 'object',
      properties: {
        who: { type: 'string', description: '只看某个人（可选；不填看全部）' },
        limit: { type: 'number', description: '最多几个人，默认 20' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args, exec) {
      const { relationsBook, renderRelationsBook } = await import('../lib/relations-book.js')
      const sid = String(exec?.agent?.session?.id || '')
      let role = 'dayu'
      try { const { roleForSession } = await import('../memory-core/store.mjs'); role = roleForSession(sid) || 'dayu' } catch { /* 认不出就用 dayu */ }
      const who = String(args?.who || '').trim()
      const limit = Number(args?.limit) || 20
      if (who) return { ok: true, rows: relationsBook(role, { limit }).filter((r) => r.who.includes(who)) }
      return { ok: true, text: renderRelationsBook(role, { limit }) }
    },
  })

  // 2026-11-21：层级摘要——一天一页、一周一页，按规则折，不调模型。
  M1_TOOLS.push({
    name: 'yushen_summary',
    description: '层级摘要：今天/某天的日摘要、最近七天的周摘要（轮→日→周，只读）。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['day', 'week', 'build'], description: 'day 某天 / week 一周 / build 写一份到 summaries/' },
        day: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { daySummary, weekSummary, writeSummary } = await import('../lib/summary-tree.js')
      const day = String(args?.day || '').trim() || new Date().toISOString().slice(0, 10)
      const action = String(args?.action || 'day')
      if (action === 'week') return { ok: true, text: weekSummary({ endDay: day }).text }
      if (action === 'build') { const r = writeSummary(day); return { ok: true, file: r.file, text: r.day.text + '\n' + r.week.text } }
      return { ok: true, text: daySummary(day).text }
    },
  })

  M1_TOOLS.push({
    name: 'yushen_pin',
    description: '把某张纸钉到顶游（必带），或摘下来；只改标记，不复制正文。',
    parameters: {
      type: 'object',
      properties: {
        turnId: { type: 'string', description: '哪一轮' },
        ref: { type: 'string', description: '哪个出处' },
        pin: { type: 'boolean', description: 'true=钉，false=摘' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { pinCard } = await import('../memory-core/runtime/manual.js')
      return pinCard(args || {})
    },
  })

  M1_TOOLS.push({
    name: 'yushen_forget',
    description: '这条不要了：留一块墓碑，不删原文；之后查询/注入会过滤掉它。',
    parameters: {
      type: 'object',
      properties: {
        turnId: { type: 'string', description: '哪一轮' },
        ref: { type: 'string', description: '哪个出处' },
        reason: { type: 'string', description: '为什么不要了' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { markTombstone } = await import('../memory-core/runtime/tombstone.js')
      return markTombstone(args || {})
    },
  })

  M1_TOOLS.push({
    name: 'yushen_merge',
    description: '合并两张重复的纸：留下目标，来源标墓碑，不再被查/注入；不删正文。',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '来源卡 id/turnId/ref' },
        into: { type: 'string', description: '目标卡 id/turnId/ref' },
        reason: { type: 'string', description: '为什么合并' },
      },
      required: ['from', 'into'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const { mergeCards } = await import('../memory-core/runtime/merge.js')
      return mergeCards(args || {})
    },
  })

  M1_TOOLS.push({
    name: 'yushen_cards',
    description: '看后台卡片目录：按类型/游/角色列出浅层纸，或看总数；只读。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'stats'], description: 'list 列表（默认）/ stats 统计' },
        type: { type: 'string', description: '记忆/经验/知识/任务/错题/看法/人物' },
        tier: { type: 'string', description: '顶游/上游/中游/下游/不入流' },
        role: { type: 'string', description: '角色' },
        limit: { type: 'number', description: '最多几条，默认 30' },
      },
      additionalProperties: false,
    },
    output,
    async execute(args) {
      const c = await import('../memory-core/runtime/cards.js')
      if (String(args?.action || 'list') === 'stats') return c.cardStats()
      // 2026-11-15：卡片正文可能带控制字符/孤立代理项（旧数据），会让工具结果不是无损 JSON。
      // 输出前先洗一遍：不改语义，只丢掉 JSON 传不过去的那几个码位。
      const clean = (v) => String(v == null ? '' : v)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
        .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, '$1')
      const items = c.listCards({ type: args?.type || '', tier: args?.tier || '', role: args?.role || '', limit: args?.limit || 30 })
        // 只回稳定字段，别把 _file/_feedback 内部对象丢给工具输出（会 invalid output）
        .map((r) => ({
          id: clean(r.id), kind: clean(r.kind), head: clean(r.head), detail: clean(r.detail),
          tier: clean(r.tier), role: clean(r.role), turnId: clean(r.turnId), sessionId: clean(r.sessionId),
          // 事件段 ↔ 卡：卡上写了 episodeId 就带出来，没写就是空（老卡还没回填）。
          episodeId: clean(r.episodeId),
          mechanismIds: Array.isArray(r.mechanismIds) ? r.mechanismIds.map(clean) : [],
          at: clean(r.at || r.createdAt), tags: Array.isArray(r.tags) ? r.tags.map(clean) : [],
          modality: clean(r.modality), speaker: clean(r.speaker), status: clean(r.status || 'active'),
          validUntil: clean(r.validUntil), authorRole: clean(r.authorRole || r.role),
          visibility: clean(r.visibility || 'role_private'),
          sharedWith: Array.isArray(r.sharedWith) ? r.sharedWith.map(clean) : [],
          pin: r.pin === true, source: clean(r.source),
        }))
      return { items, total: items.length }
    },
  })

  for (const t of M1_TOOLS) tools?.register(t)
}

