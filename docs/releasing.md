# 发布维护

发布目标为 **macOS Apple Silicon**。客户端版本来自 `package.json`，Skill 版本保存在 Skill 入口；清单和脚本的 `schemaVersion` 不随客户端 patch 自动改变。

客户端、SDK、完整创作/维护/TC Skill、文档和图标由 **jakara** 按 MIT 许可发布，具体范围见 [LICENSE](../LICENSE) 和 [LICENSE_SCOPE.md](../LICENSE_SCOPE.md)。完整 Skill 在公开仓库、应用和 Release 中保持一致。

`skills/` 是完整 Skill 的发布来源；gitignored `.private/` 仅作维护者本地备份，不进入公开 Git、应用包或 Release。

## 版本与触发

1. 发布前核对改动、工作区状态与必要验证，不把他人未完成的修改一起提交。
2. 更新 `package.json` 和 `package-lock.json` 中的应用版本。可用以下命令同步维护两者，不在本地自动创建 tag：

   ```sh
   npm version 0.7.1 --no-git-tag-version
   ```

   `0.7.1` 是示例，不能每次固定使用。行为或 Skill 契约变更时同步相应 Skill 版本与文档。
3. 经授权推送到 `main` 后，GitHub Actions 自动检查、构建并发布新版本，以 `v<version>` 标记源码。
4. 相同应用版本已经发布时，普通代码推送只运行 CI，不再次发布，不覆盖原 Release 资产。要交付新的二进制，先提升版本。

当前没有应用内自动更新。用户从最新 Release 下载，或在缺少应用时通过安装指引安装；安装器复用满足最低要求的既有应用，安装新 Skill 不强制升级应用。

## 发布资产

正式 Release 使用固定文件名：

| 文件 | 内容 |
|---|---|
| `Playbook-macos-arm64.dmg` | Apple Silicon 磁盘映像 |
| `Playbook-macos-arm64.zip` | Apple Silicon 应用 ZIP，供安装器下载 |
| `playbook-skills.tar.gz` | 完整创作/维护/TC Skill、兼容入口及自包含 CLI |
| `install.sh` | 经校验后执行的安装器 |
| `SHA256SUMS` | 同一次发布的资产 SHA-256 清单 |

固定最新入口：

- [DMG](https://github.com/jakara/playbook/releases/latest/download/Playbook-macos-arm64.dmg)
- [ZIP](https://github.com/jakara/playbook/releases/latest/download/Playbook-macos-arm64.zip)
- [Skill 包](https://github.com/jakara/playbook/releases/latest/download/playbook-skills.tar.gz)
- [安装器](https://github.com/jakara/playbook/releases/latest/download/install.sh)
- [SHA256SUMS](https://github.com/jakara/playbook/releases/latest/download/SHA256SUMS)

`latest` 用于展示下载入口。自动安装先获取 GitHub API 的 `latest.tag_name`，随后固定 `/releases/download/<tag>/...` 下载安装器与清单；校验安装器后传 `PLAYBOOK_RELEASE_TAG=<tag>` 执行，后续下载仍固定到同一 tag。不要混用跨版本脚本、包和校验值，不使用 `curl | bash`。完整用户步骤见 [install.md](../install.md)。

应用包与 Skill 包来自同一次源码构建；从 `skills/` 打包完整内容，不读取 `.private/` 本地备份。应用图标由 [品牌源文件](../assets/playbook-mark.svg) 生成，不使用默认 Electron 图标。

## 发布检查与失败保护

新版本先完成依赖安装、类型/样例/单元和桌面必要检查，再构建、生成分发资产与校验清单。上传前核对：

- 应用版本、CPU 架构、启动入口和随包文件；完整 Skill 主入口、参考资料及兼容入口完整性。
- `.private/` 不被 Git 跟踪或打入发布包；应用和 Skill 压缩包中均包含 `skills/` 的完整参考资料。不能仅靠 `.gitignore` 代替实际包内容核对。
- ZIP、DMG 和 Skill 压缩包可读取，`SHA256SUMS` 对应实际要上传的字节。
- 文件名符合固定下载接口，安装器支持固定 tag 下载和校验。
- 适用的隔离播放、停止/清理、安装与导出回归。场景和证据记入 [验证记录](verification.md)，不能把 CI 成功当作真实桌面或业务验收。

构建、测试、上传或下载核验失败时，保留上一个可用发布及其资产，不能先删旧版本再尝试发布新版本。失败重试不以不完整上传冒充成功，不覆盖用户本地已有目标或历史证据。只有新 Release 全部上传且核验成功，才能清理同系列旧 Release。

## 同系列保留策略

`x.y` 为一个发布系列，例如 `0.7.x`：

- 新 patch（如 `0.7.1`）发布并核验后，删除同系列更旧的 **Release 对象及附件**，保留本系列最新 Release。
- 保留所有 Git tags 及源码历史；不删除其他系列的 Release，例如 `0.6.x`。
- 不处理比当前版本更新的 Release，不因同版本 CI 重跑删除发布。
- 旧 Release 删除后，其二进制资产链接会失效。长期下载入口使用 `releases/latest/download/...`；确需留存旧包时，清理前单独归档并保留校验值。

“保留 tag”只保证源码仍可定位，不代表旧二进制仍可下载。

已有公开 Git 历史和 tags 保留，不通过改写历史清理本地备份或替换已有 tag。当前完整 Skill 的公开许可统一见根目录 MIT License。

## 本地开发与复核

```sh
npm ci
npm run check
npm run desktop:check
npm run desktop:build
npm run package:mac
```

图标源有变化时先运行 `npm run icons`。本地应用位于 `release/mac-arm64/Playbook.app`，发布流程将分发资产整理成上表的固定名称。

当前分发**未签名、未公证**，构建配置不提供 Apple 开发者证书或公证凭据。校验和检查资产完整性，不能替代开发者签名。安装文档不能要求用户全局关闭 Gatekeeper 或清除隔离属性。

签名、公证、Intel/Windows/Linux 包和干净机器验收属于另外的交付工作，不能据 macOS arm64 构建通过声称已完成。

If retiring an older Release fails after the new release is published, the workflow fails while preserving both. A same-version rerun skips publication; inspect the retained older Release and remove only its Release object if appropriate, keeping its Git tag. The newest download remains available.
