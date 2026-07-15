# 个人报销系统：模型部署交接说明

> 这是交接包的首要入口。先完成“安全边界检查”，再安装或运行。

## 1. 交付目标

这是一个仅在目标 Mac 本机运行的个人报销工具源码包。你的任务是：理解现有系统、重建依赖、验证构建、启动前端与本地 API，并让最终用户能够按照 `USER_GUIDE.md` 使用。

本次交付不是公网部署，不需要域名、云服务器或数据库。除非用户另行明确要求，不要修改业务规则、数据结构、飞书字段或页面交互。

建议按以下顺序读取：

1. 本文件 `START_HERE_AI.md`
2. `AGENTS.md`
3. `MEMORY.md`
4. `PROJECT_CONTEXT.md`
5. `README.md`
6. 需要排查时再阅读代码

## 2. 安全边界检查

交接包应该只包含源码、模拟数据和空白配置模板。开始部署前确认：

- 存在 `.env.local.example`，但不存在 `.env.local`。
- `public/real-samples/` 为空，只允许有说明用的 `.gitkeep`。
- `public/reimbursement-results/` 为空，只允许有说明用的 `.gitkeep`。
- 不存在 Musk 的真实 `.xlsx`、`.xls`、账单 `.csv`、报销结果或验证截图。
- 不存在 `node_modules/`、`dist/`、`release/` 或 `.git/`。

不要向用户索要 Musk 原电脑的飞书凭据，也不要把目标用户后来创建的 `.env.local` 回传给任何模型、聊天或代码仓库。

交接包按设计不带原项目 Git 历史。仅部署时不需要初始化 Git；如用户要求继续开发，应先完成隐私检查，再由用户决定是否初始化新仓库或绑定远程地址。

## 3. 系统能力与三页工作流

系统支持微信、支付宝、银行卡和信用卡的 `.xlsx`、`.xls`、`.csv` 账单，统一为消费记录后完成三页流程：

1. 上传账单
   - 多文件解析、平台识别和字段统一。
   - 可上传以前导出的报销结果，恢复勾选和编辑字段。
   - 可恢复当前浏览器主动保存的本地进度。
2. 消费筛选
   - 表头多选、包含/反选、级联候选、金额排序、列拖动和隐藏。
   - 用户最终确认公司消费并编辑报销月份、报销人、项目、费用类别和备注。
   - 可按大额消费、携程订单、工作日餐饮和高速费规则辅助筛入。
3. 报销结果
   - 复核和编辑已选记录。
   - 可按“节假日前后高速”规则筛除，并复原最近一次对应筛除。
   - 导出 Excel、CSV，生成结构化凭证；飞书同步为可选能力。

关键业务边界：自动分类和自动筛入只提供建议或补空值，不能覆盖用户已填写字段，也不能替代用户的最终选择。

## 4. 技术栈与代码地图

- React 19 + TypeScript + Vite 8：前端页面与本地开发服务器。
- `src/App.tsx`：三页界面、筛选状态、恢复、本地进度、结果规则和飞书调用编排。
- `src/types/expense.ts`：统一消费记录与报销记录类型。
- `src/config/fieldMappings.ts`：不同账单平台的字段映射；新增兼容字段优先在这里维护。
- `src/config/holidayWindows.ts`：节假日、调休和规则日期窗口。
- `src/utils/parseBills.ts`：原始账单解析、平台识别和字段统一。
- `src/utils/parseReimbursementResults.ts`：历史报销结果导入。
- `src/utils/classifyExpense.ts`：报销项目与费用类别推荐，只补空值。
- `src/utils/initialReimbursementSelection.ts`：四类自动筛入规则。
- `src/utils/exporters.ts`：Excel 与 CSV 导出。
- `src/utils/reimbursementSync.ts`：稳定 `同步ID` 和飞书记录转换。
- `server/feishuServer.ts`：本地飞书 API、字段补齐、按 `同步ID` 更新或新增、失败计数。
- `scripts/dev.mjs`：同时启动飞书 API 与 Vite 前端。
- `scripts/create-friend-package.mjs`：白名单生成 macOS 源码交接包。

前端通过 Vite 将 `/api` 代理到 `http://127.0.0.1:8787`。默认地址：

- 前端：`http://127.0.0.1:5173/`
- 飞书本地 API：`http://127.0.0.1:8787/`

## 5. 环境要求

- macOS
- Node.js 满足 `^20.19.0 || >=22.12.0`
- npm
- 首次安装依赖时可访问 npm 软件源
- 推荐使用 Safari、Chrome 或 Edge 的当前版本

推荐安装 Node.js 22.12 或更新的 LTS 版本。不要使用 Node.js 20.18 及更早版本。

