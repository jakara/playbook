# 本次验证记录

日期：2026-10-21。范围为本仓库 v0.1 契约、转换示例与 Skill，不是 Electron 产品验收。

## 已执行

| 检查 | 实际结果 |
|---|---|
| `npm run build` | 通过，TypeScript 契约与参考执行器可编译 |
| `npm run check:examples` | 通过，原 TC、Playbook、共享 TC 与独立导出 TC 类型检查通过 |
| `npm run test:unit` | 3 项通过：动作与断言顺序、失败阻止后续步骤、重复步骤 ID 拒绝 |
| `npm run test:examples` | 本机 Chrome 中 3 项通过：原 TC、共享流程 TC、独立导出 TC |
| `npm run test:negative` | 通过：将 fixture 标题改为 Changed task 后，3 个 TC 均因原有 Poster brief 业务预期而失败 |
| Skill `quick_validate.py` | 通过，命名、frontmatter 与脚手架完整性符合检查 |

浏览器检查在无网络、无账号的合成课程页执行。开发机 Node.js 26，Playwright 1.58.2；这不是 Node LTS、其他操作系统或 Electron 内置 Node 环境的兼容性验证。

负向检查的本机证据位于被忽略的 `artifacts/negative-verification.json`。安装包、桌面进程、Driver.js 呈现、客户登录和真实服务均不在这些合成检查的证明范围内。

## Skill 独立试转

另由独立智能体只读取 Skill 与一个含自定义 fixture 的工作坊 TC，在隔离目录生成 Playbook、共享 TC、独立 TC 及转换报告。原输入未改动；三个原生断言、两项动作及 fixture 准备/清理引用均保留，完整和独立范围的类型检查通过。

父进程复跑后，原始对照、共享入口、独立入口 **3/3 在 Chrome 通过**。把 fixture 的预期标题单独改为 Missing workshop 后，三种入口均在相应 `toBeVisible` 断言失败，负向检查通过。

验证过程中，首次浏览器启动受执行环境限制；首次本机复跑又因测试目录误收集负向副本而出现 3 通过/3 预期失败。两轮历史记录保留，排除证据目录后重新取得上述 3/3 正向结果，没有改宽业务断言。

试转发现并修正两处契约说明：独立导出允许继续引用业务 fixture；`safe` 的常规临时页面准备与 `reset-required` 的持久业务状态恢复作了明确区分。Skill 同时增加负向副本不应进入正向收集范围的说明。本机证据保存在被 Git 忽略的 `artifacts/skill-forward-verification/`，未将临时源码、trace 或机器路径推送远端。

## 关联业务样例

艺工业务仓库中的 `demos/guided-replay` 独立进行了真实本地平台检查：两次完整 12 步回放、暂停继续、结束重播、箭头与光圈同步、原生预览弹窗层级均通过；业务写入 0，既有课程摘要保持不变。

该业务样例已单独提交于艺工仓库，未复制到本产品仓库，也尚未迁移为 v0.1 Playbook 契约。此项证明现有独立演示样例可运行，不等于本仓库已经完成艺工集成或正式学校 SSO 验收。

## 尚未验证

Electron 管理界面与安装包尚未实施；utilityProcess 中的浏览器启动、打包资源解析、签名公证、无外部 Node 的干净机器运行、Windows/Linux、多标签页/frame、客户环境数据恢复及正式身份接入均待后续实施与验收。
