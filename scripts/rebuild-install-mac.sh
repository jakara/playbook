#!/bin/bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
app_dir="$HOME/Applications"
target_app="$app_dir/Playbook.app"
stamp="$(date +%Y%m%d-%H%M%S)-$$"
package_dir="$repo_dir/release/local-$stamp"
stage_dir=''
backup_app=''

fail() { printf '错误：%s\n' "$*" >&2; exit 1; }
move_app() { node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$1" "$2"; }
bundle_id() { /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$1/Contents/Info.plist"; }
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$backup_app" && -d "$backup_app" && ! -e "$target_app" && ! -L "$target_app" ]]; then
    if move_app "$backup_app" "$target_app"; then
      printf '已恢复原应用：%s\n' "$target_app" >&2
    else
      printf '自动恢复失败，原应用仍在：%s\n' "$backup_app" >&2
    fi
  fi
  if [[ -n "$stage_dir" ]]; then rm -rf "$stage_dir"; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] || fail '请在 Apple Silicon Mac 的原生 arm64 终端运行。'
command -v node >/dev/null || fail '需要先安装 Node.js 22.12 或更高版本。'
command -v npm >/dev/null || fail '没有找到 npm。'
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12))process.exit(1)' || fail '需要 Node.js 22.12 或更高版本。'
[[ ! -L "$app_dir" && ! -L "$target_app" ]] || fail '安装目录或目标应用为符号链接，请先核对路径。'
cd "$repo_dir"

printf '\n[1/5] 安装锁定依赖并检查源码\n'
npm ci
npm run check:examples
npm run test:unit

printf '\n[2/5] 构建并验证批注删除、系统 TTS 和语音开关\n'
npm run electron:install
npm run desktop:build
node scripts/annotation-desktop-smoke.mjs
node scripts/narration-desktop-smoke.mjs

printf '\n[3/5] 重新打包当前工作区\n'
npm run package:mac -- --config.directories.output="$package_dir"
built_app="$package_dir/mac-arm64/Playbook.app"
[[ -x "$built_app/Contents/MacOS/Playbook" ]] || fail '未生成可执行的 Playbook.app。'
[[ "$(bundle_id "$built_app")" == com.playbook.desktop ]] || fail '生成的应用标识不正确。'
[[ -s "$package_dir/Playbook-macos-arm64.dmg" && -s "$package_dir/Playbook-macos-arm64.zip" ]] || fail '缺少本轮 DMG 或 ZIP 安装包。'

printf '\n[4/5] 备份并安装到 %s\n' "$target_app"
while /usr/bin/pgrep -x Playbook >/dev/null; do
  printf '请先在 Playbook 中停止演示并退出应用（⌘Q），再按回车继续：'
  read -r reply || fail "未收到输入；安装包已保存在 $package_dir"
done
[[ ! -L "$app_dir" && ! -L "$target_app" ]] || fail '目标路径已变成符号链接，停止替换。'
mkdir -p "$app_dir"
stage_dir="$(mktemp -d "$app_dir/.playbook-install.XXXXXX")"
/usr/bin/ditto "$built_app" "$stage_dir/Playbook.app"
/usr/bin/diff -qr "$built_app" "$stage_dir/Playbook.app" || fail '应用复制核验失败，原安装未替换。'
if [[ -e "$target_app" ]]; then
  [[ -d "$target_app" && "$(bundle_id "$target_app")" == com.playbook.desktop ]] || fail '目标位置存在其他内容，停止替换。'
  backup_app="$app_dir/Playbook-$stamp.backup.app"
  [[ ! -e "$backup_app" && ! -L "$backup_app" ]] || fail '备份路径已存在。'
  move_app "$target_app" "$backup_app"
fi
move_app "$stage_dir/Playbook.app" "$target_app"

printf '\n[5/5] 启动新安装\n'
printf '安装位置：%s\n安装包目录：%s\n' "$target_app" "$package_dir"
if [[ -n "$backup_app" ]]; then printf '旧应用备份：%s\n' "$backup_app"; fi
/usr/bin/open -n "$target_app"
printf '\n已安装并发出启动请求。请播放实际 Book，检查语音听感与批注删除。\n'
