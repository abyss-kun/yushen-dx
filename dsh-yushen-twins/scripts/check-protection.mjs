#!/usr/bin/env node
// 保护套件 · 打包前检查。
// 用法：node check-protection.mjs [插件目录]    退出码 0 = 通过

import fs from 'node:fs'
import path from 'node:path'

const target = process.argv[2] || process.cwd()
const errors = []
const warns = []

function check(ok, message) {
  if (!ok) errors.push(message)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`)
}

for (const name of ['LICENSE', 'COMMERCIAL.md', 'NOTICE', 'THIRD_PARTY.md']) {
  check(fs.existsSync(path.join(target, name)), `文件：${name}`)
}

const pkgFile = path.join(target, 'package.json')
if (!fs.existsSync(pkgFile)) {
  errors.push('缺少 package.json')
} else {
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
  check(pkg.license === 'SEE LICENSE IN LICENSE', 'package.json license = SEE LICENSE IN LICENSE')
  check(typeof pkg.author === 'string' || typeof pkg.author === 'object', 'package.json 有 author')
  if (Array.isArray(pkg.files)) {
    for (const name of ['LICENSE', 'COMMERCIAL.md', 'NOTICE', 'THIRD_PARTY.md']) {
      check(pkg.files.includes(name), `files 白名单包含 ${name}`)
    }
  } else {
    warns.push('package.json 没有 files 白名单，可能把不该发的文件带进包')
  }
}

const plainMail = /[\w.+-]+@[\w-]+\.[\w.]+/
const walk = (dir, depth = 0) => {
  if (depth > 2) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { walk(full, depth + 1); continue }
    if (!/\.(md|txt|js|json|yml|yaml)$/.test(entry.name)) continue
    const text = fs.readFileSync(full, 'utf8')
    if (plainMail.test(text)) warns.push(`明文邮箱：${path.relative(target, full)}`)
    if (entry.name.endsWith('.js') && !text.slice(0, 200).includes('Copyright (c)')) {
      warns.push(`缺版权头：${path.relative(target, full)}`)
    }
  }
}
walk(target)

for (const warn of warns) console.log(`WARN  ${warn}`)
console.log(errors.length ? `\n不通过：${errors.length} 项` : '\n通过')
process.exit(errors.length ? 1 : 0)
