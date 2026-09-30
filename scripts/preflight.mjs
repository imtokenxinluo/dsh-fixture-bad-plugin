// 加载预检：在把插件放进 profile 之前，先证明它**能被加载并挂载**。
//
// 这是 2026-09-19 事故换来的闸门：当时夹具 `import` 了 @deepseek-ai/dsh-tools，
// 但目录里没有 node_modules；pnpm 的 link: 让 Node 按真实路径解析 → 找不到 →
// ERR_MODULE_NOT_FOUND → **整个插件树起不来**。
// 离线"扫源码 ok"挡不住这种事 —— 必须真的**加载一次**。
//
// 检查三件事：
//   1) 按包名 import（模拟 DSH 的加载方式）
//   2) 默认导出是 { name, apply } 形状
//   3) 用假 ctx 调一次 apply，确认不抛异常、且注册行为发生
//
// 用法：node scripts/preflight.mjs <包目录>       （默认当前目录）

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const dir = process.argv[2] ?? process.cwd()
const pkgPath = join(dir, 'package.json')

let pkg
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
} catch (e) {
  console.error(`✗ 读不到 package.json：${e.message}`)
  process.exit(2)
}

const name = pkg.name
if (!name) {
  console.error('✗ package.json 缺少 name（DSH 按包名加载）')
  process.exit(2)
}

const problems = []

// ── 1) 按文件路径 import（等价于按真实路径解析，正是 link: 的解析方式）
const entry = pkg.exports?.['.']?.default ?? pkg.main ?? 'index.js'
const entryAbs = join(dir, entry)
let mod
try {
  mod = await import(pathToFileURL(entryAbs).href)
} catch (error) {
  problems.push(`import 失败：${String(error?.message ?? error)}`)
}

// ── 2) 默认导出形状
let plugin = null
if (mod) {
  plugin = mod.default ?? mod
  if (typeof plugin === 'function') {
    plugin = { name, apply: plugin }
  }
  if (!plugin || typeof plugin.apply !== 'function') {
    problems.push('默认导出不是 cordis 插件（缺少 apply 函数）')
  }
}

// ── 3) 用假 ctx 真的挂载一次
if (plugin && typeof plugin.apply === 'function') {
  const registered = []
  const warns = []
  const fakeCtx = {
    logger: {
      warn: (m) => warns.push(String(m)),
      info: (m) => warns.push(String(m)),
      error: (m) => warns.push(String(m))
    },
    tools: { register: (d) => { registered.push(d); return () => {}; } },
    on: () => () => {},
    effect: () => () => {},
    get: () => undefined,
    inject: (deps, cb) => cb({ tools: { register: (d) => { registered.push(d); return () => {}; } } })
  }
  try {
    plugin.apply(fakeCtx, {})
  } catch (error) {
    problems.push(`apply 抛异常：${String(error?.message ?? error)}`)
  }
  if (warns.some((w) => /失败|error/i.test(w))) {
    problems.push(`apply 内部报错：${warns.filter((w) => /失败|error/i.test(w)).join(' | ')}`)
  }
  if (registered.length === 0) {
    problems.push('apply 没有注册任何工具（夹具的用途就是注册违规工具）')
  }
  console.log(`  已注册工具：${registered.map((d) => d.name).join(', ') || '(无)'}`)
}

// ── 结论
console.log(`预检对象：${name}  (${dir})`)
if (problems.length) {
  console.error('✗ 预检失败 —— 不要装进 profile（会让插件树起不来）：')
  for (const p of problems) console.error('   - ' + p)
  process.exit(1)
}
console.log('✓ 预检通过：能被加载、形状正确、apply 可执行')