## 6. 标准部署步骤

在目标 Mac 上把压缩包完整解压到普通本地目录，不要在压缩包预览窗口里运行文件。打开“终端”，进入解压后的项目目录：

```bash
cd <项目目录>
```

如果文件来自飞书、微信或浏览器下载，先清除当前项目目录的 macOS 隔离标记：

```bash
xattr -dr com.apple.quarantine .
chmod +x start.command
```

然后执行：

```bash
node -v
npm -v
npm ci
npm run test:package
npm run lint
npm run build
npm run dev
```

保持终端窗口打开，在浏览器访问：

```text
http://127.0.0.1:5173/
```

也可以在依赖安装完成后双击 `start.command`。关闭运行服务的终端窗口，或在终端按 `Control + C`，即可停止工具。

## 7. 部署验收

不要只以“页面能打开”作为完成标准。至少完成以下检查：

1. `npm run test:package`、`npm run lint`、`npm run build` 均以状态码 `0` 结束。
2. `npm run dev` 同时启动前端和本地 API。
3. 页面可在 `http://127.0.0.1:5173/` 打开。
4. 分别识别 `sample-data/` 中的模拟文件：
   - `wechat-sample.csv`
   - `alipay-sample.csv`
   - `bank-card-sample.csv`
5. 能从“上传账单”进入“消费筛选”，勾选公司消费并进入“报销结果”。
6. 能导出一份 Excel 或 CSV，金额和中文字段可读。
7. 不要执行飞书同步，除非目标用户主动提供自己的有效配置和目标表权限。

Vite 可能提示单个构建分块超过 500 kB；当前这是已知的性能警告，不代表构建失败。只有命令非零退出时才视为构建失败。

## 8. 飞书同步，可选

不需要飞书同步时，不创建 `.env.local`，其余功能仍可使用。

需要同步到目标用户自己的飞书多维表格时：

```bash
cp .env.local.example .env.local
```

只在目标 Mac 本机填写：

```env
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_BITABLE_APP_TOKEN=
FEISHU_TABLE_ID=
FEISHU_TABLE_NAME=报销记录
```

应用需要目标多维表格读写权限。服务会检查并补齐字段，通过稳定的 `同步ID` 更新已有记录或插入新记录，并分别返回新增、更新和失败数量。不得把部分失败描述成全部成功。

## 9. 数据与跨设备限制

- 浏览器草稿保存在 `localStorage` 的 `personal-reimbursement-progress-v1`，不会随源码包迁移。
- 交接包不包含历史报销结果，因此“一键恢复上一次报销结果”默认不可用；用户可上传自己的历史导出文件恢复。
- 交接包不包含 `.env.local`，飞书配置不会迁移。
- 用户在新电脑导出的账单和报销表只保存在新电脑，是否外发由用户自己决定。
- 工具是本地优先，不等于账单永久留在浏览器；用户主动导出或配置飞书同步会产生对应的本地文件或远端记录。

## 10. 常见故障

### `start.command` 显示“已损坏”或无法打开

阅读 `IF_CANNOT_OPEN.md`，在解压目录清除隔离标记。不要把脚本移到废纸篓后继续排查。

### Node.js 版本不兼容

安装满足 `^20.19.0 || >=22.12.0` 的版本，重新打开终端，再执行 `node -v`。

### `npm ci` 失败

先保留完整错误输出，检查网络、npm 软件源、磁盘空间和 Node.js 版本。不要删除 `package-lock.json`，也不要用不锁版本的安装方式掩盖问题。

### 5173 或 8787 端口被占用

停止旧的报销工具终端进程后重试。若必须修改端口，需要同时校准 Vite 代理、本地 API、CORS 和文档，不能只改其中一个位置。

### 飞书同步失败

检查 `.env.local` 是否填写完整、飞书应用权限、目标表协作者权限和终端中的 API 错误。没有有效配置时只报告“未验证”，不要声称同步成功。

## 11. 后续开发约束

- 修改文件前遵守 `AGENTS.md`，长期决策与当前功能分别维护在 `MEMORY.md` 和 `PROJECT_CONTEXT.md`。
- 字段兼容集中维护在 `src/config/fieldMappings.ts`。
- 自动分类、自动筛入和筛除都必须保留用户控制与恢复路径。
- 修改导出时验证日期、金额数值和中文字段。
- 修改飞书同步时保留幂等更新、新增、失败数量三类结果。
- 不读取或提交真实账单、历史导出、验证截图和 `.env.local`。
- 项目没有覆盖业务功能的完整自动化测试；`test:package` 只验证交接包规则，不能替代模拟账单手工流程。
