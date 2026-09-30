// 把测试夹具临时装进 profile（黄灯实机验证用），或把它卸下来。
//
// 为什么要有脚本而不是手改 JSON：上次手改 + 没预检，结果是 DSH 起不来。
// 这个脚本把"改配置"做成可回滚的一步：改前备份 → 改后校验 → 一键还原。
//
// 用法：
//   node scripts/profile-link.mjs --apply     # 装进去
//   node scripts/profile-link.mjs --remove    # 卸下来（也删 node_modules 链接）
//   node scripts/profile-link.mjs             # 只看当前状态

import { readFileSync, writeFileSync, copyFileSync, existsSync, rmdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PROFILE = process.env.DSH_PROFILE_PKG || 'D:/tool/dsh_data/profiles/web/package.json'
const NAME = 'dsh-fixture-bad-plugin'
const LINK = 'link:D:/tool/claude_code/dsh-fixture-bad-plugin'
const PROFILE_DIR = dirname(PROFILE)

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const remove = argv.includes('--remove')

const linkPath = join(PROFILE_DIR, 'node_modules', NAME)
const linkExists = () => existsSync(linkPath)

/**
 * 删链接。⚠️ 必须用 rmdir，**不能**递归删除：
 * 在 Junction 上跑 `rmdir /s` 或 `Remove-Item -Recurse` 会跟进目标目录，
 * 把夹具源码本身删光。
 */
function removeLink() {
  if (!linkExists()) return false
  try {
    rmdirSync(linkPath)
    return true
  } catch (e) {
    console.error(`  ⚠️ 链接删除失败（${e.message}）—— 请手动删除：${linkPath}`)
    return false
  }
}

if (!existsSync(PROFILE)) {
  console.error(`profile 不存在：${PROFILE}`)
  process.exit(2)
}

const data = JSON.parse(readFileSync(PROFILE, 'utf8'))
const deps = data.dependencies || (data.dependencies = {})
const bundles = (data.dsh && data.dsh.profile && data.dsh.profile.bundles) || null
const inDeps = NAME in deps
const inBundles = Array.isArray(bundles) && bundles.includes(NAME)

console.log(`profile: ${PROFILE}`)
console.log(`配置: dependencies ${inDeps ? '有' : '无'} / bundles ${inBundles ? '有' : '无'}`)
console.log(`链接: ${linkExists() ? '在' : '不在'}`)

if (!apply && !remove) {
  console.log('\n预览模式。--apply 装入 / --remove 卸下')
  process.exit(0)
}

if (remove) {
  if (!inDeps && !inBundles && !linkExists()) {
    console.log('\n本来就没装，无需处理 ✓')
    process.exit(0)
  }
  copyFileSync(PROFILE, `${PROFILE}.bak-before-fixture-remove-${stamp()}`)
  delete deps[NAME]
  if (Array.isArray(bundles)) data.dsh.profile.bundles = bundles.filter((b) => b !== NAME)
} else {
  if (!Array.isArray(bundles)) {
    console.error('⛔ dsh.profile.bundles 不是数组 —— 结构不对，不动它')
    process.exit(2)
  }
  copyFileSync(PROFILE, `${PROFILE}.bak-before-fixture-${stamp()}`)
  deps[NAME] = LINK
  if (!inBundles) bundles.push(NAME)
}

writeFileSync(PROFILE, JSON.stringify(data, null, 2), 'utf8')

// 写回后重新读一遍校验
const back = JSON.parse(readFileSync(PROFILE, 'utf8'))
const nowDeps = NAME in (back.dependencies || {})
const nowBundles = back.dsh.profile.bundles.includes(NAME)
if (apply && !(nowDeps && nowBundles)) {
  console.error('⛔ 写入后校验失败，请检查 profile')
  process.exit(1)
}
if (remove && (nowDeps || nowBundles)) {
  console.error('⛔ 卸载后配置里仍存在，请检查 profile')
  process.exit(1)
}

if (remove) {
  const gone = removeLink()
  console.log(gone ? '\n✓ 已卸下（配置 + node_modules 链接）' : '\n✓ 配置已还原（链接本来就不存在）')
  console.log('  下一步：重启 DSH')
} else {
  console.log('\n✓ 已装入配置')
  console.log(`  链接状态：${linkExists() ? '已存在 ✓' : '不存在 —— 见 README 的 pnpm 坑，需手工建 Junction'}`)
  console.log('  下一步：确认链接后重启 DSH')
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
