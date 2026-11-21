// Copyright (c) 2026 从零开始 · 鱼神双子星 · AGPL-3.0-or-later（保留本行）
// 改｜2026-11-03 01:52｜大鱼·子会话（工作台；父会话 c82f4345 委派）｜授权：老板（本次任务书：语义检索第一档）｜scripts/test-query-rewrite.mjs:1-242｜新增：查询改写（归一/剥问句/同义变体/上限/纯函数）的行为测试｜为什么：这一档要零成本接进召回，接之前得证明它不丢实词、不炸上限、不改入参、不碰网络｜验证：& $node scripts/test-query-rewrite.mjs → 22/22 组通过、退出 0；测试前后比对 lib/aliases.json 原文一致（只读）｜可改：可改（只许加断言，不许放宽）
//
// 语义检索第一档 · 查询改写测试。
// 用法：& $node scripts/test-query-rewrite.mjs
//
// 只读真实 lib/aliases.json（测试后比对原文，证明没被改）；不写任何文件、不建临时家、不跑 reindex。
// 断言分组：别名组 / 双向 / 传递 / 归一 / 剥问句 / 无实词丢失 / 上限 / 空与超长 / 纯函数 / 命中重排 / 不联网。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALIAS_FILE = path.join(ROOT, 'lib', 'aliases.json')
const SRC_FILE = path.join(ROOT, 'lib', 'query-rewrite.js')
const url = (rel) => pathToFileURL(path.join(ROOT, rel)).href

const {
  LIMITS, ALIAS_PATCH, normalize, stripQuestion,
  toGroups, mergeAliasTables, loadAliases, rewrite, expandHits,
} = await import(url('lib/query-rewrite.js'))

