/* 标签
 * id: preset-compaction-memory
 * kind: preset-plugin
 * summary: 在 agent preset 内给 compaction 装记忆摘要桥；默认官方，memory 才换，off 停自动。
 * audience: preset-yushen-desk（和 compaction 同一层）
 * owner: 框架；只打补丁，不改工具/角色卡
 * mutable: 可改；不在这里写摘要正文
 * usage: preset 的 plugins 里挂本文件；ctx.get('compaction') 可用时安装
 * off: 不挂这个 plugin 就回到官方摘要
 */
import { installCompactionBridge } from '../lib/compaction-bridge.js'

export async function apply(ctx) {
  try {
    const engine = ctx.get?.('compaction')
    if (!engine) return
    const r = installCompactionBridge({ ctx, engine })
    if (!r?.ok) ctx.logger?.warn?.(`yushen compaction bridge: ${r?.why || 'not installed'}`)
  } catch (e) {
    try { ctx.logger?.warn?.(`yushen compaction bridge: ${e?.message || e}`) } catch { /* 不挡加载 */ }
  }
}
