/* 标签
 * id: lib-offline-guard
 * kind: module
 * summary: 离线脚本的硬超时：到点自己退，不等人杀，也不写半截。
 * tags: 离线, 防占进程, 硬超时, 崩溃安全
 * created: 2026-11-04 16:25:00
 * changed: 2026-11-11 00:47:31
 * author: 照微·工作台
 * authority: 老板（2026-11-04：本地进程不能占着进程导致宿主无法修复）
 * why: 后台脚本一旦卡死（网络、磁盘、大目录），会成为"占着不放"的僵尸，宿主修复时还得先杀它
 * result: 每个离线脚本一进来就挂一个硬超时：到点自己退出，绝不无限期占着
 * mutable: 可改
 * audience: 框架（离线脚本第一行）、维护
 * owner: 框架；硬超时只许收紧
 * defaults: 建议 10 分钟；脚本都有日期护栏，退了下一轮再来
 * usage: hardTimeout(分钟,"这轮干什么") —— 到点自己退，等人杀不如自己走
 * off: 不调 hardTimeout 就没有硬超时（不建议）
 */
// 用法（脚本第一行之后调用）：
//   import { hardTimeout } from '../lib/offline-guard.js'
//   hardTimeout(10, '记忆清理')   // 10 分钟没干完就自己退
//
// 为什么是"自己退"而不是"等人杀"：
//   ① 宿主崩溃/关掉以后没人来管它 → 必须自己会走；
//   ② 强退前不写半截：我们的写入都是 tmp + rename，退在中间不会留下半个文件；
//   ③ 退了也只是这轮没干完，下一轮再来（脚本都有日期护栏，不会重复干重活）。
export function hardTimeout(minutes = 10, label = '离线脚本') {
  const ms = Math.max(1, Number(minutes) || 10) * 60 * 1000
  const timer = setTimeout(() => {
    try { console.error(`${label}：超过 ${Math.round(ms / 60000)} 分钟没干完，自己退出（不占着进程）`) } catch { /* 输出失败也要退 */ }
    process.exit(0)
  }, ms)
  if (typeof timer.unref === 'function') timer.unref()
  return timer
}
