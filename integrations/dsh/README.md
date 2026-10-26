# Playbook for DeepSeek Harness

在 DSH 左侧增加 Playbook 入口，以独立主面板展示项目、Book、Section、播放画面、运行记录和 Skill 安装。浏览器由 Playbook 自己的 Playwright 运行器控制，页面呈现层、脚本动作、断言和清理协议与 Electron 版共用；DSH 原有 Browser Tab 不需要开启远程调试。

插件内置「Playbook 使用教程」作为首次学习入口，不附带行业示例项目。教程里的 Skill 安装在 DSH 中为练习预览；需要实际安装时，请返回插件主界面的 Skill 安装页。

## 制作与安装

Playbook 的 `skills/playbook-wright/scripts/install.sh --install --framework dsh --scope user` 在 DSH Shell 中会识别当前 profile，安装 Skill 后下载、校验并安装此插件。运行中的 DSH Desktop 需要由当前智能体通过内置 `plugin_manager` 完成插件写入；安装器会保留已校验的包和 profile 配置备份，并以退出码 4 明确标记待完成。

在 Playbook 仓库根目录先运行 `npm ci`、`npm run desktop:build`。然后在 `integrations/dsh` 运行 `npm pack`，得到 `playbook-dsh-0.11.0.tgz`。将它装入 DSH 图形界面的 profile，例如本机 Web profile：

```sh
dsh plugin --profile web add ./playbook-dsh-0.11.0.tgz
dsh web
```

若 DSH 的 pnpm 在首次安装时提示 `Ignored build scripts: esbuild`，在该隔离 profile 的 `pnpm-workspace.yaml` 中将 `allowBuilds.esbuild` 设为 `true` 后重试。只需放行这一项；安装成功后用 `dsh --profile web --dump-config` 确认出现 `playbook-dsh` 层。

也可在本机 Playbook checkout 中用 `npm run bundle:runtime` 后，将 `integrations/dsh` 作为本地链接安装。打包时 `prepack` 会重新收集已构建的 Playbook 运行文件；它不会修改 Electron 入口或 `package:mac` 流程。

插件服务仅监听本机 `127.0.0.1:43188`。该端口需要空闲，DSH 与受控 Chrome 需要运行在同一台机器；当前版本的 DSH 远程 Web 客户端不能通过远端浏览器控制本机 Playbook。演示使用本机 Google Chrome。项目设置与运行记录写到 `$DSH_HOME/playbook`，与 Electron 版用户数据隔离。插件停用时会请求停止当前演示并等待资源释放回执。

页签内提供画面、暂停/继续/停止、手动交接、元素批注、旁白、PPTX 导出和历史记录。PPTX 保存在 `$DSH_HOME/playbook/exports`，可从运行记录下载。添加项目或选择 Skill 项目目录时输入绝对路径；写入 Skill 仍须在界面中查看预览后点击安装。

## 验证

使用不含真实业务数据的项目，检查：项目和 Book 可见；播放时画面、箭头和光圈可见；暂停后选择元素并保存批注；继续、停止后清理回执完成；重新打开记录仍保留批注；Electron 的 `npm run desktop:build`、`npm run desktop:smoke` 继续通过。

此插件适配 DSH `0.2.1-rc.2` 至 `0.2.x` 的客户端包协议。DSH 的插件 API 仍在预览阶段，升级 DSH 后应先用隔离 profile 重验页签注册和运行控制。
