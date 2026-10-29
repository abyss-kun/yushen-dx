// DSH 适配器：把宿主能力映射成 core 的六能力契约。
// 只做接线，不写业务；core 里不许 import 这个文件。

import { attach } from '../core/host.js'
import { read as coreRead, write as coreWrite } from '../core/store.js'
import { promptRpc, createSessionRpc, selectModelRpc, listSessionsRpc, dshBaseUrl } from '../lib/dsh-rpc.js'
import { observeSessionEvent } from '../lib/session-governance.js'

export function createDshAdapter(ctx, { log } = {}) {
  const tools = (() => { try { return ctx.get?.('tools') ?? ctx.tools } catch { return undefined } })()
  const agents = (() => { try { return ctx.get?.('agents') ?? ctx.agents } catch { return undefined } })()

  return {
    name: 'dsh',
    /** 往某条会话投一句话：先走内存句柄，够不着再走 HTTP。 */
    async send(sessionId, text) {
      const handle = agents?.get?.(sessionId)
      if (handle?.agent?.followup) {
        await handle.agent.followup({ content: [{ type: 'text', text: String(text) }], source: { kind: 'user' } })
        return { ok: true, via: 'agent' }
      }
      if (dshBaseUrl()) {
        observeSessionEvent({ sessionId, eventType: 'prompt-sent', stage: 'in-progress', summary: '鱼神通过宿主 RPC 投递消息' })
        await promptRpc({ sessionId, text: String(text) })
        return { ok: true, via: 'rpc' }
      }
      throw new Error(`找不到会话 ${sessionId}，也够不到 HTTP`)
    },
    registerTool(tool) {
      if (!tools?.register) throw new Error('宿主没有 tools 服务')
      tools.register(tool)
    },
    /** 列会话：先读宿主快照，读不到再走 HTTP。 */
    async listSessions() {
      try {
        const sessions = ctx.get?.('sessions') ?? ctx.sessions
        const snap = sessions?.list?.getSnapshot?.()
        if (snap?.items) {
          return snap.items.map((it) => ({
            id: String(it.sessionId || ''),
            title: String(it.projections?.values?.title || ''),
            running: Boolean(it.running),
          }))
        }
      } catch { /* 退到 HTTP */ }
      try { return await listSessionsRpc() } catch { return [] }
    },
    /** 建会话：优先 HTTP RPC（宿主的 agents.create 不认模型参数）。 */
    async createSession({ cwd } = {}) {
      if (dshBaseUrl()) {
        const id = await createSessionRpc({ cwd })
        await selectModelRpc({ sessionId: id })
        return { id, via: 'rpc' }
      }
      if (!agents?.create) throw new Error('既不知道 DSH 地址，宿主也没给 agents 服务')
      const handle = await agents.create({ meta: { cwd }, agentOptions: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' } })
      const id = handle?.sessionId || handle?.id
      if (!id) throw new Error('agents.create 没给会话 id')
      return { id, via: 'agent' }
    },
    onEvent(fn) {
      if (!ctx.on) return
      ctx.on('session/event', (session, event) => { try { fn({ session, event }) } catch { /* 忽略 */ } })
    },
    read(rel) { return coreRead(rel, '') },
    write(rel, text) { coreWrite(rel, text) },
    serve(route, handler) {
      ctx.effect?.(() => ctx.webServer.register({ kind: 'prefix', path: route, handler }))
    },
    auth() { return true },
    log: log || (() => {}),
  }
}

/** 接上 DSH；失败不挡启动。 */
export function attachDsh(ctx, opts) {
  try {
    const adapter = createDshAdapter(ctx, opts)
    attach(adapter)
    return adapter
  } catch { return null }
}
