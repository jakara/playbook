# Playbook

把已有 Playwright 业务流程变成可以自动讲解、自动操作的现场演示，并让演示流程继续用于自动化测试。

产品形态拟采用 **Electron 桌面应用 + Playwright + Driver.js**。Electron 管理脚本和演示；Playwright 执行真实浏览器动作与断言；Driver.js 配合自定义呈现层展示章节、箭头提示、灰色蒙层和鼠标光圈。用户安装桌面应用后无需单独启动 Node 服务。

## 当前交付

| 内容 | 状态 |
|---|---|
| [产品方案](docs/product-plan.md) | 已编写，覆盖用户流程、首版范围、验收与迭代 |
| [技术架构](docs/architecture.md) | 已编写，包含进程、工作区、运行和发布边界 |
| [脚本契约与语义](skills/playbook-playwright/references/contract.md) | v0.1，TypeScript 原生契约 |
| [双向转换 Skill](skills/playbook-playwright/SKILL.md) | 可提供给其他智能体使用 |
| 契约代码、参考执行器、正反转换样例 | 可编译、可测试；不是完整播放器 |
| Electron 窗口、脚本库、演示列表、引导播放器 | 待按方案实施，本仓库尚不能启动桌面产品 |

**业务演示脚本归属业务仓库。** 艺工现有样例保留在艺工仓库的 `demos/guided-replay`，没有复制到本仓库。本仓库的 `examples/catalog` 是无网络、无账号的合成教学样例，用来验证契约和转换方式，不能作为艺工业务验收证据。

## 验证契约与样例

开发环境需要 Node.js、npm 和本机 Google Chrome：

```sh
npm ci
npm run check
```

检查包含类型编译、执行顺序与失败传播测试，以及三份代码在相同模拟页面上的真实浏览器检查：原始 TC、共享 Playbook 流程的 TC、独立导出的 TC。依赖已固定；`@playbook/core` 是本仓库本地包名，尚未发布到 npm。

## 给其他智能体使用

将 `skills/playbook-playwright` 文件夹复制或链接到目标智能体的 Skill 目录，或直接让支持读取本地文件的智能体读取 `SKILL.md`。不需要复制艺工业务代码。

请求示例：

> 使用 `$playbook-playwright`，将本项目某个 Playwright TC 转为可演示流程，保留原断言与数据边界，生成 Playbook 脚本、测试适配入口和转换报告。

> 使用 `$playbook-playwright`，将指定 Playbook 脚本转成独立的 Playwright TC，保留准备、断言与清理逻辑，列出尚未验证的依赖。

共享模式需要目标业务仓库安装本包或未来发布版本；开发时可使用本地 `file:` 依赖。独立导出模式不依赖 Playbook。Skill 不会自动安装到本机全局目录，也不隐含执行生产写入的授权。
