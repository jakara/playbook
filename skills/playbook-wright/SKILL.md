---
name: playbook-wright
description: Playbook 公开版基础接入引导：检查或安装桌面播放器，安装基础入口并帮助用户打开已有演示。完整创作、维护和测试转换由另行分发的专业 Skill 提供。
metadata:
  edition: community-bootstrap
---

# Playbook 基础接入引导

当前安装页 Skill 版本为 **0.10.1**，适配客户端 v0.6 及以上。此公开入口只负责安装和接入；不包含专业版的需求梳理、创作、呈现调整和 Playwright TC 双向转换指引。专业 Skill 将通过 WorkBuddy 市场另行分发，目前尚未上架。不能声称已购买、已取得专业版或给出不存在的购买链接。

## 检查应用

在本 Skill 目录执行：

```bash
bash scripts/install.sh --ensure-app
```

已有兼容应用则复用；缺少时从 `jakara/playbook` 正式 GitHub Release 固定版本下载，核对 SHA-256 后安装到用户 Applications。仅支持 macOS arm64；未经 Apple 签名和公证，首次打开可能需要系统确认。不能关闭系统安全控制或清除 quarantine。

云端智能体不能假定能访问用户电脑。没有实际本地工具时，提供[安装指引](https://github.com/jakara/playbook/blob/main/install.md)，明确尚未检查/安装到用户本机，不把云端操作报成桌面成功。安装本身不调用模型 API。

## 安装基础入口

仅在用户要求安装到智能体框架时，先确认框架和作用范围。项目级必须使用用户指定的现有项目根目录，不猜成某个 Book 或演示子目录：

```bash
bash scripts/install.sh --install --framework codex --scope project --project-root /用户指定的项目根目录
```

支持 codex/claude-code 与 user/project。工具只安装公开基础引导和旧调用名兼容入口；不能安装、获取或更新市场专业版。外层已固定版本时，通过 `PLAYBOOK_RELEASE_TAG=v0.7.1` 传递同一 tag。`--app-dir /绝对目录` 指定应用位置；`--check-app` 只检测，找到返回0、缺少返回3、不支持返回2。

安装器会保护已有完整/专业 Skill、本地修改和软链接。发现冲突先报告具体目录；仅用户明确同意替换并有已核验备份时才能加 --replace，不能为了完成基础引导安装覆盖专业内容。安装后让目标框架重新加载技能或开启新会话，文件校验通过不代表当前会话已识别。

## 打开现有演示

让用户打开 Playbook，播放内置教程，或添加已有 `.playbook.json` 的项目文件夹。客户端提供项目/Book 浏览、Section Tab、搜索、刷新、播放和 PPTX 导出。用户需要创作时明确当前只是基础入口；已有专业 Skill 则交由其处理，否则可提供公开 SDK 和[架构文档](https://github.com/jakara/playbook/blob/main/docs/architecture.md)供用户自己的智能体使用，不能伪称加载专业指引。

业务脚本、Profile、凭据和运行证据留在用户项目；不写入产品仓库。不调用付费模型、不操作真实业务数据，也不改动受管理插件缓存。

客户端 v0.7.1 支持可选的文字聚光：在有唯一 Locator `target` 的步骤中写 `presentation: { spotlight: 'text' }`。播放器读取该元素内真实可见文字的 `Range`，逐行突出当前视口内的文字并避让弹窗；业务 `run` 和 `verify` 仍按原 Locator 语义执行。省略此字段或使用 `element` 保持原有元素聚光；无目标的中央说明、图片和整页目标继续使用原模式。隐藏、空白或歧义目标会拒绝或隐藏聚光，不会保留上一步位置。完整创作规则仍以专业 Skill 和 SDK 类型为准。
