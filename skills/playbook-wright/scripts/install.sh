#!/bin/bash
# MIT License
#
# Copyright (c) 2026 Playbook contributors
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

# macOS bootstrap. Download a pinned release, verify hashes, preserve existing apps and Skill edits.
set -euo pipefail
REPOSITORY='jakara/playbook'
MODE=''
APP_DIR=''
FRAMEWORK=''
SCOPE=''
PROJECT_ROOT=''
REPLACE=0
TEMP_ROOT=''
APP_STAGE=''
APP_LOCK=''
FOUND_APP=''
TAG="${PLAYBOOK_RELEASE_TAG:-}"
DSH_TARGET_PROFILE=''
DSH_TARGET_DIR=''
DSH_CLI=''
DSH_PLUGIN_VERSION='0.11.1'
DSH_PLUGIN_SPEC="playbook-dsh@$DSH_PLUGIN_VERSION"

fail() { printf 'Playbook: %s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'Usage: bash install.sh --check-app | --ensure-app | --install --framework codex|claude-code|dsh --scope user|project [--project-root /path] [--app-dir /path] [--dsh-profile name] [--replace]'
}
cleanup() {
  [ -z "$APP_STAGE" ] || /bin/rm -rf "$APP_STAGE"
  [ -z "$APP_LOCK" ] || /bin/rmdir "$APP_LOCK" 2>/dev/null || true
  [ -z "$TEMP_ROOT" ] || /bin/rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
while [ "$#" -gt 0 ]; do
  case "$1" in
    --check-app|--ensure-app|--install) [ -z "$MODE" ] || fail '请只选择一种安装动作。'; MODE="$1"; shift ;;
    --framework|--scope|--project-root|--app-dir|--dsh-profile)
      [ "$#" -ge 2 ] && [[ "$2" != --* ]] || fail "$1 缺少值。"
      case "$1" in
        --framework) FRAMEWORK="$2" ;; --scope) SCOPE="$2" ;;
        --project-root) PROJECT_ROOT="$2" ;; --app-dir) APP_DIR="${2%/}" ;;
        --dsh-profile) DSH_TARGET_PROFILE="$2" ;;
      esac
      shift 2 ;;
    --replace) REPLACE=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "未知参数：$1" ;;
  esac
done
[ -n "$MODE" ] || { usage >&2; exit 1; }
if [ "$(uname -s)" != 'Darwin' ] || [ "$(uname -m)" != 'arm64' ]; then
  printf '%s\n' '当前安装包仅支持 Apple Silicon Mac（macOS arm64）。' >&2
  exit 2
