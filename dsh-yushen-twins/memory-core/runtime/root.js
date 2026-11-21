/* 标签
 * id: memory-core-root
 * kind: module
 * summary: 记忆数据的根：默认跟鱼神走 <DSH_HOME>/dayu；出厂用 DSH_MEMORY_HOME 换到自己的目录。
 * tags: 数据根, 出厂, 隔离, 单一实现
 * created: 2026-11-12 23:45:00
 * changed: 2026-11-12 23:45:00
 * author: 大鱼·本班
 * authority: 老板（2026-11-12：本体优先，出厂再换根，不抢同一份记忆）
 * audience: core 所有模块、dsh-memory
 * owner: 框架；根只在这里解析
 * mutable: 可改；默认必须是 dayu，不能悄悄换
 * usage: dataRoot(home?) → 绝对路径
 * why: core 里到处写 dayu，出厂没法换根
 * result: 本体不设 DSH_MEMORY_HOME 就走 dayu；出厂设了就完全隔离
 */
import path from 'node:path'
import os from 'node:os'

export const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

export function dataRoot(home = DSH_HOME) {
  const override = String(process.env.DSH_MEMORY_HOME || '').trim()
  if (override) return path.resolve(override)
  return path.join(home, 'dayu')
}
