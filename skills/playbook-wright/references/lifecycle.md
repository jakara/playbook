# Profile 取消、清理与崩溃恢复

本页说明 Profile 的取消、清理与恢复接口；`schemaVersion: 1` 不变。新能力均可选，旧 `prepare({ page, workspaceDir, parameters }) → { context, release? }` 继续播放。应用协调取消、预算、回执与恢复；资源归属、保留/删除策略和精确释放由业务 Profile 判断，不为旧 run 自动开启 purge。

## 生命周期与取消

一次 Book/Section 播放仍共享 BrowserContext，各脚本新建 page、独立 prepare/release。前段清理没有确认成功时不启动后段。Profile 不关闭应用持有的 Browser/BrowserContext；仅释放自己创建、可确认归属的资源与 hooks。

`prepare` 新增可选输入：

```ts
{
  page, workspaceDir, parameters,
  signal?: AbortSignal,
  runId?: string,
  flowId?: string,
  registerCleanup?: (callback: PlaybookCleanup,
    options?: { id: string; recovery?: JsonValue }) => Promise<void>
}
```

`signal` 用于业务执行取消：停止后不启动后续步骤，但不会自动撤销已经发出的写入。将它显式传给支持 AbortSignal 的业务 helper，或保存在自定义 Context 供 run/verify 检查；应用不把 signal 自动注入业务 Context。Playwright 调用本身不因取得该 signal 就能被任意中断。旧脚本不响应取消时，客户端会等待执行停止宽限，不能把“发出停止”当作“已停止/已清理”。

停止旁白和呈现等待不等于资源已经释放。正常关窗与 Quit 会先协调停止、清理并保存回执；不要为了让界面尽快消失而在 Profile 外提前关闭浏览器。系统强杀、崩溃或不合作回调无法保证执行 finally，需依赖回执和可选恢复契约。

## 提前登记与释放

资源创建**之前** `await registerCleanup(...)`，保证清理责任先写入本轮回执；登记失败时不要继续创建资源。回调可以捕获运行时对象用于本轮清理，但恢复句柄只能是非敏感 JSON。没有新能力的旧调用方仍需自己的 try/finally，不能只使用可选链登记后便假定 TC 也有桌面清理保障。

`PlaybookCleanup = (options?: { signal, reason, runId, flowId, scopeId }) => Promise<void>`。旧无参数 release 兼容；新回调参数可选，调用方未传时不能直接解构。清理 signal 来自独立清理预算，**不是已取消的执行 signal**；reason 是 completed、failed 或 stopped。清理 helper 应在需要时响应这个独立 signal。

规则如下：

- 相同函数对象按 identity 去重，登记后又 `return { context, release: 同一函数 }` 只执行一次。相同 `id` 指向不同函数会被拒绝；不同闭包即使内容相同也不自动视为相同责任。不要同时返回一个包装函数来调用已登记的 release。
- 取得返回的 release 先于 context 校验，所以错误 context 仍须执行已经取得的有效 release。prepare 部分创建后抛错时，已成功登记的回调仍被执行。
- 回调按登记的逆序（LIFO）执行，本轮不自动重试；某项失败仍尝试剩余责任。幂等并不等于任意重复调用安全，业务需定义重试边界。
- 停止意图持续有效，release 返回后仍需按 stopped 处理，不能覆盖成 completed。执行错误与清理错误分别保留；不能用 finally 的新错误吞掉原始失败。
- 清理结束后才确定终态。界面显示停止/清理中的状态与清理回执；失败、超时和结果未知必须如实保留。回调成功仅表示其业务策略执行成功，不等于所有业务数据都被删除。

Profile 可选配置：

```ts
lifecycle: { stopTimeoutMs: 30000, cleanupTimeoutMs: 60000 }
```

两项均为 `1000..300000` 的整数毫秒；默认执行停止宽限 30 秒、每次 prepare 对应整组资源释放的独立预算 60 秒。不要为 12 秒或 25 秒的合法清理继续套用旧 8 秒终止逻辑。超时或 worker 被迫结束时不能确认仍在运行的动作结果，保留未完成/未知回执，不能写成已成功停止。

## 崩溃恢复契约

Profile 可选声明：

```ts
recovery: {
  version: 'file-fixture-v1',
  async recover({ runId, flowId, scopeId, cleanupId, handle, workspaceDir, signal }) {
    // 只核验并释放 handle 明确指定、确属这轮的资源；必须幂等。
  },
}
```

登记时 `{ id: 'owned-file', recovery: 精确资源句柄 }` 要求 Profile 已声明 recovery。句柄可为 JSON 标量/数组/对象，不能含密码、token、密钥、凭据或连接串；不要写入整份 parameters、环境变量、认证响应或可执行代码。持久化句柄不序列化 callback 闭包，也不保证运行时才取得的秘密能在恢复时自动重建。

重启识别未结束清理并显示回执。恢复须由用户明确点击；核对 workspace、Profile、run、recovery.version 与本轮源码快照版本，不匹配则人工核对。恢复不调用 prepare、不重跑业务步骤、不扫描或猜测资源，也不对旧 Profile 自动 purge。没有恢复声明的旧 Profile 兼容播放，但崩溃后只能提示人工核对，不能声称自动清理完成。

