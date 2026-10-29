// 样板通道：把任何地方接进来，只需要这五个函数。
//
// 这是给"想接自己通道"的人看的（QQ、微信、Telegram、直播弹幕、干脆是命令行）。
// 出厂包**不带任何真通道**，只带这个样板和下面那份契约。

import { attach, createFileHost } from '../core/host.js'

/**
 * 造一个通道。
 * @param {(key: string, text: string) => Promise<{ok: boolean, via?: string}>} deliver
 *        真的把话发出去的函数——这是唯一需要你写的东西
 */
export function createEchoAdapter({ deliver = async () => ({ ok: true, via: 'echo' }), name = 'echo' } = {}) {
  const tools = new Map()
  const base = createFileHost(name)      // read / write 走文件，不用你写
  return {
    ...base,
    name,

    // ① 发话：她要说话时，核心会调这个
    async send(key, text) {
      return deliver(key, String(text))
    },

    // ② 注册工具：她要用某个工具时，核心从这里找
    registerTool(tool) {
      if (!tool?.name) throw new Error('工具必须有 name')
      tools.set(tool.name, tool)
    },

    // ③ 事件：外部有新消息时，核心往这里推（本样板不接事件）
    onEvent(cb) { this._cb = cb },

    // ④ 网页/⑤ 鉴权：可选，不接就留空
    serve() {},
    auth() { return true },

    // 额外可选：会话相关
    listSessions() { return [] },
    async createSession() { return { id: `echo-${Date.now().toString(36)}`, via: name } },
    listTools() { return [...tools.keys()] },
    async runTool(n, args) {
      const t = tools.get(n)
      if (!t) throw new Error(`没有这个工具：${n}`)
      return t.execute ? t.execute(args || {}) : null
    },

    /** 给外面的人用：往里塞一条"收到的话" */
    push(key, text) { this._cb?.({ key, text, at: Date.now() }) },
  }
}

export function attachEcho(opts) {
  const a = createEchoAdapter(opts)
  attach(a)
  return a
}
