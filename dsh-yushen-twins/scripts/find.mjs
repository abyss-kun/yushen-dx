// 统一本地查找：先看账本/代码/文档/记忆；聊天记录默认不扫。
// 用法：ELECTRON_RUN_AS_NODE=1 "<exe>" scripts/find.mjs 小鱼 [--limit=10]
import { findAnything } from '../lib/find.js'

const args = process.argv.slice(2)
const q = args.filter((a) => !a.startsWith('--')).join(' ')
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').slice(8)) || 12
const out = findAnything(q, { limit })
console.log(JSON.stringify(out, null, 2))
