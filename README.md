# OpenCode Go 余额监控

多账号 OpenCode Go 用量余额监控服务，集成 New API 渠道管理。通过已有 cookie 登录，后台定时轮询并自动翻页抓取全量数据，网页仪表盘集中展示。

## 功能

- **多账号管理** — 支持添加多个 OpenCode Go 账号，独立查询互不干扰
- **用量仪表盘** — 滚动 / 每周 / 每月用量百分比 + 实时重置倒计时
- **余额展示** — 订阅余额 + 邀请奖励余额实时计算
- **每日用量** — 当日 API 花费总额（自动翻页全量抓取）+ Top 5 模型用量排行
- **拖拽排序** — 账号管理页拖拽调整展示顺序，仪表盘同步
- **New API 渠道管理** — 关联 New API 渠道，自动同步余额和优先级/权重
- **智能算法** — 三周期健康得分算法自动计算渠道优先级和权重
- **后台轮询** — 每 5 分钟自动抓取最新用量数据
- **简单认证** — 密码登录保护（JWT）
- **响应式设计** — 手机 / 平板 / 桌面全适配
- **暗色主题** — Element Plus 暗色主题
- **Docker 部署** — 一键部署

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 从 Git 拉取

```bash
git clone https://gitee.com/zxl000/opencode-balance.git
cd opencode-balance
```

### 1. 安装依赖

```bash
# 根目录（后端依赖）
npm install

# 前端依赖
cd client && npm install && cd ..
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
PORT=3456
APP_PASSWORD=admin123
JWT_SECRET=change-me-in-production
POLL_INTERVAL_MINUTES=5

# New API 连接（HTTP API）
NEW_API_URL=http://thntime.fun:13000
NEW_API_TOKEN=your-system-access-token
NEW_API_USER_ID=1

# New API PostgreSQL 直连（余额同步用）
NEW_API_PG_HOST=thntime.fun
NEW_API_PG_PORT=5432
NEW_API_PG_USER=root
NEW_API_PG_PASSWORD=your-pg-password
NEW_API_PG_DATABASE=new-api
```

### 3. 本地开发启动

**后端**（端口 3456）：

```bash
npm start
```

**前端开发服务器**（端口 5173，自动代理 API）：

```bash
cd client && npm run dev
```

访问 http://localhost:5173

### 4. 生产构建

前端构建后由后端直接提供静态文件：

```bash
cd client && npm run build && cd ..
npm start
```

访问 http://localhost:3456

## Docker 部署

### docker-compose

```bash
cp docker-compose.yml.example docker-compose.yml
# 编辑 docker-compose.yml，确认配置
docker compose up -d
```

服务运行在 http://localhost:3456

**数据持久化**：`data/` 目录挂载到容器，数据库文件自动保存。

### 手动构建

```bash
docker build -t opencode-balance .
docker run -d -p 3456:3456 -v ./data:/app/data --env-file .env opencode-balance
```

### 更新

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## 使用说明

### 获取 Cookie

1. 浏览器登录 https://opencode.ai
2. 按 F12 打开 DevTools → Application → Cookies
3. 复制 `auth` cookie 的完整值（以 `Fe26.2**` 开头）
4. 也可以直接复制整个 Cookie 字符串（包含 `oc_locale=zh; auth=Fe26.2**...`，系统会自动识别）

### 获取 Workspace ID

1. 在 OpenCode 网站点击 "GO" 进入用量页面
2. 地址栏 URL 格式：`https://opencode.ai/workspace/{WORKSPACE_ID}/go`
3. 复制 `wrk_` 开头的那段

### 账号管理

1. 访问管理页 → **账号管理**
2. 点击"添加账号"，填入名称、Workspace ID、Auth Cookie
3. 保存后后台自动开始轮询

**新增字段**（编辑对话框）：

| 字段 | 说明 |
|------|------|
| New API 渠道 ID | 填入 New API 中对应渠道的 ID，用于关联同步 |
| 余额同步 | 开启后定时将余额同步到 New API 对应渠道 |
| 优先级同步 | 开启后定时根据算法计算优先级/权重并同步 |

