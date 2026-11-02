// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 合并 CLI 的入口。真代码在 sync/merge.mjs（方案 v1 §9：新增代码放 sync/ 子包，默认单机不加载）。
// 用法：node scripts/merge.mjs <peer> --role dayu --file <信封的 events.jsonl> [--dry]
import { main } from '../sync/merge.mjs'

process.exit(main(process.argv.slice(2)))