let passed = 0
const failures = []
const check = (name, fn) => {
  try {
    fn()
    passed += 1
    console.log(`✓ ${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.error(`✗ ${name}\n  ${error?.message || error}`)
  }
}
const clone = (x) => JSON.parse(JSON.stringify(x))

// ── 0. 真实别名表只读：先取原文，跑完再比 ─────────────────────────────
const aliasRawBefore = fs.readFileSync(ALIAS_FILE, 'utf8')
const aliases = loadAliases()
const groups = toGroups(aliases)

check('别名组：真实表 + 补丁 ≥20 组（数据驱动不封顶，单字已滤掉）', () => {
  assert.ok(groups.length >= 20, `组数 ${groups.length} 少于 20——别名表被清过？`)
  assert.ok(groups.length <= 300, `组数 ${groups.length} 太多——同义词该合并了`)
  assert.ok(groups.every((g) => Array.isArray(g) && g.length >= 2), '存在少于 2 个词的组')
  assert.ok(groups.every((g) => g.every((t) => t.length >= LIMITS.minTermChars)), '组里混进了单字')
  const cover = groups.find((g) => g.includes('封面') && g.includes('封面图'))
  assert.ok(cover, '真实表里的封面组没读到')
  assert.ok(cover.includes('图片') && cover.includes('那张图'), `封面组不完整：${cover.join('/')}`)
  const fix = groups.find((g) => g.includes('修复助手') && g.includes('repair-helper'))
  assert.ok(fix, '补丁表里的修复助手组没并进来')
})

check('双向：只当值出现过的「图片」也能扩回「封面」', () => {
  const plan = rewrite('图片在哪', { aliases })
  assert.equal(plan.stem, '图片')
  assert.ok(plan.variants.includes('封面'), `没扩出封面：${plan.variants.join('/')}`)
  assert.ok(plan.variants.includes('封面图'), '没扩出封面图')
  assert.ok(plan.variants.includes('那张图'), '没扩出那张图')
})

check('传递：大话 → 承诺 → 答应/诺言（跨行连通）', () => {
  const plan = rewrite('大话', { aliases })
  for (const w of ['承诺', '答应', '诺言']) {
    assert.ok(plan.variants.includes(w), `大话没扩出「${w}」：${plan.variants.join('/')}`)
  }
})

check('默认别名：不传 aliases 也能用真实表 + 补丁', () => {
  const real = rewrite('图片在哪')
  assert.ok(real.variants.includes('封面'), '默认没读到真实表')
  const patch = rewrite('repair-helper 装哪了')
  assert.ok(patch.variants.some((v) => v.includes('修复助手')), `默认补丁没生效：${patch.variants.join('/')}`)
})

check('合并别名表：同键拼接去重，备注键（_）跳过', () => {
  const merged = mergeAliasTables({ A: ['B'] }, { A: ['C', 'B'], _说明: ['不算'] })
  assert.deepEqual(merged.A.sort(), ['A', 'B', 'C'])
  assert.equal(merged._说明, undefined)
})

// ── 1. 归一 ────────────────────────────────────────────────────────
check('归一：全角转半角 / 大小写 / 空白折叠（幂等）', () => {
  assert.equal(normalize('  ＧｉｔＨｕｂ　　仓库  '), 'github 仓库')
  assert.equal(normalize('  多个   空格\n换行\t制表 '), '多个 空格 换行 制表')
  assert.equal(normalize(normalize('ＧｉｔＨｕｂ')), normalize('ＧｉｔＨｕｂ'))
  const plan = rewrite('  ＧｉｔＨｕｂ　　仓库  ')
  assert.equal(plan.stem, 'github 仓库')
})

// ── 2. 剥问句（只剥标记，不剥实词）────────────────────────────────
check('问句：尾巴语气词 + 句末标点', () => {
  const plan = rewrite('还记得那张图呢？', { aliases })
  assert.equal(plan.stem, '还记得那张图')
  assert.ok(plan.normalized.startsWith('还记得那张图'), '归一后的原句被改了')
  const kinds = plan.removed.map((x) => x.kind)
  assert.ok(kinds.includes('punct') && kinds.includes('particle'), `剥除记录不对：${JSON.stringify(plan.removed)}`)
  assert.deepEqual(plan.removed.map((x) => x.text).sort(), ['?', '呢'].sort())
})

check('问句：句中「是不是」剥掉，实词顺序不变', () => {
  assert.equal(rewrite('封面是不是改了两栏？').stem, '封面改了两栏')
  assert.equal(rewrite('备份是不是又失败了').stem, '备份又失败')
})

check('问句：前缀「请问」+ 尾巴「在哪」', () => {
  assert.equal(rewrite('请问 GitHub 仓库在哪').stem, 'github 仓库')
  assert.equal(rewrite('为什么备份老是失败呢').stem, '备份老是失败')
  assert.equal(rewrite('备份怎么恢复').stem, '备份恢复')
})

check('问句守卫：剥完没内容就不剥（目的 / 好的 / 怎么回事）', () => {
  assert.equal(rewrite('目的').stem, '目的', '「目的」被剥成了「目」')
  assert.equal(rewrite('好的').stem, '好的', '「好的」被剥成了「好」')
  assert.equal(rewrite('怎么回事').stem, '怎么回事', '「怎么回事」被剥成了「回事」')
  assert.equal(rewrite('为什么？').stem, '为什么', '整句都是问句词时不该归零')
})

// ── 3. 无实词丢失 ───────────────────────────────────────────────────
check('无实词丢失：5 组真实问句的实词都还在', () => {
  const cases = [
    ['还记得那张图吗？', ['张图']],
    ['为什么备份老是失败呢', ['备份', '失败']],
    ['请问 GitHub 仓库在哪', ['github', '仓库']],
    ['备份是不是又失败了', ['备份', '失败']],
    ['快照还在吗', ['快照']],
  ]
  for (const [query, cores] of cases) {
    const plan = rewrite(query, { aliases })
    assert.equal(plan.stem, stripQuestion(query), `${query}：stem 和 stripQuestion 不一致`)
    for (const core of cores) assert.ok(plan.stem.includes(core), `${query}：stem 丢了实词「${core}」→ ${plan.stem}`)
    for (const detail of plan.details) {
      const text = detail.text
      assert.ok(text.length > 0, `${query}：出现空变体`)
      assert.ok(text.length <= LIMITS.maxInputChars, `${query}：变体超长 ${text.length}`)
      for (const core of cores) {
        const kept = text.includes(core)
        const swapped = detail.from && detail.from.includes(core) && text.includes(detail.to)
        assert.ok(kept || swapped, `${query}：变体「${text}」丢了实词「${core}」（from=${detail.from || '-'}）`)
      }
    }
  }
})

// ── 4. 上限保护 ─────────────────────────────────────────────────────
const EXPLODE = { 备份: ['快照', '存档', '副本', '镜像', 'backup', '备份档'] }

check(`上限：变体最多 ${LIMITS.maxVariants} 条（同义组再大也不炸）`, () => {
  const plan = rewrite('备份', { aliases: EXPLODE })
  assert.ok(plan.variants.length >= 2 && plan.variants.length <= LIMITS.maxVariants, `变体 ${plan.variants.length} 条`)
  assert.equal(new Set(plan.variants).size, plan.variants.length, '变体有重复')
  assert.ok(plan.details.some((d) => d.kind === 'synonym'), '没有产生同义变体')
})

check(`上限：总字符 ≤ ${LIMITS.maxTotalChars}，超了就停并写 notes`, () => {
  const long = '备份'.repeat(95) // 190 字，贴近单条上限
  const plan = rewrite(long, { aliases: EXPLODE })
  const total = plan.variants.reduce((n, v) => n + v.length, 0)
  assert.ok(total <= LIMITS.maxTotalChars, `总字符 ${total} 超了 ${LIMITS.maxTotalChars}`)
  assert.ok(plan.variants.length < LIMITS.maxVariants, `190 字的变体不该塞满 5 条：${plan.variants.length}`)
  assert.ok(plan.notes.some((n) => n.includes('上限')), `没记 notes：${plan.notes.join('/')}`)
})

check('上限：超长查询头尾截断、不炸、不丢句尾实词', () => {
  const huge = `${'为什么'.repeat(400)}备份到底怎么恢复`
  const plan = rewrite(huge)
  assert.equal(plan.truncated, true, '没标 truncated')
  assert.ok(plan.normalized.length <= LIMITS.maxInputChars, `归一后 ${plan.normalized.length} 字，超上限`)
  assert.ok(plan.stem.includes('备份'), `句尾实词被截掉了：${plan.stem}`)
  assert.ok(plan.variants.length <= LIMITS.maxVariants)
  assert.ok(plan.variants.reduce((n, v) => n + v.length, 0) <= LIMITS.maxTotalChars)
})

// ── 5. 空查询 / 坏数据 ─────────────────────────────────────────────
check('空查询：不炸、不出变体', () => {
  for (const q of ['', '   ', '\n\t', null, undefined, 0, ['x'], {}]) {
    const plan = rewrite(q)
    assert.equal(plan.empty, true, `空查询没标 empty：${String(q)}`)
    assert.deepEqual(plan.variants, [], `空查询出了变体：${String(q)}`)
    assert.deepEqual(plan.keywords, [])
  }
  const punct = rewrite('？？？！')
  assert.equal(punct.empty, true, '纯标点应算空查询')
  assert.deepEqual(punct.variants, [])
})

check('坏别名数据：跳过、不抛错、单字组丢弃', () => {
  for (const bad of [null, 'x', 42, [null, 'x', ['a'], ['', ''], ['单', '字']], { _备注: ['x'], 坏: '不是数组' }]) {
    assert.deepEqual(toGroups(bad), [])
  }
  assert.deepEqual(toGroups([['甲方', '乙方']]), [['甲方', '乙方']])
  assert.deepEqual(toGroups({ 好: ['好用', '好用'] }), [], '单字 + 重复词不该成组')
})

// ── 6. 纯函数：不改入参、可重复 ───────────────────────────────────
check('纯函数：rewrite 不改别名表，两次结果一致', () => {
  const frozen = clone(aliases)
  for (const list of Object.values(frozen)) if (Array.isArray(list)) Object.freeze(list)
  Object.freeze(frozen)
  const before = JSON.stringify(frozen)
  const a = rewrite('还记得那张封面图吗？', { aliases: frozen })
  const b = rewrite('还记得那张封面图吗？', { aliases: frozen })
  assert.deepEqual(a, b, '两次结果不一致')
  assert.equal(JSON.stringify(frozen), before, '入参别名表被改了')
})

check('纯函数：expandHits 不改命中数组和命中对象', () => {
  const hits = [
    { id: 'a', text: '封面改成了两栏', s: 2 },
    { id: 'b', text: '今天天气不错', s: 0 },
    { id: 'c', text: '图片放在附件里', s: 1 },
    { id: 'd', text: '那张图还没换', s: 0 },
  ]
  const snapshot = JSON.stringify(hits)
  for (const h of hits) Object.freeze(h)
  Object.freeze(hits)
  const plan = rewrite('那张图', { aliases })
  const out = expandHits(hits, plan)
  assert.equal(JSON.stringify(hits), snapshot, '命中入参被改了')
  assert.notEqual(out, hits, '返回了同一个数组')
  assert.ok(out.every((h) => !hits.includes(h)), '返回了同一个对象')
  assert.deepEqual(out.map((h) => h.id), ['a', 'c', 'd'], `排序/过滤不对：${out.map((h) => h.id).join(',')}`)
  assert.ok(out[0].score >= 2 && out[0].variantScore >= 1)
  assert.ok(out[0].variantHits.some((x) => x.variant === '封面'), '没标出命中「封面」变体')
  for (const h of out) {
    assert.equal(typeof h.baseS, 'number')
    assert.ok(h.score >= h.baseS)
    assert.ok(h.variantHits.length >= 1)
  }
  const again = expandHits(hits, plan.variants)
  assert.deepEqual(again.map((h) => [h.id, h.score]), out.map((h) => [h.id, h.score]), '传数组和传 rewrite 结果不一致')
  assert.equal(expandHits(hits, plan, { limit: 1 }).length, 1, 'limit 没生效')
})

// ── 7. 杂项契约 ───────────────────────────────────────────────────
check('变体去重：同一句里的重叠写法只出一次', () => {
  const plan = rewrite('封面 封面图', { aliases })
  assert.equal(new Set(plan.variants).size, plan.variants.length)
})

check('返回结构：字段齐、关键词不跨变体乱切', () => {
  const plan = rewrite('图片在哪', { aliases })
  for (const k of ['ok', 'empty', 'original', 'normalized', 'stem', 'variants', 'details', 'keywords', 'removed', 'aliasHits', 'truncated', 'notes']) {
    assert.ok(k in plan, `缺字段 ${k}`)
  }
  assert.ok(plan.keywords.includes('封面'), `关键词里没有封面：${plan.keywords.join('/')}`)
  assert.ok(plan.keywords.length <= LIMITS.maxKeywords)
  assert.equal(new Set(plan.keywords).size, plan.keywords.length)
  assert.ok(plan.aliasHits.some((h) => h.from === '图片' && h.to === '封面'), `aliasHits 没记下替换：${JSON.stringify(plan.aliasHits)}`)
})

check('不联网 / 不调模型：源码里没有 fetch 和网络模块', () => {
  const src = fs.readFileSync(SRC_FILE, 'utf8')
  assert.ok(!/\bfetch\s*\(/.test(src), '源码里出现 fetch(')
  assert.ok(!/from\s+['"](?:node:)?(?:https?|net|tls|dns)['"]/.test(src), '源码 import 了网络模块')
  assert.ok(!/openai|deepseek|anthropic|api[_-]?key/i.test(src), '源码里出现模型/密钥')
})

check('真实别名表：跑完还是原样（只读）', () => {
  assert.equal(fs.readFileSync(ALIAS_FILE, 'utf8'), aliasRawBefore, 'lib/aliases.json 被改了')
  assert.ok(Object.isFrozen(ALIAS_PATCH), 'ALIAS_PATCH 没冻结')
})

// ── 汇总 ───────────────────────────────────────────────────────────
console.log(`\n别名组 ${groups.length} 组（合并补丁 ${Object.keys(ALIAS_PATCH).length} 组）；断言 ${passed}/${passed + failures.length} 组通过`)
if (failures.length) {
  console.error(`失败 ${failures.length} 组：${failures.map((f) => f.name).join('；')}`)
  process.exit(1)
}
console.log('全部通过。')
