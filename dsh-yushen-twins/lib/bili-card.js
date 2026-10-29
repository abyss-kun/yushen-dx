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
