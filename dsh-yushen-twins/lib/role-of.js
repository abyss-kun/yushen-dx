/* 标签
 * id: lib-role-of
 * kind: module
 * summary: 会话→角色的兼容入口；实现在 memory-core/runtime/role.js。
 * tags: 角色, 会话, 兼容入口, 单一实现
 * created: 2026-11-11 01:00:00
 * changed: 2026-11-13 00:35:49
 * author: 大鱼·本班
 * authority: 老板（2026-11-13：核心一份）
 * audience: refine、检索、记忆
 * owner: 框架；改实现去 memory-core/runtime/role.js
 * mutable: 可改；这里只转发
 * usage: export const X = r.X
 * why: 旧路径不能断；角色解析只有一份
 * result: 老 import 照常，实际逻辑在 core
 */
import * as r from '../memory-core/runtime/role.js'

export const roleForSession = r.roleForSession
export const roleFromRef = r.roleFromRef
export const ROLE_NAME = r.ROLE_NAME
