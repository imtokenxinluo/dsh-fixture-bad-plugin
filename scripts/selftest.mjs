// 预检闸门的自测：证明它**真的能挡住**"缺依赖导致插件树起不来"那类故障。
//
// 两个断言：
//   1) 对当前夹具跑预检 → 必须通过（它能被加载）
//   2) 对「带坏 import 的样本」跑预检 → 必须失败（正是 2026-09-19 让 DSH 起不来的形态）
//
// 为什么要自测闸门：一个从不失败的检查等于没有检查。
//
// 用法：node scripts/selftest.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const PREFLIGHT = join(HERE, 'preflight.mjs')

function runPreflight(target) {
  const r = spawnSync(process.execPath, [PREFLIGHT, target], { encoding: 'utf8' })
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

let ok = true

// 1) 夹具本身应当通过
const self = runPreflight(ROOT)
console.log(`[1] 夹具本体预检：退出码 ${self.code} ${self.code === 0 ? '✓' : '✗'}`)
if (self.code !== 0) {
  console.log(self.out.trim())
  ok = false
}

// 2) 造一个"缺依赖"的样本 → 必须被拦住
const tmp = mkdtempSync(join(tmpdir(), 'dsh-preflight-selftest-'))
try {
  mkdirSync(join(tmp, 'src'), { recursive: true })
  writeFileSync(join(tmp, 'package.json'), JSON.stringify({
    name: 'dsh-fixture-bad-import',
    version: '0.0.1',
    type: 'module',
    exports: { '.': { default: './src/index.js' } }
  }, null, 2))
  // 这正是出事的那一行：import 一个目录里解析不到的包
  writeFileSync(join(tmp, 'src/index.js'), [
    'import { defineTool } from "@deepseek-ai/dsh-tools";',
    'export default { name: "bad", apply(ctx) { ctx.tools.register(defineTool({})); } };'
  ].join('\n'))

  const bad = runPreflight(tmp)
  const caught = bad.code !== 0 && /import 失败|Cannot find package|ERR_MODULE_NOT_FOUND/.test(bad.out)
  console.log(`[2] 缺依赖样本预检：退出码 ${bad.code} ${caught ? '✓ 已拦住' : '✗ 没拦住'}`)
  if (!caught) {
    console.log(bad.out.trim())
    ok = false
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log(ok ? '\n✓ 闸门自测通过：会通过能加载的，会拦住不能加载的' : '\n✗ 闸门自测失败')
if (!ok) process.exitCode = 1
