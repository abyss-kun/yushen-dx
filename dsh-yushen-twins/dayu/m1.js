// 鱼神双子星 · M1：派活、收话、取证据、下结论。
// 逻辑已挪进 core/dispatch.js；这里只做 DSH 接线：注册工具、通知总台。

import { createDshAdapter } from '../adapters/dsh.js'
import { reviewWaitingTask } from '../core/dispatch.js'
import { readAll, clip, noteReply as coreNoteReply, verifyEvidence } from '../core/jobs.js'
import { dispatch as coreDispatch, verdict as coreVerdict } from '../core/dispatch.js'
import { award } from '../lib/growth.js'
import { createPatch, listPatches } from '../lib/patch.js'
import { runCommand } from '../lib/exec.js'
import { has } from '../lib/authz.js'
import { selectModelRpc, listSessionsRpc, dshBaseUrl } from '../lib/dsh-rpc.js'

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

const output = { schema: { type: 'object' } }

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
    description: '验收取证据：kind=file 读文件（大小/哈希/开头）、grep 搜工作区、check 用 node --check 验语法。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['file', 'grep', 'check'], description: '取哪种证据' },
        path: { type: 'string', description: 'file / check 用；绝对路径或相对工作区' },
        pattern: { type: 'string', description: 'grep 用的正则' },
        maxLines: { type: 'number', description: 'file 读多少行，默认 60' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    output,
    async execute(args) {
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

  for (const t of M1_TOOLS) tools?.register(t)
}
