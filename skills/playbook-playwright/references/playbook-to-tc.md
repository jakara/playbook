# Playbook → TC

## 共享模式（默认）

沿用业务已有的 `test` fixture、项目和配置，准备与脚本类型相匹配的 context，然后调用 `runPlaybook`，用 `test.step` 包裹每一步。不调用演示 beforeStep，不加载 Driver.js，不等待阅读停留或光标动画。

从 Profile 或现有 tests 确认真实 setup/teardown。Playbook 只有步骤而无已知环境入口时，可生成语法有效的测试适配代码和明确依赖清单；依赖未实现前不能标为可执行 TC。

## 独立模式

用户要求脱离 Playbook 时，将每步 `run` 和 `verify` 按顺序展开到标准 `@playwright/test` 的 `test.step`，保留自由变量绑定、helper imports、fixture 和清理。移除演示呈现元数据及纯视觉等待，不删除实现业务时序所需的事件、导航和轮询。

“独立”默认指 TC 不再依赖 Playbook SDK 或脚本，仍可引用原业务 fixture/helper。例如 `tests/exported/course.spec.ts` 继续从 `../fixtures.js` 导入项目的 test。不要仅为独立导出复制一份 fixture；只有明确要求可移植包或隔离验证无法引用原目录时才复制/提取所需文件，并记录来源和同步责任。用户要求单文件或脱离业务仓库分发时，另外核对所有依赖是否已实际打包，不把普通独立 TC 冒充自包含交付包。

不要用 `Function.toString()` 或拼接源码猜闭包。动态步骤生成器、运行期分支、跨步骤状态和外部 helper 需要实际阅读并保留语义；无法独立展开的依赖保留为普通业务 helper，或报告为何仍依赖原实现。

生成的独立 TC 标注来源文件、流程 ID/版本或可获取的 revision。它是快照，需要源脚本变更后重新生成或人工同步，不同时宣称两者仍为单一真源。

## 断言与失败

- 原 verify 原样保留，原 run 中的业务断言也保留。`look`、标题和“显示成功”等讲解不自动等于断言。
- 只有动作没有有效预期的脚本，先从现有业务契约确定预期；无法确定时交付缺口，不用空 verify / 永真 expect 补齐。
- 保留特定 expected failure/soft assertion 的实际语义；测试入口应使失败进入正式测试报告，不能 catch 后只写日志。
- 演示 Profile 的登录态和真实写入不能默认用于 CI。选择已有隔离 fixture；替换环境时报告数据差异，不假装完全等价。

## 验证

对比原流程与导出 TC 的关键动作与预期，运行类型检查与目标测试。能够安全构造失败时，改变 fixture 的预期输出，确认导出 TC 的业务断言也失败。不要通过放宽断言使两者表面通过。
