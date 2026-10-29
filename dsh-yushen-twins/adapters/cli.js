// CLI 适配器：没有 DSH 也能活——投一句话就是打印，工具就是本地函数表。

import { attach, createFileHost } from '../core/host.js'

export function createCliAdapter({ out = console.log } = {}) {
  const tools = new Map()
  const host = createFileHost('cli')
  return {
    ...host,
    async send(key, text) {
      out(`[发给 ${key}] ${String(text)}`)
      return { ok: true, via: 'stdout' }
    },
    registerTool(tool) {
      if (!tool?.name) throw new Error('工具必须有 name')
      tools.set(tool.name, tool)
    },
    onEvent() { /* CLI 没有事件流 */ },
    serve() { /* CLI 没有网页 */ },
    auth() { return true },
    /** CLI 没有真会话：派活落到 stdout，单子照样记。 */
    listSessions() { return [] },
    async createSession() { return { id: `cli-job-${Date.now().toString(36)}`, via: 'cli' } },
    listTools() { return [...tools.keys()] },
    async runTool(name, args) {
      const tool = tools.get(name)
      if (!tool) throw new Error(`没有这个工具：${name}`)
      return tool.execute ? tool.execute(args || {}) : null
    },
  }
}

export function attachCli(opts) {
  const adapter = createCliAdapter(opts)
  attach(adapter)
  return adapter
}
