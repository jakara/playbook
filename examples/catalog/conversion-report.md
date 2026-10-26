# Catalog 转换示例

## 来源与目标

- 来源：`original.spec.ts` 中 `search a course and preview its task`。
- 正向产物：`catalog.playbook.ts`；共享测试入口：`shared.spec.ts`。
- 反向产物：`exported.spec.ts`，标准 Playwright TC，不导入 Playbook。
- 契约：schemaVersion 1，类型见 [SDK](../../src/index.ts)；Playwright 版本见 [package.json](../../package.json)。
- 运行目标：合成 HTML 页面，dataMode 为 fixture；无身份认证和网络访问，无业务写入。每个测试重新挂载页面，可安全再次运行。

## 对应关系

| 原流程 | Playbook step | 保留的结果检查 |
|---|---|---|
| 输入 poster | query | 输入值等于 poster |
| 点击 Search | search | 可访问表格只剩表头与一条结果，共两行 |
| 点击 Poster design 的 Preview | preview | Task preview 对话框与 Poster brief 标题可见 |

`mountCatalog` 仍在测试 beforeEach 中运行。共享脚本只接收 page，没有迁移测试 hooks。原断言全部保留，没有新增数据库或现场环境假设。反向独立导出用 `test.step` 保留步骤分组，呈现文案不参与业务断言。

## 验证

本仓库 `npm run check` 会编译契约和所有示例、检查执行顺序与失败传播，再运行三种入口的浏览器测试。`test:negative` 将 fixture 标题改成 Changed task，要求原始、共享与独立 TC 都因找不到预期 Poster brief 而失败。

运行与检查方法见[检查与排错](../../docs/verification.md)。此示例使用合成页面；接入真实服务后，需要分别验证认证、业务结果、资源恢复和桌面呈现。独立导出是快照，源流程修改后需要同步。