`scopeId + cleanupId` 是固定重试键。强杀可能发生在业务已删除资源、但成功回执尚未保存的间隙，因此相同恢复入口可能再次收到同一键和句柄；已确认成功的责任不会再调用。业务用资源归属记录、幂等删除或自身持久化幂等键抵御重复，不靠“应用只会调用一次”保证安全。资源创建前需要可确定的精确标识；先创建再登记会留下不可恢复的崩溃窗口。

## 最小文件资源接入示例

以下只创建隔离的本地 fixture 文件。保留策略由 Profile 决定：只有明确 `cleanupPolicy: 'purge'` 才删除，缺省保留；不据此修改任何既有业务 Profile 的策略。替换成业务资源时继续使用准确句柄与同等归属校验，不复制成目录扫描清理器。

```ts
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineProfile, type JsonValue, type PlaybookContext } from '@playbook/core';

type Handle = { resourceId: string; purge: boolean };
interface Context extends PlaybookContext { signal?: AbortSignal }
const segment = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const readHandle = (value: JsonValue): Handle => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.resourceId !== 'string' || !segment(value.resourceId)
    || typeof value.purge !== 'boolean') throw new Error('Invalid fixture handle');
  return { resourceId: value.resourceId, purge: value.purge };
};
const rootFor = async (workspaceDir: string) =>
  path.join(await realpath(workspaceDir), '.playbook-file-fixture');
async function removeOwned(workspaceDir: string, runId: string, value: JsonValue, signal?: AbortSignal) {
  const handle = readHandle(value);
  if (!segment(runId)) throw new Error('Invalid fixture run');
  if (!handle.purge) return;
  signal?.throwIfAborted();
  try {
    const root = await rootFor(workspaceDir);
    const info = await lstat(root);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Invalid fixture root');
    const file = path.join(root, `${runId}-${handle.resourceId}.json`);
    const owner = JSON.parse(await readFile(file, 'utf8'));
    if (owner.kind !== 'playbook-file-fixture-v1' || owner.runId !== runId
      || owner.resourceId !== handle.resourceId) throw new Error('Fixture ownership mismatch');
    signal?.throwIfAborted();
    await rm(file); // 精确的单文件；ENOENT 作为已经清理，支持同一恢复键重试。
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
export default defineProfile<Context>({
  schemaVersion: 1, id: 'owned-file-fixture', title: '本地文件 fixture',
  dataMode: 'fixture', roles: [],
  lifecycle: { stopTimeoutMs: 30000, cleanupTimeoutMs: 60000 },
  recovery: {
    version: 'file-fixture-v1',
    async recover({ workspaceDir, runId, handle, signal }) {
      await removeOwned(workspaceDir, runId, handle, signal);
    },
  },
  async prepare({ page, workspaceDir, parameters, signal, runId, registerCleanup }) {
    // 此示例需要支持提前登记的桌面；TC 请复用 helper 并用自己的 fixture/finally。
    if (!runId || !segment(runId) || !registerCleanup) throw new Error('Lifecycle host required');
    const handle = { resourceId: randomUUID(), purge: parameters.cleanupPolicy === 'purge' };
    const release = async (options?: { signal: AbortSignal }) =>
      removeOwned(workspaceDir, runId, handle, options?.signal);
    await registerCleanup(release, { id: 'owned-file', recovery: handle });
    signal?.throwIfAborted();
    const root = await rootFor(workspaceDir);
    await mkdir(root, { recursive: true });
    const info = await lstat(root);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Invalid fixture root');
    await writeFile(path.join(root, `${runId}-${handle.resourceId}.json`), JSON.stringify({
      kind: 'playbook-file-fixture-v1', runId, resourceId: handle.resourceId,
    }), { flag: 'wx' });
    signal?.throwIfAborted();
    return { context: { page, signal }, release }; // 同一函数，桌面不重复调用。
  },
});
```

这是接入形状示例，不是客户业务自动恢复的完成证据。实接前分别验证 prepare 部分失败、停止、超时、执行与清理同时失败、强杀及重复恢复。不要为启用演示而删除历史数据、旧 run 或失败证据。

## TC 双向转换

`runPlaybook` 仍仅按步骤执行 run/verify 和调用方 hooks；它不执行 Profile、不自动登记/调用 release，也不隐式新增 AbortController。测试取消需要调用方已有 signal、闭包或显式 Context，并由测试 fixture/setup/teardown 管理。

TC → Playbook 时将合适的业务资源 helper 放入 Profile，明确桌面取消与恢复适配；原 TC 的 fixture 清理不删除。Playbook → TC 时保留清理语义和原始错误，把资源准备/释放放回测试自己的 fixture/finally；不能仅复制 prepare 调用后忘掉其 registerCleanup 依赖，也不能把客户端恢复 UI 当作 CI 清理器。分别报告旧接口兼容、可取消性、恢复声明和真实故障验证范围。
