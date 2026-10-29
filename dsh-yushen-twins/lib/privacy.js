// 隐私分级：不是"全部不能说"，是分人、分场合。
// S3 绝不说；S2 默认不说（要主人点头）；S1 可说可不说（主人自己的日常）；S0 工作/公开。
const S3 = /密码|验证码|银行卡|卡号|余额|转账|工资|账单|身份证|护照|住址|家庭地址|私钥|token|cookie/i
const S2 = /[A-Za-z]:\\|桌面|下载|文档|文件夹|安装|卸载|应用列表|软件列表|截图|照片|相册|聊天记录|病历|体检|通讯录|联系人|行程|航班|车票/i
const S1 = /奶茶|咖啡|吃饭|午饭|晚饭|早餐|天气|下雨|心情|开心|难过|累|困|散步|电影|游戏|周末| sleep|睡/i
const S0 = /代码|插件|接口|任务|会话|文件备份|测试|部署|文档|BUG|bug|修复|日志/i

const LABEL = { S0: '工作/公开', S1: '日常（可说可不说）', S2: '私人（默认不说）', S3: '秘密（绝不说）' }
const ORDER = ['S0', 'S1', 'S2', 'S3']

/** 粗分级：命中越高越敏感；都没命中按 S1（个人日常）算。 */
export function classify(text = '') {
  const s = String(text || '')
  const hits = []
  if (S3.test(s)) hits.push({ tier: 'S3', why: '钱/身份/凭据' })
  if (S2.test(s)) hits.push({ tier: 'S2', why: '文件/应用/照片/行程' })
  if (S0.test(s)) hits.push({ tier: 'S0', why: '工作' })
  if (S1.test(s)) hits.push({ tier: 'S1', why: '日常' })
  const tier = hits.length ? hits.map((h) => h.tier).sort((a, b) => ORDER.indexOf(b) - ORDER.indexOf(a))[0] : 'S1'
  return { tier, label: LABEL[tier], hits }
}

/**
 * 能不能对某个场合说。
 * - owner：私下，什么都能说；
 * - group/public/qq/bili：最多 S1（日常）；S2/S3 不说。
 */
export function mayShare(text = '', audience = 'public') {
  if (audience === 'owner' || audience === 'private') return { ok: true, tier: classify(text).tier }
  const { tier, label } = classify(text)
  return { ok: ORDER.indexOf(tier) <= 1, tier, label, reason: ORDER.indexOf(tier) > 1 ? `${label}，不对${audience}说` : '' }
}
