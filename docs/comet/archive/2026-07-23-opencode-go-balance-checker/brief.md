# Outcome

一个 Node.js Web 服务，管理多个 OpenCode Go 账号，后台持续轮询各账号的用量余额，通过网页集中展示。

# Scope

- **账号管理页**：增删改 OpenCode Go 账号（名称、workspaceId、authCookie），数据存 SQLite
- **用量仪表盘页**：展示所有账号的用量卡片，自动刷新
- **后台持续轮询**：服务启动后定时抓取每个账号的 `https://opencode.ai/workspace/{id}/go` 页面，解析并存储用量数据
- **展示数据**：滚动用量（% + 重置倒计时）、每周用量（% + 重置倒计时）、每月用量（% + 重置倒计时）、邀请奖励未使用数量

# Non-goals

- 不推送到 "new api" 或任何外部系统
- 不用量历史趋势图
- 不用量告警
- 不添加页面认证
- 不支持 OpenCode Copilot / OpenAI 等其他 provider

# Acceptance examples

- Given 访问账号管理页，When 填写账号名称、workspaceId、authCookie 并保存，Then 账号出现在列表中且信息正确
- Given 管理页已有账号，When 编辑账号名称并保存，Then 列表中显示更新后的名称
- Given 管理页已有账号，When 删除该账号，Then 列表和仪表盘中不再显示该账号
- Given 已配置至少一个有效账号，When 访问仪表盘页面，Then 每个账号显示一张卡片，包含滚动用量（百分比 + 重置倒计时）、每周用量（百分比 + 重置倒计时）、每月用量（百分比 + 重置倒计时）、邀请奖励未使用数量
- Given 服务运行中且已配置账号，When 等待 5 分钟（一个轮询周期），Then 仪表盘上自动刷新后显示最新抓取的用量数据
- Given 已配置 2 个账号，其中 1 个 authCookie 已过期，When 后台轮询执行，Then 过期账号卡片显示错误状态（如"认证过期"），正常账号仍正确显示用量数据
- Given 服务已运行且数据已持久化，When 重启服务，Then 已配置账号不丢失，上次抓取的用量数据仍可展示

# Constraints and invariants

- 运行时：Node.js（Windows 环境）
- 存储：SQLite，账号凭据和用量快照均持久化
- 后台轮询间隔：默认 5 分钟
- 数据来源：通过带 auth cookie 的 HTTP 请求抓取 `opencode.ai/workspace/{id}/go` 页面，解析内嵌的 `<script>` 标签中的初始状态 JSON
- 账号隔离：不同账号的 cookie 互不影响，一个失败不阻塞其他
- 页面自动刷新间隔：30 秒（仅拉取最新快照，不触发抓取）

# Decisions

- D1：账号凭据存 SQLite，通过管理页增删改（非配置文件/环境变量）
- D2：后台持续轮询（非页面打开时才查询）
- D3：前端为服务端渲染 HTML 页面，内嵌少量 JS 实现自动刷新
- D4：不引入前端框架，保持简单

# Open questions

（无）

# Verification expectations

- 启动服务后能通过浏览器访问管理页和仪表盘
- 添加真实账号后能在仪表盘看到正确的用量数据
- 后台轮询持续工作，数据自动更新
- 多个账号互不干扰
