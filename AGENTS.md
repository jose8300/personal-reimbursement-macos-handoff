# 个人报销系统执行规则

## 项目定位

- 本地运行的个人报销自动化工具。
- 目标是解析微信、支付宝、银行卡和信用卡账单，统一消费记录，筛选公司消费，生成报销结果并同步飞书多维表格。
- 当前阶段：已有可运行 MVP，继续优化稳定性、交互和自动化能力。

## 会话启动

执行会修改文件或外部状态的任务前：

1. 阅读本文件、`MEMORY.md`、`PROJECT_CONTEXT.md` 和 `README.md`。
2. 检查 `git status`。原仓库已有文档提交，但大部分源码和现有文件仍未跟踪，必须继续视为用户资产。macOS 交接包按设计不包含 `.git`；目标电脑只做部署时可以继续，不得虚构历史或自行绑定远程仓库。
3. 检查现有实现后再修改，尤其是字段映射、账单解析、导出和飞书同步。
4. 明确用户可见结果和验证方式。

## 技术栈与目录

- React 19 + TypeScript + Vite 8
- `src/config/`：不同账单平台的字段映射
- `src/utils/`：账单解析、格式化和导出
- `src/types/`：消费与报销数据类型
- `server/feishuServer.ts`：飞书本地 API
- `sample-data/`：模拟账单
- `public/real-samples/`、`public/reimbursement-results/`：本地样本和结果资料

## 常用命令

- 按锁定版本安装：`npm ci`
- 同时启动前端和飞书 API：`npm run dev`
- 仅启动前端：`npm run dev:client`
- 仅启动飞书 API：`npm run dev:feishu`
- 检查：`npm run lint`
- 构建：`npm run build`
- 预览构建：`npm run preview`
- 交接包规则检查：`npm run test:package`
- 生成 macOS 源码交接包：`npm run package:handoff`

项目目前只有交接包规则自动检查，没有覆盖业务功能的完整自动化测试。不得用 `npm run test:package` 代替账单流程验证，也不得笼统声称“测试通过”；应明确报告实际执行的 package test、lint、build 和手工验证。

## 修改边界

- 字段兼容优先集中维护在 `src/config/fieldMappings.ts`，避免在页面中散落平台判断。
- 不读取、展示或提交真实账单中的非任务必要隐私信息。
- `.env.local` 可能包含飞书凭据，只能记录其位置，不能复制值或提交。
- 不提交 `node_modules/`、构建产物和真实报销数据。
- 修改导出格式时，必须验证 Excel/CSV 字段、金额、日期和中文内容。
- 修改飞书同步时，必须保留已有记录更新、新记录插入和失败计数的行为。

## 完成标准

1. `npm run lint` 通过。
2. `npm run build` 通过。
3. 使用 `sample-data/` 至少验证一份账单的上传、筛选和导出。
4. 涉及飞书时，说明是否实际执行了同步；没有凭据时不得假装验证成功。
5. 检查 Git diff，确认没有真实账单、凭据或无关文件被加入。

## MEMORY.md 维护

仅记录长期业务规则、字段兼容决策、飞书同步约束、高代价踩坑和后续计划。代码中可直接查到的函数与组件细节不复制进 `MEMORY.md`。

## PROJECT_CONTEXT.md 维护

- `PROJECT_CONTEXT.md` 记录当前已实现能力、主要工作流、交互约定和仍需继续的事项，供新对话快速接手。
- 当功能现状、工作流或用户可见约定发生明显变化时，同步校准该文档。
- 临时排查过程、普通命令输出和大段聊天记录不写入该文档。
- 如项目上下文与代码不一致，以当前代码和用户最新确认的要求为准，并在本次任务中修正文档。