### 渠道控制

1. 访问 **渠道控制** 页
2. 页面展示所有已关联 New API 渠道的账号：
   - 映射关系（账号 ↔ 渠道 ID）
   - 当前用量（滚动/周度/月度）
   - 余额同步开关 & 优先级同步开关
   - 算法计算预览（优先级、权重、健康得分）
3. 点击 **同步余额** 或 **同步优先级** 立即手动触发同步
4. 底部展示最近同步日志（成功/失败记录）

### 算法配置

1. 访问 **算法配置** 页
2. 查看算法规则说明
3. **模拟数据**：展示已关联渠道的账号用量，可手动修改数值测试算法效果
4. **参数配置**（分组调整）：
   - 周期参数：滚动/周度/月度周期长度
   - 综合得分权重：三周期权重系数
   - 时间修正系数加成上限
   - 分档与熔断：分档阈值 + 各周期熔断线
   - 同步间隔：余额和优先级自动同步间隔
5. 点击 **模拟运行** 用当前参数和（可调整的）账号数据试跑算法
6. 点击 **保存配置** 将参数持久化

### 查看用量

1. 访问仪表盘
2. 每张卡片显示：
   - 滚动用量（5 小时窗口）
   - 每周用量
   - 每月用量
   - 今日 API 花费 + Top 5 模型
   - 余额（订阅 + 邀请奖励）
3. 点击"手动刷新"立即抓取最新数据

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3456` | 服务端口 |
| `APP_PASSWORD` | `admin123` | 登录密码 |
| `JWT_SECRET` | `change-me-in-production` | JWT 签名密钥 |
| `POLL_INTERVAL_MINUTES` | `5` | 后台轮询间隔（分钟） |
| `NEW_API_URL` | — | New API 服务地址 |
| `NEW_API_TOKEN` | — | New API 系统访问令牌 |
| `NEW_API_USER_ID` | `1` | New API 用户 ID |
| `NEW_API_PG_HOST` | `localhost` | New API PostgreSQL 主机 |
| `NEW_API_PG_PORT` | `5432` | New API PostgreSQL 端口 |
| `NEW_API_PG_USER` | `root` | PG 用户名 |
| `NEW_API_PG_PASSWORD` | — | PG 密码 |
| `NEW_API_PG_DATABASE` | `new-api` | PG 数据库名 |

## 技术栈

- **后端**：Node.js + Express + sql.js (WebAssembly SQLite) + pg (PostgreSQL)
- **前端**：Vue 3 + Vite + Element Plus + Vue Router + Axios
- **认证**：JWT (jsonwebtoken)
- **部署**：Docker + docker-compose

## 项目结构

```
opencode-balance/
├── server/                    # Express 后端
│   ├── index.js               # 入口（路由注册 + 定时器）
│   ├── db.js                  # SQLite 数据库层
│   ├── scraper.js             # OpenCode 页面抓取（自动翻页）
│   ├── algorithm.js           # 优先级/权重算法引擎
│   ├── newapi-client.js       # New API HTTP 客户端
│   ├── pg-client.js           # New API PostgreSQL 直连
│   ├── logger.js              # 日志
│   ├── middleware/
│   │   └── auth.js            # JWT 认证中间件
│   └── routes/
│       ├── auth.js            # 登录 API
│       ├── accounts.js        # 账号 CRUD API
│       ├── usage.js           # 用量查询 API + 后台轮询
│       ├── channels.js        # 渠道控制 API
│       └── algorithm.js       # 算法配置 API
├── client/                    # Vue 3 前端
│   ├── src/
│   │   ├── App.vue            # 布局 + 侧边栏
│   │   ├── main.js            # 入口
│   │   ├── router/            # 路由 + 登录守卫
│   │   ├── api/               # Axios 封装
│   │   ├── utils/             # 工具函数
│   │   └── views/
│   │       ├── Login.vue          # 登录页
│   │       ├── Dashboard.vue      # 仪表盘
│   │       ├── Accounts.vue       # 账号管理
│   │       ├── ChannelControl.vue # 渠道控制
│   │       └── AlgorithmConfig.vue# 算法配置
│   └── vite.config.js
├── data/                      # SQLite 数据目录（Docker 挂载点）
├── Dockerfile
├── docker-compose.yml.example # Docker Compose 模板
├── .env.example               # 环境变量模板
└── README.md
```

## 常见问题

### 用量数据显示"暂无今日数据"

等待后台轮询（默认 5 分钟），或点击"手动刷新"按钮。

### 显示"认证过期"

Auth Cookie 已失效，需要重新从浏览器获取。OpenCode 的 cookie 有效期通常为 30 天。

### 余额同步不生效

New API 的 balance 字段为只读，系统通过直连 PostgreSQL 更新。确保 PG 连接配置正确。

### 如何修改密码

编辑 `.env` 中的 `APP_PASSWORD`，重启服务。

---

# OpenCode Go Balance Monitor（English）

Multi-account OpenCode Go usage & balance monitor with New API channel management, auto-pagination, and smart priority algorithm.

## Features

- Multi-account management with isolated queries
- Rolling / Weekly / Monthly usage dashboard with countdown
- Subscription + invitation reward balance
- Daily cost with auto-pagination + Top 5 model ranking
- Drag & drop account reordering
- New API channel management (balance sync + priority/weight sync)
- Three-cycle health score algorithm for automatic channel optimization
- JWT password authentication
- Responsive design (mobile / tablet / desktop)
- Dark theme (Element Plus)
- Docker one-command deployment

## Quick Start

```bash
git clone https://gitee.com/zxl000/opencode-balance.git
cd opencode-balance
cp .env.example .env
npm install && cd client && npm install && cd ..

