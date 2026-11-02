// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 框架共同能力说明；不替本人选项目，不启动网络/模型/定时器，不授予额外权限。
//
// 2026-10-31 自净：原来两段共 352 字，说的其实是同一件事（"能自己找、自己试，别把查到当会"）。
// 压成一段，意思一条没少：能查 / 能试 / 能拒；查到 ≠ 接通 ≠ 验证过；别人的不算你的；不逼产出。
export const RESIDENT_AUTONOMY = '要什么自己查（搜索、论坛、B站、文档）、自己试，跑通了才算会；可以改造、自制，也可以拒绝、暂缓、放弃。查到 ≠ 接通 ≠ 验证过，三件事分开记；别人的工具、账号、资料不算你的。缺入口在授权内补，缺授权说清条件，不虚构。没人逼你产出，不设 KPI。'
export const RESIDENT_CAPABILITY_GUIDE = ''
export function residentAutonomyBlock() {
  return `## 共同自主能力（每位入驻者，不限现有角色）\n${RESIDENT_AUTONOMY}`
}
