# Playbook 安装任务

把本文件交给你的智能体即可安装。**请作为执行任务处理：核对环境、执行安装并验证，不只复述步骤。** 仅操作本次授权的应用和 Skill 目录，不写业务数据、生产配置、全局规则、模型设置或凭据。

本指引配合正式 GitHub Release 的安装接口。若所需资产尚未发布，停止并说明缺少的资产；不改用未知镜像、猜测下载地址或宣称已完成。

此流程安装客户端和完整的 `playbook-wright` Skill，包含演示创作、维护、呈现调整与 Playwright TC 双向复用/转换指引；`playbook-playwright` 保留为兼容入口。客户端和 Skill 均采用 [MIT](LICENSE) 许可。

## 1. 确定安装目标

从用户请求确认“仅应用”或“应用 + Skill”，以及 Codex / Claude Code、个人 / 指定项目。已明确或能核实的内容不要重复询问；仅在缺少框架或项目路径时补齐必要信息。

支持范围为 **macOS Apple Silicon**。先检查：

```sh
uname -s
uname -m
/usr/sbin/sysctl -n hw.optional.arm64 2>/dev/null || true
```

系统须为 Darwin，架构应为 arm64。若 `uname -m` 为 x86_64、但系统信息确认是 Apple Silicon，先切换到原生 arm64 终端，或运行 `/usr/bin/arch -arm64 /bin/bash` 后执行后续步骤；安装器不会在 Rosetta 进程中继续。Intel Mac、Windows、Linux 不执行此安装，不把其他平台标为已支持。

检查同名 Skill 的已有安装和本地修改；有冲突时保留现状，按后文的备份与替换规则处理，不直接覆盖。

默认应用位置为 `~/Applications/Playbook.app`，不需要管理员权限或外置 Node.js。已有可用的 v0.6+ 应用优先复用，不为安装 Skill 强制升级应用。安装器会检查标准安装位置，也可用 `--app-dir /absolute/directory` 指定应用所在或待安装目录。

## 2. 下载并核验官方安装器

使用系统工具在临时目录操作。先解析一次 `latest.tag_name`，随后下载固定到这个 tag，校验通过才执行。**不要使用 `curl | bash`。**

以下代码在同一 Bash 会话中执行，保留变量及临时目录供第 3 步使用。不把 GitHub token、密码或其他凭据写入文件。

```bash
set -eu

PLAYBOOK_INSTALL_TMP="$(mktemp -d /tmp/playbook-install.XXXXXX)"
/usr/bin/curl --fail --location --silent --show-error --retry 3 \
  --proto '=https' --tlsv1.2 \
  'https://api.github.com/repos/jakara/playbook/releases/latest' \
  --output "$PLAYBOOK_INSTALL_TMP/latest.json"

PLAYBOOK_RELEASE_TAG="$(/usr/bin/plutil -extract tag_name raw -o - "$PLAYBOOK_INSTALL_TMP/latest.json")"
if ! [[ "$PLAYBOOK_RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf '%s\n' '官方 Release tag 格式不受支持，停止安装。' >&2
  exit 1
fi

PLAYBOOK_RELEASE_BASE="https://github.com/jakara/playbook/releases/download/$PLAYBOOK_RELEASE_TAG"
/usr/bin/curl --fail --location --silent --show-error --retry 3 \
  --proto '=https' --tlsv1.2 "$PLAYBOOK_RELEASE_BASE/install.sh" \
  --output "$PLAYBOOK_INSTALL_TMP/install.sh"
/usr/bin/curl --fail --location --silent --show-error --retry 3 \
  --proto '=https' --tlsv1.2 "$PLAYBOOK_RELEASE_BASE/SHA256SUMS" \
  --output "$PLAYBOOK_INSTALL_TMP/SHA256SUMS"

PLAYBOOK_INSTALL_HASH="$(/usr/bin/awk '$2 == "install.sh" || $2 == "*install.sh" { print $1 }' "$PLAYBOOK_INSTALL_TMP/SHA256SUMS")"
if ! [[ "$PLAYBOOK_INSTALL_HASH" =~ ^[0-9a-fA-F]{64}$ ]]; then
  printf '%s\n' '缺少唯一有效的 install.sh 校验值，停止安装。' >&2
  exit 1
fi

(
  cd "$PLAYBOOK_INSTALL_TMP"
  printf '%s  install.sh\n' "$PLAYBOOK_INSTALL_HASH" > install-only.sha256
  /usr/bin/shasum -a 256 -c install-only.sha256
)
export PLAYBOOK_RELEASE_TAG
```

校验失败立即停止，保留具体错误。此校验核对同一次官方发布的资产完整性，不替代开发者签名或公证。

## 3. 执行符合用户目标的一种安装

