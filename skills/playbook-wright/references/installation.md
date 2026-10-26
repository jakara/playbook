# 应用检测与安装

本地创作前，从当前 Skill 目录执行：

```bash
bash scripts/install.sh --ensure-app
```

这是检测与补齐演示播放器所需依赖；不调用付费模型，不要求用户预装 Node、Python 或 GitHub CLI。已有 v0.6+ 应用会直接复用，不升级、不退出正在运行的应用。缺少时解析 `jakara/playbook` 的最新正式 Release，固定完整 tag，下载 Apple Silicon Mac ZIP 并核对同版本 SHA256SUMS，再安装到 `~/Applications/Playbook.app`。不会覆盖未知或不兼容的现有应用。

- `--check-app` 只检查，不下载、不创建目录：找到返回 0，未安装返回 3，不支持的平台返回 2。
- `--app-dir /绝对目录` 显式指定安装位置；提供后只在该位置检查，方便用户选择或隔离验收。默认还检查 `/Applications`、用户 Applications、`PLAYBOOK_APP_PATH` 和产品仓库开发包位置。
- `PLAYBOOK_RELEASE_TAG=v0.11.1` 固定所有下载资产到同一正式版本；外层安装 prompt 已解析 tag 时必须传递，不能重新查询 latest 混用不同版本的安装器和包。
- 当前仅支持 macOS arm64。应用暂未完成 Apple 开发者签名和公证，首次运行可能需要用户通过系统安全界面确认。不能关闭 Gatekeeper、清除 quarantine 或伪造已成功运行。

用户要求安装/更新本 Skill 时，可用同一工具：

```bash
bash scripts/install.sh --install --framework codex --scope project --project-root /用户指定的项目根目录
```

支持 `codex`、`claude-code`，作用范围 `user`、`project`。项目目录由用户指定，必须存在；不猜测为某个 Book 或业务演示子目录。默认从同一 Release 获取并校验 Skill 包，其中自包含安装 CLI 由现有应用的 Electron Node 执行；因此旧兼容应用也可安装新版 Skill。主入口与旧调用名一起安装，保留逐目录回执与失败信息。

已有本安装器管理且内容未改变的版本可在创建、校验完整备份后更新。发现本地修改、额外文件或来源不明的目录时停止，先展示具体目标与备份安排；只有用户明确同意替换才加 `--replace`。软链接始终保留并停止写入，不删除、拆链或操作受管理插件缓存。失败必须报告，不悄悄改装到用户级目录。

安装完成后，请用户在目标智能体重新加载技能或开启新会话；检查 `$playbook-wright` 与兼容 `$playbook-playwright` 是否被发现。文件安装校验不等于当前会话已经加载，也不等于业务播放通过。

云端执行环境不能假定能访问用户的本地工作区和应用。先确认框架提供的本地工具；没有时交付可下载的脚本和用户端安装指引，如实说明本机步骤尚未验证。
