import fs from 'node:fs'
import vm from 'node:vm'

const files = [
  'D:/deepseekTools/dsh-yushen-popup/client.js',
  'D:/DSH/大小鱼/dsh-yushen-twins/client.js',
]
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  try {
    // 按 ESM 模块模式解析（严格模式）
    new vm.SourceTextModule(src)
    console.log('ESM 解析 OK:', f.split('/').pop())
  } catch (e) {
    console.log('ESM 解析失败:', f.split('/').pop())
    console.log('  ', e.message)
    console.log('  stack:', (e.stack || '').split('\n').slice(0, 4).join('\n  '))
  }
}