# Development
npm start                    # Backend :3456
cd client && npm run dev     # Frontend :5173

# Production
cd client && npm run build && cd ..
npm start                    # :3456

# Docker
cp docker-compose.yml.example docker-compose.yml
docker compose up -d
```

## Environment Variables

| Variable | Default | Description |
|------|--------|------|
| `PORT` | `3456` | Server port |
| `APP_PASSWORD` | `admin123` | Login password |
| `JWT_SECRET` | `change-me-in-production` | JWT signing secret |
| `POLL_INTERVAL_MINUTES` | `5` | Polling interval |
| `NEW_API_URL` | — | New API URL |
| `NEW_API_TOKEN` | — | New API system access token |
| `NEW_API_USER_ID` | `1` | New API user ID |
| `NEW_API_PG_HOST` | `localhost` | New API PG host |
| `NEW_API_PG_PORT` | `5432` | New API PG port |
| `NEW_API_PG_USER` | `root` | PG username |
| `NEW_API_PG_PASSWORD` | — | PG password |
| `NEW_API_PG_DATABASE` | `new-api` | PG database name |

## Tech Stack

- **Backend**: Node.js + Express + sql.js (SQLite) + pg (PostgreSQL)
- **Frontend**: Vue 3 + Vite + Element Plus
- **Deploy**: Docker + docker-compose

---

# OpenCode Go 餘額監控（繁體中文）

多帳號 OpenCode Go 用量餘額監控服務，整合 New API 渠道管理與智能優先級算法。

## 功能

- 多帳號獨立查詢
- 滾動 / 每週 / 每月用量儀表板
- 訂閱 + 邀請獎勵餘額
- 自動翻頁每日用量 + Top 5 模型
- 拖曳排序
- New API 渠道管理（餘額同步 + 優先級/權重同步）
- 三週期健康得分算法
- JWT 密碼登入
- 響應式設計 + 暗色主題
- Docker 一鍵部署

## 快速開始

```bash
git clone https://gitee.com/zxl000/opencode-balance.git
cd opencode-balance
cp .env.example .env
npm install && cd client && npm install && cd ..
npm start
```

## 技術棧

- **後端**：Node.js + Express + sql.js (SQLite) + pg (PostgreSQL)
- **前端**：Vue 3 + Vite + Element Plus
- **部署**：Docker + docker-compose
