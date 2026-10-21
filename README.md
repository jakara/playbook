# Playbook

用自己的智能体配合 Playbook Skill，把需求、手工操作流程或 Playwright TC 变成可自动讲解、自动操作的现场演示，并继续复用于自动化测试。

产品形态拟采用 **用户自己的智能体 + Skill + Electron 只读客户端**。智能体负责需求梳理、脚本管理、演示编排、讲解与效果调整；客户端负责查看、搜索、播放和运行反馈，并提供随包 Skill 安装入口。Playwright 执行真实浏览器动作与断言；Driver.js 配合自定义呈现层展示章节、箭头提示、灰色蒙层和鼠标光圈。

## 当前交付

| 内容 | 状态 |
|---|---|
| [产品方案](docs/product-plan.md) | v0.2，AI 创作与只读客户端、内置 Skill 安装 |
| [技术架构](docs/architecture.md) | v0.2，包含创作/播放衔接、安装写入边界与版本管理 |
| [脚本契约与语义](skills/playbook-playwright/references/contract.md) | v0.1，TypeScript 原生契约 |
| [Playbook 创作与维护 Skill](skills/playbook-playwright/SKILL.md) | 需求引导、脚本生成、调整与双向转换；沿用既有 Skill 标识 |
| 契约代码、参考执行器、正反转换样例 | 可编译、可测试；不是完整播放器 |
| Electron 只读资料库、播放器、随包 Skill 安装器 | 待实施，本仓库尚不能启动桌面产品 |

**业务演示脚本归属业务仓库。** 艺工现有样例保留在艺工仓库的 `demos/guided-replay`，没有复制到本仓库。本仓库的 `examples/catalog` 是无网络、无账号的合成教学样例，用来验证契约和转换方式，不能作为艺工业务验收证据。

## 验证契约与样例

开发环境需要 Node.js、npm 和本机 Google Chrome：

```sh
npm ci
npm run check
```

检查包含类型编译、执行顺序与失败传播测试，以及三份代码在相同模拟页面上的真实浏览器检查：原始 TC、共享 Playbook 流程的 TC、独立导出的 TC。依赖已固定；`@playbook/core` 是本仓库本地包名，尚未发布到 npm。

## 给其他智能体使用

正式产品将把 Skill 完整打包进应用，由用户选择本地框架与用户级/项目级范围后安装，不要求另行下载。现阶段客户端安装器尚未实施；开发调试可直接让智能体读取 `skills/playbook-playwright/SKILL.md`，或在目标框架支持时复制/链接该完整目录。不会自动修改本机智能体配置。

请求示例：

> 使用 `$playbook-playwright`，为首次使用的老师设计一段课程查找和任务预览演示，帮我补齐必要信息，生成可验证的 Playbook script。

> 使用 `$playbook-playwright`，把任务预览多停留四秒，提示改到下方，讲解更适合培训；保留原业务动作和断言。

> 使用 `$playbook-playwright`，将本项目某个 Playwright TC 转为可演示流程，保留原断言与数据边界，生成 Playbook 脚本、测试适配入口和转换报告。

> 使用 `$playbook-playwright`，将指定 Playbook 脚本转成独立的 Playwright TC，保留准备、断言与清理逻辑，列出尚未验证的依赖。

共享模式需要目标业务仓库安装本包或未来发布版本；开发时可使用本地 `file:` 依赖。独立导出模式不依赖 Playbook。Skill 本身不改智能体配置，未来客户端按用户明确选择安装；执行生产写入仍依具体任务授权。
