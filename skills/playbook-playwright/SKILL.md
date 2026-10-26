---
name: playbook-playwright
description: 兼容旧调用名 $playbook-playwright；使用同级 playbook-wright 的完整指引，为 Playbook 编写、维护或转换演示脚本。
---

# playbook-wright 的旧调用名兼容入口

当前随包 Skill 版本 **0.10.1**。用户通过 `$playbook-playwright` 调用时，先读取同级主 Skill [playbook-wright](../playbook-wright/SKILL.md)，再按其要求和本次目标读取主 Skill 中引用的资源并完成任务。主 Skill 的相对引用以 `playbook-wright/` 为基准，不在本目录查找或复制一份旧契约。

后续向用户推荐 `$playbook-wright`；本次旧名称调用照常执行，不要求用户改写需求。产品名仍为 Playbook。

若同级主 Skill 缺失或不可读，明确说明兼容入口安装不完整，使用 Playbook 安装页修复两个入口；不要虚构已加载、悄悄安装到个人目录或凭记忆生成过时脚本。已有任务授权和业务数据边界继续保留。
