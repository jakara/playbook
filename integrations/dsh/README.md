# Playbook for DeepSeek Harness

在 DSH 左侧增加 Playbook 入口，以独立主面板展示项目、Book、Section、播放画面、运行记录和 Skill 安装。浏览器由 Playbook 自己的 Playwright 运行器控制，页面呈现层、脚本动作、断言和清理协议与 Electron 版共用；DSH 原有 Browser Tab 不需要开启远程调试。

插件内置「Playbook 使用教程」作为首次学习入口，不附带行业示例项目。教程里的 Skill 安装在 DSH 中为练习预览；需要实际安装时，请返回插件主界面的 Skill 安装页。

## 制作与安装

Playbook 的 `skills/playbook-wright/scripts/install.sh --install --framework dsh --scope user` 在 DSH Shell 中会识别当前 profile，安装 Skill 后从 npm 注册表安装 `playbook-dsh@0.11.4`。运行中的 DSH Desktop 需要通过插件管理界面安装；安装器会备份 profile 配置，并以退出码 4 提示改在 DSH 内操作。

在 DSH 的「插件 → 添加插件」中输入 `playbook-dsh@0.11.4`，选择 npm 注册表并确认来源、版本。已有从本地 `.tgz` 安装的旧版时，先在 DSH 插件管理界面卸载旧插件，再按包名安装；项目设置和运行记录保存在 `$DSH_HOME/playbook`，卸载插件依赖不会删除它们。DSH 0.2.1-rc.3 尚不提供第三方插件的详情页更新按钮；支持注册表插件更新的 DSH 版本发布后，详情页才能检查新版并提供更新操作。

在隔离 Web profile 中也可通过命令安装：

```sh
dsh plugin --profile web add playbook-dsh@0.11.4
dsh web
```

插件使用预先发布的 WebAssembly 编译依赖，安装时无需批准 `esbuild` 构建脚本，也无需调整 DSH 的构建脚本权限。安装成功后用 `dsh --profile web --dump-config` 确认出现 `playbook-dsh` 层。

维护者在 Playbook 仓库根目录运行 `npm ci`、`npm run desktop:build`，然后在 `integrations/dsh` 运行 `npm pack` 核对待发布内容。`prepack` 会重新收集已构建的 Playbook 运行文件并检查应用、Skill、插件与安装器版本一致；发布到 npm 注册表后，用户按包名安装，以便 DSH 识别注册表来源。

插件启动时由系统在本机 `127.0.0.1` 分配空闲端口，页签自动获取当前实例的地址；DSH 与其他发行版可同时运行，无需配置端口。DSH 与受控 Chrome 需要运行在同一台机器；当前版本的 DSH 远程 Web 客户端不能通过远端浏览器控制本机 Playbook。演示使用本机 Google Chrome。项目设置与运行记录写到 `$DSH_HOME/playbook`，与 Electron 版用户数据隔离。插件停用时会请求停止当前演示并等待资源释放回执。

插件播放或 PPTX 导出结束后会关闭本轮 Chrome 和后台运行器。宿主意外断开时，运行器也会关闭自身浏览器并退出；未确认的执行与清理结果保留给重启后的核对，不改写成成功。项目登记、历史记录与快照不会随进程退出而删除。

页签内提供画面、暂停/继续/停止、手动交接、元素批注、旁白、PPTX 导出和历史记录。PPTX 保存在 `$DSH_HOME/playbook/exports`，可从运行记录下载。添加项目或选择 Skill 项目目录时会打开 DSH 的文件夹选择窗口；取消选择不会添加项目或写入 Skill。写入 Skill 仍须在界面中查看预览后点击安装。

## 验证

使用不含真实业务数据的项目，检查：项目和 Book 可见；播放时画面、箭头和光圈可见；暂停后选择元素并保存批注；继续、停止后清理回执完成；重新打开记录仍保留批注；Electron 的 `npm run desktop:build`、`npm run desktop:smoke` 继续通过。

此插件适配 DSH `0.2.1-rc.2` 至 `0.2.x` 的客户端包协议。DSH 的插件 API 仍在预览阶段，升级 DSH 后应先用隔离 profile 重验页签注册和运行控制。
