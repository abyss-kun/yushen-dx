// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
/* 标签
 * id: lib-bili-card
 * kind: module
 * summary: B站链接识别 + 只读卡片元数据边界：认 BV 号、拼规范链接；不发布、不互动。
 * tags: B站, 链接识别, 只读
 * created: 2026-11-11 01:05:00
 * changed: 2026-11-11 01:05:00
 * author: 大鱼·主代理（说明第二批）
 * authority: 老板（2026-11-11：说明要有格式）
 * audience: 她、B站相关工具、维护者
 * owner: 框架；B站 内容判断归她
 * mutable: 可改；**只读边界不许破**（不许在这里发/评/赞）
 * usage: extractBiliVideo(text) → {bvid,url} 或 null
 * why: 群里/评论里贴的链接要能认出来，但认出来不等于要去互动
 * result: 一个纯识别函数，零副作用
 */
// B站链接识别与只读卡片元数据边界；不发布、不互动。
export function extractBiliVideo(text) {
  const m = String(text || '').match(/(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]+)|\b(BV[0-9A-Za-z]{6,})\b/i)
  const bvid = m?.[1] || m?.[2]
  return bvid ? { bvid, url: `https://www.bilibili.com/video/${bvid}` } : null
}

export function makeBiliCard({ bvid, url, title = '', owner = '', duration = 0, cover = '', pubdate = '', stat = {} } = {}) {
  if (!/^BV[0-9A-Za-z]{6,}$/.test(String(bvid || ''))) throw new TypeError('非法 B站 BV号')
  return { type: 'bilibili-video', bvid, url: url || `https://www.bilibili.com/video/${bvid}`, title: String(title || ''), owner: String(owner || ''), duration: Number(duration) || 0, cover: String(cover || ''), pubdate: String(pubdate || ''), stat: { view: Number(stat.view) || 0, like: Number(stat.like) || 0, reply: Number(stat.reply) || 0 } }
}
