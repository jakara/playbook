# 构建与发布

安装包面向 macOS Apple Silicon，采用 [MIT](../LICENSE) 许可。正式下载入口为 [GitHub Releases](https://github.com/jakara/playbook/releases/latest)。

## 本地构建

```sh
npm ci
npm run check
npm run desktop:check
npm run desktop:build
npm run package:mac
```

应用输出到 `release/mac-arm64/Playbook.app`，DMG 和 ZIP 位于 `release/`。首次启动或构建会下载锁定版本的 Electron，也可先运行 `npm run electron:install`。图标修改后运行 `npm run icons`。

桌面回放和导出检查见[检查与排错](verification.md)。

## 发布版本

客户端版本保存在 `package.json` 和 `package-lock.json`。例如：

```sh
npm version patch --no-git-tag-version
```

Skill 版本在对应 `SKILL.md` 中维护，清单与脚本的 `schemaVersion` 独立管理。

推送到 `main` 后，GitHub Actions 检查、构建并发布新版本，以 `v<version>` 标记源码。相同应用版本已经发布时，只运行构建检查，不覆盖原 Release；要交付新的安装包，需要提升版本。

应用没有内置自动更新。安装器复用满足最低要求的已有应用，安装 Skill 不会强制升级客户端。

## 下载文件

| 文件 | 内容 |
|---|---|
| `Playbook-macos-arm64.dmg` | 磁盘映像 |
| `Playbook-macos-arm64.zip` | 应用压缩包，供安装器下载 |
| `playbook-skills.tar.gz` | 完整 Skill、兼容入口及安装 CLI |
| `install.sh` | 安装器 |
| `release.json` | 版本、平台和文件摘要 |
| `SHA256SUMS` | 同一次发布的文件校验值 |

稳定下载链接使用 `releases/latest/download/<filename>`。自动安装会先解析正式版本，再固定到该 tag 下载并校验所有文件，完整步骤见[安装指引](../install.md)。

## 发布检查

- 应用能启动，版本、架构、入口和随包文件正确。
- 两个 Skill 入口及参考资料齐全，应用和 Skill 包内容一致。
- 发布包不含本地配置、备份、业务项目、临时文件或运行记录。
- DMG、ZIP 和 Skill 包可以读取，校验值对应实际上传的文件。
- 回放、停止、清理、安装和导出按影响范围完成检查；桌面和声音效果在目标环境中确认。

构建、上传或校验失败时，保留上一可用 Release。新版本上传并核验成功后，才清理同系列的旧 Release 对象和附件，Git tags 保留。

## 版本保留规则

`major.minor` 为一个发布系列。新 patch 发布成功后，保留该系列最新 Release；其他系列、draft、prerelease 和 Git tags 不受影响。删除旧 Release 后，其安装包链接会失效，长期下载应使用最新版本入口。

已发布 tag 不替换。失败重试须核对 tag 与源码对应关系；同版本重跑会跳过已发布版本。若发布成功而旧 Release 清理失败，保留新旧两版并报告失败，再单独核对需要清理的 Release 对象。

## 平台限制

当前安装包未签名、未公证，首次运行可能需要通过 macOS 系统界面确认。文件校验不替代开发者签名或公证。尚未提供 Intel Mac、Windows 或 Linux 安装包。
