# OpenCode Go 余额监控

多账号 OpenCode Go 用量余额监控服务。通过已有 cookie 登录，后台定时轮询，网页仪表盘集中展示。

## 功能

- **多账号管理** — 支持添加多个 OpenCode Go 账号，独立查询互不干扰
- **用量仪表盘** — 滚动 / 每周 / 每月用量百分比 + 重置倒计时
- **余额展示** — 订阅余额 + 邀请奖励余额实时计算
- **每日用量** — 当日 API 花费总额 + Top 5 模型用量排行
- **拖拽排序** — 账号管理页拖拽调整展示顺序
- **后台轮询** — 每 5 分钟自动抓取最新数据
- **简单认证** — 密码登录保护

## 快速开始

### 本地开发

```bash
# 1. 安装依赖
npm install
cd client && npm install && cd ..

# 2. 配置环境变量（可选，默认值可用）
cp .env.example .env

# 3. 启动后端
npm start

# 4. 另一个终端启动前端开发服务器
cd client && npm run dev
```

- 后端：http://localhost:3456
- 前端开发：http://localhost:5173（自动代理 API 到后端）

### Docker 部署

```bash
# 构建并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

访问 http://localhost:3456

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3456` | 服务端口 |
| `APP_PASSWORD` | `admin123` | 登录密码 |
| `JWT_SECRET` | `change-me-in-production` | JWT 签名密钥，生产环境务必修改 |
| `POLL_INTERVAL_MINUTES` | `5` | 后台轮询间隔（分钟） |

## 获取 Cookie

1. 浏览器登录 https://opencode.ai
2. 打开 DevTools → Application → Cookies
3. 复制 `auth` cookie 的值
4. 在管理页面添加账号时填入

Workspace ID 在 URL 中：`https://opencode.ai/workspace/{WORKSPACE_ID}/go`

## 技术栈

- **后端**：Node.js + Express + sql.js (SQLite)
- **前端**：Vue 3 + Vite + Element Plus
- **部署**：Docker + docker-compose

---

# OpenCode Go Balance Monitor（English）

A multi-account OpenCode Go usage and balance monitoring service with web dashboard.

## Features

- **Multi-account** — Manage multiple OpenCode Go accounts with isolated queries
- **Usage Dashboard** — Rolling / Weekly / Monthly usage percentage + reset countdown
- **Balance** — Subscription balance + invitation reward balance calculation
- **Daily Usage** — Total daily API cost + Top 5 model breakdown
- **Drag & Drop** — Reorder accounts on the management page
- **Background Polling** — Auto-refresh every 5 minutes
- **Auth** — Simple password-based login

## Quick Start

### Local Development

```bash
npm install
cd client && npm install && cd ..
cp .env.example .env
npm start          # Backend on :3456
cd client && npm run dev  # Frontend dev on :5173
```

### Docker

```bash
docker compose up -d
```

Access at http://localhost:3456

### Environment Variables

| Variable | Default | Description |
|------|--------|------|
| `PORT` | `3456` | Server port |
| `APP_PASSWORD` | `admin123` | Login password |
| `JWT_SECRET` | `change-me-in-production` | JWT signing secret |
| `POLL_INTERVAL_MINUTES` | `5` | Polling interval (minutes) |

## Get Your Cookie

1. Log in to https://opencode.ai in your browser
2. DevTools → Application → Cookies
3. Copy the `auth` cookie value
4. Add it in the Accounts management page

Workspace ID is in the URL: `https://opencode.ai/workspace/{WORKSPACE_ID}/go`

## Tech Stack

- **Backend**: Node.js + Express + sql.js (SQLite)
- **Frontend**: Vue 3 + Vite + Element Plus
- **Deploy**: Docker + docker-compose

---

# OpenCode Go 餘額監控（繁體中文）

多帳號 OpenCode Go 用量餘額監控服務，透過網頁儀表板集中展示。

## 功能

- **多帳號管理** — 支援新增多個 OpenCode Go 帳號，獨立查詢互不干擾
- **用量儀表板** — 滾動 / 每週 / 每月用量百分比 + 重置倒數計時
- **餘額展示** — 訂閱餘額 + 邀請獎勵餘額即時計算
- **每日用量** — 當日 API 花費總額 + Top 5 模型用量排行
- **拖曳排序** — 帳號管理頁面拖曳調整展示順序
- **背景輪詢** — 每 5 分鐘自動擷取最新資料
- **簡易認證** — 密碼登入保護

## 快速開始

### 本地開發

```bash
npm install
cd client && npm install && cd ..
cp .env.example .env
npm start
cd client && npm run dev
```

### Docker 部署

```bash
docker compose up -d
```

存取 http://localhost:3456

### 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `PORT` | `3456` | 服務埠號 |
| `APP_PASSWORD` | `admin123` | 登入密碼 |
| `JWT_SECRET` | `change-me-in-production` | JWT 簽名金鑰 |
| `POLL_INTERVAL_MINUTES` | `5` | 輪詢間隔（分鐘） |

## 取得 Cookie

1. 瀏覽器登入 https://opencode.ai
2. DevTools → Application → Cookies
3. 複製 `auth` cookie 的值
4. 在帳號管理頁面新增時填入

Workspace ID 在網址中：`https://opencode.ai/workspace/{WORKSPACE_ID}/go`

## 技術棧

- **後端**：Node.js + Express + sql.js (SQLite)
- **前端**：Vue 3 + Vite + Element Plus
- **部署**：Docker + docker-compose
