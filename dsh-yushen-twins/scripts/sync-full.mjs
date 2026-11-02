// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 全量导出 / 全量重建的入口。真代码在 sync/full.mjs（方案 v1 §6：兜底比增量更重要）。
// 用法：
//   node scripts/sync-full.mjs export --all --out 备份.jsonl
//   node scripts/sync-full.mjs import --replace --file 备份.jsonl [--dry]
import { main } from '../sync/full.mjs'

process.exit(main(process.argv.slice(2)))