只执行与用户请求匹配的命令，不把全部示例依次运行。每次使用上一步固定的 `PLAYBOOK_RELEASE_TAG`；安装器后续的应用、Skill 和校验值下载继续使用同一个 tag。

**仅安装或复用应用：**

```sh
PLAYBOOK_RELEASE_TAG="$PLAYBOOK_RELEASE_TAG" \
  bash "$PLAYBOOK_INSTALL_TMP/install.sh" --ensure-app
```

**为 Codex 个人范围安装应用和两个 Skill 入口：**

```sh
PLAYBOOK_RELEASE_TAG="$PLAYBOOK_RELEASE_TAG" \
  bash "$PLAYBOOK_INSTALL_TMP/install.sh" \
    --install --framework codex --scope user
```

**为 Claude Code 个人范围安装：**

```sh
PLAYBOOK_RELEASE_TAG="$PLAYBOOK_RELEASE_TAG" \
  bash "$PLAYBOOK_INSTALL_TMP/install.sh" \
    --install --framework claude-code --scope user
```

**安装到指定项目：** 将示例路径替换为用户明确指定的、智能体实际打开的项目绝对路径，不推断为演示子目录或上级仓库。

```sh
PLAYBOOK_RELEASE_TAG="$PLAYBOOK_RELEASE_TAG" \
  bash "$PLAYBOOK_INSTALL_TMP/install.sh" \
    --install --framework codex --scope project \
    --project-root "/absolute/path/to/project"
```

Claude Code 项目安装将 `--framework codex` 换成 `--framework claude-code`。无需先在 Playbook 登记项目，也不要求项目已有 `.playbook.json`。

| 可选参数 | 作用 |
|---|---|
| `--app-dir /absolute/directory` | 指定应用所在或安装目录，例如 `/absolute/path/to/apps` |
| `--check-app` | 只检查应用，不安装；退出码 3 表示未找到可用应用 |
| `--replace` | 已有明确授权后，备份并替换被本地修改或存在冲突的 Skill |

安装器自动检查应用：满足最低版本的已有应用复用；缺失时下载、校验官方 ZIP，安装到用户 Applications。公开 Skill 资产为 `playbook-skills.tar.gz`，包内含完整创作/维护/TC 指引、兼容入口及自包含 CLI，由已安装应用的 Electron Node 执行；不依赖外置 Node，也不要求旧应用已携带这个新 CLI。

未修改的旧版 Skill 更新先备份。发现本地修改或冲突时，说明目标与替换影响；用户已有明确替换授权可使用 `--replace`，否则取得确认后再重试。不要一开始就默认带上 `--replace`。符号链接目标不写入，不删除或替换链接。

## 4. 验证并交付

1. 检查应用，记录实际路径和版本：

   ```sh
   PLAYBOOK_RELEASE_TAG="$PLAYBOOK_RELEASE_TAG" \
     bash "$PLAYBOOK_INSTALL_TMP/install.sh" --check-app
   ```

   使用自定义目录时，这次检查也传相同的 `--app-dir`。首次打开应用仍由用户完成系统交互。未签名/未公证提示可能需要用户在 macOS 提供的界面中处理；不要关闭 Gatekeeper、执行绕过策略或清除 xattr。
2. 安装 Skill 时核对两个入口及完整参考资料均存在，且安装器返回校验成功：

   | 框架 | 个人范围 | 项目范围 |
   |---|---|---|
   | Codex | `~/.agents/skills/{playbook-wright,playbook-playwright}` | `<项目>/.agents/skills/{playbook-wright,playbook-playwright}` |
   | Claude Code | `~/.claude/skills/{playbook-wright,playbook-playwright}` | `<项目>/.claude/skills/{playbook-wright,playbook-playwright}` |

3. 提醒用户重新加载智能体 Skills 或开启新会话，再调用 `$playbook-wright` 创作、维护演示或转换 Playwright TC；旧 `$playbook-playwright` 是兼容入口。文件校验成功与智能体已加载分开说明，未实际调用时不得声称调用已验证。
4. 打开应用首页的 **Playbook 使用教程**。先体验内置播放；Skill 实操环节只有用户选择并点击的安装才产生真实写入。
5. 简短报告固定的 Release tag、应用路径/版本、Skill 版本、安装范围、两个 Skill 位置、实际检查结果、备份位置，以及仍需用户完成的系统交互或重载。不输出凭据。

完成后仅清理本次下载的临时文件，不清理用户原目录、备份、历史运行记录或业务数据。失败时保留定位问题所需的日志，如实说明未完成部分。

维护者源安装器位于 [skills/playbook-wright/scripts/install.sh](skills/playbook-wright/scripts/install.sh)；用户安装应从固定 Release 获取并校验，不执行未经核验的 main 分支脚本。