fi
if [ -n "$APP_DIR" ]; then [[ "$APP_DIR" = /* ]] || fail '--app-dir 必须是绝对路径。'; fi
if [ "$MODE" = '--install' ]; then
  case "$FRAMEWORK" in codex|claude-code|dsh) ;; *) fail '--framework 请选择 codex、claude-code 或 dsh。' ;; esac
  case "$SCOPE" in
    user) ;;
    project) [[ "$PROJECT_ROOT" = /* ]] && [ -d "$PROJECT_ROOT" ] || fail '--project-root 必须是现有项目的绝对路径。' ;;
    *) fail '--scope 请选择 user 或 project。' ;;
  esac
  if [ -z "$DSH_TARGET_PROFILE" ] && [ "${DSH_SHELL:-}" = '1' ]; then
    DSH_TARGET_PROFILE="${DSH_PROFILE:-}"
    [ -n "$DSH_TARGET_PROFILE" ] || fail '已检测到 DSH Shell，但无法确定当前 profile；请用 --dsh-profile 指定。'
  fi
  if [ -n "$DSH_TARGET_PROFILE" ]; then
    [[ "$DSH_TARGET_PROFILE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || fail 'DSH profile 名称无效。'
    DSH_DATA_HOME="${DSH_HOME:-$HOME/.dsh}"
    [[ "$DSH_DATA_HOME" = /* ]] || fail 'DSH_HOME 必须是绝对路径。'
    DSH_TARGET_DIR="$DSH_DATA_HOME/profiles/$DSH_TARGET_PROFILE"
    if [ "${DSH_SHELL:-}" = '1' ] && [ -n "${DSH_PROFILE_DIR:-}" ]; then
      [ "$DSH_PROFILE_DIR" = "$DSH_TARGET_DIR" ] || fail '当前 DSH profile 目录与 DSH_HOME 不一致，已停止安装。'
    fi
    [ -f "$DSH_TARGET_DIR/package.json" ] || fail "DSH profile 尚未初始化：$DSH_TARGET_DIR"
  fi
  if [ "$FRAMEWORK" = 'dsh' ] && [ -z "$DSH_TARGET_PROFILE" ]; then
    fail '已选择 DSH Skill，但未检测到当前 DSH profile；请用 --dsh-profile 指定。'
  fi
fi

app_version() { /usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$1/Contents/Info.plist" 2>/dev/null; }
valid_app() {
  [ -d "$1" ] && [ ! -L "$1" ] && [ -x "$1/Contents/MacOS/Playbook" ] || return 1
  [ "$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$1/Contents/Info.plist" 2>/dev/null)" = 'com.playbook.desktop' ] || return 1
  local version
  version="$(app_version "$1")" || return 1
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  /usr/bin/awk -F. '{exit !($1 > 0 || ($1 == 0 && $2 >= 6))}' <<< "$version"
}
consider_app() { if [ -z "$FOUND_APP" ] && valid_app "$1"; then FOUND_APP="$1"; fi; }
if [ -n "$APP_DIR" ]; then
  consider_app "$APP_DIR/Playbook.app"
else
  if [ -n "${PLAYBOOK_APP_PATH:-}" ]; then consider_app "$PLAYBOOK_APP_PATH"; fi
  consider_app '/Applications/Playbook.app'
  consider_app "$HOME/Applications/Playbook.app"
  SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  consider_app "$SCRIPT_DIRECTORY/../../../release/mac-arm64/Playbook.app"
fi
if [ "$MODE" = '--check-app' ]; then
  [ -n "$FOUND_APP" ] || { printf '%s\n' '未发现兼容的 Playbook 应用。' >&2; exit 3; }
  printf '%s\n' "$FOUND_APP" "version=$(app_version "$FOUND_APP")"
  exit 0
fi

TEMP_ROOT="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/playbook-install.XXXXXX")"
download() {
  /usr/bin/curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 2 --connect-timeout 20 --max-time 180 --output "$2" "$1"
}
resolve_release() {
  if [ -z "$TAG" ]; then
    download "https://api.github.com/repos/$REPOSITORY/releases/latest" "$TEMP_ROOT/latest.json" || fail '无法查询 GitHub 最新版本。'
    TAG="$(/usr/bin/plutil -extract tag_name raw -o - "$TEMP_ROOT/latest.json")" || fail '无法读取发布版本。'
  fi
  [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail '发布版本必须为 v主版本.次版本.补丁版本。'
  BASE_URL="https://github.com/$REPOSITORY/releases/download/$TAG"
  download "$BASE_URL/SHA256SUMS" "$TEMP_ROOT/SHA256SUMS" || fail '无法下载该版本校验清单。'
}
verified_download() {
  local filename="$1" expected actual
  download "$BASE_URL/$filename" "$TEMP_ROOT/$filename" || fail "下载失败：$filename"
  expected="$(/usr/bin/awk -v wanted="$filename" '$2 == wanted || $2 == "*" wanted {print $1}' "$TEMP_ROOT/SHA256SUMS")"
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || fail "校验清单缺失或包含重复条目：$filename"
  actual="$(/usr/bin/shasum -a 256 "$TEMP_ROOT/$filename" | /usr/bin/awk '{print $1}')"
  [ "$actual" = "$expected" ] || fail "SHA-256 校验失败：$filename"
}

install_dsh_plugin() {
  local backup_dir filename workspace_file staged
  backup_dir="$DSH_DATA_HOME/backups/playbook-dsh/$(/bin/date +%Y%m%d-%H%M%S)-$$"
  (umask 077; /bin/mkdir -p "$backup_dir")
  for filename in package.json pnpm-lock.yaml pnpm-workspace.yaml; do
    if [ -f "$DSH_TARGET_DIR/$filename" ]; then
      /bin/cp -p "$DSH_TARGET_DIR/$filename" "$backup_dir/$filename"
      /usr/bin/cmp -s "$DSH_TARGET_DIR/$filename" "$backup_dir/$filename" || fail "DSH 配置备份核验失败：$filename"
    fi
  done
  if [ "$DSH_TARGET_PROFILE" = 'desktop' ] && [ "${DSH_SHELL:-}" = '1' ]; then
    printf 'Playbook: Skill 已安装；DSH Desktop 正在运行，请从 npm 注册表安装：%s\n' "$DSH_PLUGIN_SPEC" >&2
    printf 'Playbook: DSH 配置备份：%s\n' "$backup_dir" >&2
    printf '%s\n' 'Playbook: 请在当前 DSH 中调用 plugin_manager：先 list_bundles，再以以上包名和版本为 target 调用 install_bundle；若返回 pendingBuilds 仅包含 esbuild，可批准该项并重试。核对插件来源为注册表且版本正确后才算完成。' >&2
    return 4
  fi

  if [ -n "${PLAYBOOK_DSH_CLI:-}" ]; then
    [ -x "$PLAYBOOK_DSH_CLI" ] || fail 'PLAYBOOK_DSH_CLI 不是可执行文件。'
    DSH_CLI="$PLAYBOOK_DSH_CLI"
  elif [ "$DSH_TARGET_PROFILE" = 'desktop' ]; then
    for candidate in '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' "$HOME/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"; do
      if [ -x "$candidate" ]; then DSH_CLI="$candidate"; break; fi
    done
    [ -n "$DSH_CLI" ] || fail '找不到 DSH Desktop 随附命令；请安装或注册 dsh 命令。'
  else
    DSH_CLI="$(type -P dsh || true)"
    if [ -z "$DSH_CLI" ]; then
      for candidate in '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' "$HOME/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"; do
        if [ -x "$candidate" ]; then DSH_CLI="$candidate"; break; fi
      done
    fi
    [ -n "$DSH_CLI" ] || fail '找不到 dsh 命令，无法安装到当前 profile。'
  fi

  workspace_file="$DSH_TARGET_DIR/pnpm-workspace.yaml"
  [ -f "$workspace_file" ] || fail 'DSH profile 缺少 pnpm-workspace.yaml，已保留现状。'
  if ! /usr/bin/grep -q '^  esbuild: true$' "$workspace_file"; then
    if /usr/bin/grep -q '^  esbuild:' "$workspace_file"; then
      staged="$(/usr/bin/mktemp "$DSH_TARGET_DIR/.playbook-pnpm.XXXXXX")"
      /usr/bin/awk '/^  esbuild:/ { print "  esbuild: true"; next } { print }' "$workspace_file" > "$staged"
    elif /usr/bin/grep -q '^allowBuilds:$' "$workspace_file"; then
      staged="$(/usr/bin/mktemp "$DSH_TARGET_DIR/.playbook-pnpm.XXXXXX")"
      /usr/bin/awk '/^allowBuilds:$/ { print; print "  esbuild: true"; next } { print }' "$workspace_file" > "$staged"
    else
      staged="$(/usr/bin/mktemp "$DSH_TARGET_DIR/.playbook-pnpm.XXXXXX")"
      /bin/cat "$workspace_file" > "$staged"
      printf '\nallowBuilds:\n  esbuild: true\n' >> "$staged"
    fi
    /bin/chmod 600 "$staged"
    /bin/mv "$staged" "$workspace_file"
    /usr/bin/grep -q '^  esbuild: true$' "$workspace_file" || fail 'DSH esbuild 放行配置写入失败。'
  fi
  "$DSH_CLI" plugin --profile "$DSH_TARGET_PROFILE" add "$DSH_PLUGIN_SPEC" || fail "DSH 插件安装失败；配置备份位于 $backup_dir"
  /usr/bin/plutil -extract dsh.profile.bundles json -o - "$DSH_TARGET_DIR/package.json" | /usr/bin/grep -q '"playbook-dsh"' || fail 'DSH profile 未启用 playbook-dsh。'
  [ -f "$DSH_TARGET_DIR/node_modules/playbook-dsh/server.mjs" ] || fail 'DSH 插件包文件缺失。'
  [ "$(/usr/bin/plutil -extract version raw -o - "$DSH_TARGET_DIR/node_modules/playbook-dsh/package.json")" = "$DSH_PLUGIN_VERSION" ] || fail 'DSH 插件安装版本不符。'
  case "$(/usr/bin/plutil -extract dependencies.playbook-dsh raw -o - "$DSH_TARGET_DIR/package.json")" in
    "$DSH_PLUGIN_VERSION"|"^$DSH_PLUGIN_VERSION"|"~$DSH_PLUGIN_VERSION") ;;
    *) fail 'DSH 插件依赖未记录为 npm 注册表版本。' ;;
  esac
  printf 'DSH 插件已安装到 %s，配置备份：%s\n' "$DSH_TARGET_PROFILE" "$backup_dir" >&2
}

if [ -z "$FOUND_APP" ]; then
  resolve_release
  printf '正在安装 Playbook %s…\n' "$TAG" >&2
  verified_download 'Playbook-macos-arm64.zip'
  /bin/mkdir "$TEMP_ROOT/app"
  /usr/bin/ditto -x -k "$TEMP_ROOT/Playbook-macos-arm64.zip" "$TEMP_ROOT/app"
  CANDIDATE="$TEMP_ROOT/app/Playbook.app"
  valid_app "$CANDIDATE" || fail '下载包中的应用标识、版本或可执行文件无效。'
  [ "$(app_version "$CANDIDATE")" = "${TAG#v}" ] || fail '应用版本与发布标签不一致。'
  APP_DIR="${APP_DIR:-$HOME/Applications}"
  /bin/mkdir -p "$APP_DIR"
  LOCK_CANDIDATE="$APP_DIR/.playbook-install-lock"
  /bin/mkdir "$LOCK_CANDIDATE" 2>/dev/null || fail '另一个应用安装正在进行，或上次中断留下安装锁；请核对后重试。'
  APP_LOCK="$LOCK_CANDIDATE"
  [ ! -e "$APP_DIR/Playbook.app" ] && [ ! -L "$APP_DIR/Playbook.app" ] || fail '目标已有应用，已保留；请使用 --app-dir 指定空的安装位置。'
  APP_STAGE="$(/usr/bin/mktemp -d "$APP_DIR/.playbook-stage.XXXXXX")"
  /usr/bin/ditto "$CANDIDATE" "$APP_STAGE/Playbook.app"
  valid_app "$APP_STAGE/Playbook.app" || fail '应用复制校验失败。'
  # Keep the lock and move into the parent: a concurrent destination must not become a nested bundle.
  [ ! -e "$APP_DIR/Playbook.app" ] && [ ! -L "$APP_DIR/Playbook.app" ] || fail '安装目标在复制时发生变化，已停止。'
  /bin/mv -n "$APP_STAGE/Playbook.app" "$APP_DIR/"
  [ ! -e "$APP_STAGE/Playbook.app" ] || fail '安装目标已被占用，未替换现有应用。'
  FOUND_APP="$APP_DIR/Playbook.app"
  printf '应用已安装到 %s（未经 Apple 签名和公证，首次打开可能需要系统确认）。\n' "$FOUND_APP" >&2
else
  printf '复用已安装的 Playbook %s：%s\n' "$(app_version "$FOUND_APP")" "$FOUND_APP" >&2
fi
if [ "$MODE" = '--ensure-app' ]; then printf '%s\n' "$FOUND_APP"; exit 0; fi

[ -f "$TEMP_ROOT/SHA256SUMS" ] || resolve_release
verified_download 'playbook-skills.tar.gz'
/usr/bin/tar -tzf "$TEMP_ROOT/playbook-skills.tar.gz" > "$TEMP_ROOT/entries"
/usr/bin/tar -tvzf "$TEMP_ROOT/playbook-skills.tar.gz" > "$TEMP_ROOT/types"
while IFS= read -r entry; do
  entry="${entry#./}"
  entry="${entry%/}"
  [[ "$entry" =~ ^[a-zA-Z0-9_./-]+$ ]] || fail 'Skill 包含无效文件名。'
  case "/$entry/" in *'/../'*|*'/./'*|*'//'*) fail 'Skill 包含不安全路径。' ;; esac
  case "$entry" in install-skill.cjs|skills|skills/|skills/playbook-wright|skills/playbook-wright/*|skills/playbook-playwright|skills/playbook-playwright/*) ;; *) fail "Skill 包含非预期文件：$entry" ;; esac
done < "$TEMP_ROOT/entries"
while IFS= read -r entry; do case "$entry" in -*|d*) ;; *) fail 'Skill 包含链接或特殊文件，已停止安装。' ;; esac; done < "$TEMP_ROOT/types"
/bin/mkdir "$TEMP_ROOT/skill"
/usr/bin/tar -xzf "$TEMP_ROOT/playbook-skills.tar.gz" -C "$TEMP_ROOT/skill"
[ -f "$TEMP_ROOT/skill/install-skill.cjs" ] && [ -f "$TEMP_ROOT/skill/skills/playbook-wright/SKILL.md" ] || fail 'Skill 包不完整。'
SKILL_FRAMEWORK="$FRAMEWORK"
if [ "$FRAMEWORK" = 'dsh' ]; then SKILL_FRAMEWORK='codex'; fi
INSTALL_ARGS=(--source-dir "$TEMP_ROOT/skill/skills/playbook-wright" --framework "$SKILL_FRAMEWORK" --scope "$SCOPE")
if [ "$SCOPE" = 'project' ]; then INSTALL_ARGS+=(--project-root "$PROJECT_ROOT"); fi
if [ "$REPLACE" -eq 1 ]; then INSTALL_ARGS+=(--replace); fi
ELECTRON_RUN_AS_NODE=1 "$FOUND_APP/Contents/MacOS/Playbook" "$TEMP_ROOT/skill/install-skill.cjs" "${INSTALL_ARGS[@]}"
printf '%s\n' 'Skill 安装完成。请在目标智能体重新加载技能或打开新会话，再调用 $playbook-wright（兼容 $playbook-playwright）。' >&2
if [ -n "$DSH_TARGET_PROFILE" ]; then install_dsh_plugin; fi
