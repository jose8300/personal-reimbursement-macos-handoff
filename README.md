# 个人报销自动化小工具 MVP

一个本地运行的 React MVP，用于上传微信、支付宝、银行卡、信用卡等 `.xlsx` / `.xls` / `.csv` 账单文件，统一解析消费明细，辅助筛选公司消费，生成报销表并导出 Excel / CSV，也可恢复历史进度和同步到飞书多维表格。

## 项目结构

```text
.
├── sample-data/               # 2-3 份模拟账单 CSV
├── server/
│   └── feishuServer.ts        # 飞书多维表格本地 API
├── src/
│   ├── config/
│   │   ├── fieldMappings.ts   # 不同平台字段映射配置
│   │   └── holidayWindows.ts  # 节假日与调休日期配置
│   ├── types/
│   │   └── expense.ts         # 消费和报销数据类型
│   ├── utils/
│   │   ├── exporters.ts       # 报销表 Excel / CSV 导出
│   │   ├── parseBills.ts      # 原始账单解析和字段统一
│   │   └── parseReimbursementResults.ts # 历史报销结果导入
│   ├── App.tsx                # 三个模块页面
│   ├── App.css
│   └── index.css
├── PROJECT_CONTEXT.md         # 当前功能、工作流与交互约定
├── package.json
└── vite.config.ts
```

## 安装依赖

```bash
npm ci
```

## 本地启动

```bash
npm run dev
```

启动后访问终端显示的本地地址，通常是 `http://127.0.0.1:5173/`。

`npm run dev` 会同时启动：

- Vite 前端：`http://127.0.0.1:5173/`
- 飞书本地 API：`http://127.0.0.1:8787/`

## macOS 本机源码交接包

如果要把系统迁移到另一台 Mac，让另一个模型部署并交给朋友使用，生成统一交接包：

```bash
npm run package:handoff
```

生成文件位于：

```text
release/personal-reimbursement-macos-handoff.zip
```

压缩包有两个主要入口：

- `START_HERE_AI.md`：另一个模型首先读取，包含代码总结、部署步骤、验证标准和开发约束。
- `USER_GUIDE.md`：朋友阅读，包含启动、三页工作流、导出、隐私和常见问题。

这个压缩包只包含运行所需源码、项目上下文、配置模板、模拟数据和说明，默认排除：

- `.env.local`
- `.git/`
- `node_modules/`
- `dist/`
- `release/`
- `public/real-samples/`
- `public/reimbursement-results/`
- 项目根目录下的真实账单、历史报销结果和验证截图

朋友可双击 `start.command` 启动。若 macOS 提示脚本“已损坏，无法打开”，按 `IF_CANNOT_OPEN.md` 清除解压目录的隔离标记。飞书同步是可选功能，只能使用目标用户自己的配置。

旧命令 `npm run package:friend` 保留为兼容别名，生成同一个 macOS 交接包。

不要把你自己的 `.env.local`、真实账单、历史导出报销表或验证截图发给朋友。

## 飞书多维表格同步

复制 `.env.local.example` 为 `.env.local`，填写飞书自建应用和目标多维表格配置：

```env
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_BITABLE_APP_TOKEN=
FEISHU_TABLE_ID=
FEISHU_TABLE_NAME=报销记录
```

如果多维表格链接类似 `https://xxx.feishu.cn/base/ZEOU...`，`base/` 后面的这一段就是
`FEISHU_BITABLE_APP_TOKEN`。`FEISHU_TABLE_ID` 可以留空，系统会自动查找或创建
`FEISHU_TABLE_NAME` 对应的数据表。

在“报销结果”页点击“同步到飞书”后，系统会：

- 自动检查并补齐多维表字段
- 生成 `同步ID`，已有记录更新，新增记录插入
- 返回新增、更新、失败数量

重复同步同一记录时会按 `同步ID` 更新，不会重复插入。飞书应用还需要目标多维表的读写权限。

## 测试数据

可以直接上传 `sample-data` 目录里的三个 CSV：

- `wechat-sample.csv`
- `alipay-sample.csv`
- `bank-card-sample.csv`

## 已实现功能

- 上传多个 Excel / CSV 文件
- 自动识别消费时间、金额、交易类型、交易对方、商品说明、账单备注、支付账户和来源平台
- 字段映射集中维护在 `src/config/fieldMappings.ts`
- Excel 式表头筛选、包含/反选、多选、级联选项和金额排序
- 拖动列顺序、显示或隐藏列
- 勾选公司消费并填写报销月份、报销人、项目、费用类别和备注
- 按大额消费、携程订单、工作日餐饮、高速费规则批量筛入
- 根据交易文本推荐费用类别和报销项目，保留用户手工填写值
- 生成报销结果表
- 按节假日前后高速规则筛除结果，并可复原最近一次筛除
- 上传以前导出的报销结果，恢复勾选和编辑内容
- 一键恢复项目内保存的上一次报销结果
- 手动保存和恢复当前浏览器中的本地进度
- 导出 Excel / CSV
- 生成结构化消费凭证图片
- 同步报销结果到飞书多维表格

本地进度保存在当前浏览器的 `localStorage`，不会自动同步到其他设备。项目内的一键恢复文件位于 `public/reimbursement-results/`。

## 验证

项目当前有交接包规则检查，但尚无覆盖业务功能的完整自动化测试。修改后至少执行：

```bash
npm run test:package
npm run lint
npm run build
```

`npm run test:package` 只验证打包白名单和隐私排除规则，不能替代业务流程验证。涉及账单流程时，还应使用 `sample-data/` 手工验证上传、筛选和导出；涉及飞书时需要明确是否使用有效凭据实际同步。

## 后续可升级

- 为解析、分类、恢复、导出和同步转换增加自动化测试
- 增加比浏览器 `localStorage` 更可靠的本地持久化
- 根据实际使用反馈继续调整公司消费推荐规则
