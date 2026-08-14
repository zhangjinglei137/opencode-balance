<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUsage, fetchUsage, applyReward } from '../api'
import { countdown } from '../utils/countdown'

const loading = ref(false)
const refreshing = ref(false)
const state = reactive({
  accounts: [],
  lastPollAt: null,
})

const now = ref(Date.now())
let timer = null
let pollTimer = null
let refreshTimer = null

function progressColor(pct) {
  if (pct < 50) return '#67c23a'
  if (pct <= 80) return '#e6a23c'
  return '#f56c6c'
}

const lastUpdateText = computed(() => {
  if (!state.lastPollAt) return '未更新'
  const diff = Math.max(0, now.value - new Date(state.lastPollAt).getTime())
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  return `${mins} 分钟前`
})

function formatTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('zh-CN')
}

async function applyUsageData() {
  const { data } = await getUsage()
  state.accounts = data.accounts || []
  state.lastPollAt = data.lastPollAt || null
}

async function loadUsage() {
  loading.value = true
  try {
    await applyUsageData()
  } catch (err) {
    ElMessage.error('获取用量失败')
  } finally {
    loading.value = false
  }
}

// 轻量轮询：不切骨架屏，失败静默
async function pollUsage() {
  try {
    await applyUsageData()
  } catch (err) {
    /* 静默 */
  }
}

// 自动重抓（每 5 分钟）：静默，不弹提示
async function autoRefresh() {
  try {
    await fetchUsage()
    await applyUsageData()
  } catch (err) {
    /* 静默 */
  }
}

async function handleRefresh() {
  refreshing.value = true
  try {
    await fetchUsage()
    await loadUsage()
    ElMessage.success('刷新成功')
  } catch (err) {
    ElMessage.error('刷新失败')
  } finally {
    refreshing.value = false
  }
}

async function retryAccount() {
  await handleRefresh()
}

// 未用奖励
const applyingKey = ref(null)

async function handleApplyReward(account, reward) {
  try {
    await ElMessageBox.confirm(
      `确认使用 ${reward.email} 的奖励？\n将抵扣订阅用量 $${(reward.amount / 100).toFixed(2)}`,
      '使用奖励',
      { confirmButtonText: '确认使用', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  applyingKey.value = `${account.id}:${reward.id}`
  try {
    await applyReward(account.id, reward.id)
    ElMessage.success('奖励已使用')
    await loadUsage()
  } catch (err) {
    ElMessage.error(err.response?.data?.error || '使用奖励失败')
  } finally {
    applyingKey.value = null
  }
}

function isVisible() {
  return document.visibilityState === 'visible'
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (isVisible()) pollUsage()
  }, 30000)
  refreshTimer = setInterval(() => {
    if (isVisible()) autoRefresh()
  }, 5 * 60 * 1000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
}

function handleVisibilityChange() {
  if (isVisible()) {
    pollUsage()
    startPolling()
  } else {
    stopPolling()
  }
}

onMounted(() => {
  loadUsage()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  startPolling()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div v-if="loading" class="dashboard-skeleton">
    <el-row :gutter="16">
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card><el-skeleton :rows="3" animated /></el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card><el-skeleton :rows="3" animated /></el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :lg="8">
        <el-card><el-skeleton :rows="3" animated /></el-card>
      </el-col>
    </el-row>
  </div>

  <div v-else>
    <el-card class="action-bar" shadow="never">
      <div class="action-inner">
        <span class="last-update">上次更新：{{ lastUpdateText }}</span>
        <el-button type="primary" :loading="refreshing" @click="handleRefresh">
          手动刷新
        </el-button>
      </div>
    </el-card>

    <el-empty v-if="state.accounts.length === 0" description="暂无账号，请先添加账号" />

    <el-row v-else :gutter="16" class="cards-row">
      <el-col
        v-for="account in state.accounts"
        :key="account.id"
        :xs="24"
        :sm="24"
        :md="12"
        :lg="8"
        :xl="6"
        class="card-col"
      >
        <el-card shadow="hover" class="usage-card">
          <template #header>
            <el-text size="large" tag="b">{{ account.name }}</el-text>
          </template>

          <el-alert
            v-if="account.error"
            :title="account.error"
            type="error"
            :closable="false"
            show-icon
          />
          <el-button
            v-if="account.error"
            size="small"
            class="retry-btn"
            @click="retryAccount"
          >
            重试
          </el-button>

          <template v-else>
            <div class="usage-item">
              <div class="usage-label">滚动用量</div>
              <el-progress
                :percentage="account.rolling_pct ?? 0"
                :color="progressColor(account.rolling_pct ?? 0)"
                :stroke-width="16"
              />
              <div class="usage-meta">
                {{ account.rolling_pct ?? 0 }}% · 重置于 {{ countdown(account.rolling_reset_at) }}
              </div>
            </div>

            <div class="usage-item">
              <div class="usage-label">每周用量</div>
              <el-progress
                :percentage="account.weekly_pct ?? 0"
                :color="progressColor(account.weekly_pct ?? 0)"
                :stroke-width="16"
              />
              <div class="usage-meta">
                {{ account.weekly_pct ?? 0 }}% · 重置于 {{ countdown(account.weekly_reset_at) }}
              </div>
            </div>

            <div class="usage-item">
              <div class="usage-label">每月用量</div>
              <el-progress
                :percentage="account.monthly_pct ?? 0"
                :color="progressColor(account.monthly_pct ?? 0)"
                :stroke-width="16"
              />
              <div class="usage-meta">
                {{ account.monthly_pct ?? 0 }}% · 重置于 {{ countdown(account.monthly_reset_at) }}
              </div>
            </div>

            <!-- 每日用量 + 余额（始终占位，保持卡片等高度） -->
            <div class="daily-section">
              <el-divider />
              <template v-if="account.daily_cost != null">
                <div class="daily-header">今日用量</div>
                <div class="daily-total">${{ account.daily_cost.toFixed(4) }}</div>
                <div class="top-models">
                  <div class="daily-header" style="margin-top:8px">Top 模型</div>
                  <div class="top-models-list">
                    <template v-if="account.topModels && account.topModels.length > 0">
                      <div v-for="m in account.topModels.slice(0, 3)" :key="m.name" class="model-row">
                        <span class="model-name">{{ m.name }}</span>
                        <span class="model-cost">${{ m.cost.toFixed(4) }}</span>
                        <span class="model-count">{{ m.count }}次</span>
                      </div>
                      <div v-for="i in (3 - Math.min(account.topModels.length, 3))" :key="'empty-model-' + i" class="model-row model-row-empty"></div>
                    </template>
                    <template v-else>
                      <div class="model-row">
                        <span class="model-placeholder">暂无模型数据</span>
                      </div>
                      <div v-for="i in 2" :key="'empty-model-' + i" class="model-row model-row-empty"></div>
                    </template>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="daily-placeholder">暂无今日数据</div>
              </template>
            </div>
            <div v-if="account.reward_total != null" class="balance-section">
              <el-divider />
              <div class="balance-row">
                <span class="balance-label">总额</span>
                <span class="balance-value">${{ account.balance_total?.toFixed(2) }}</span>
              </div>
              <div class="balance-row">
                <span class="balance-label">余额</span>
                <el-text :type="account.balance_remaining < 5 ? 'danger' : 'success'" tag="span" class="balance-value-main">
                  ${{ account.balance_remaining?.toFixed(2) }}
                </el-text>
              </div>
              <div class="balance-detail">
                <span>订阅 $60（{{ account.monthly_pct ?? 0 }}%已用）+ {{ account.reward_total }}个奖励 × ${{ ((account.reward_amount_cents ?? 500) / 100)?.toFixed(0) || '5' }}</span>
                <span v-if="account.reward_used > 0" class="reward-used">（{{ account.reward_used }}已用 / {{ account.reward_unused }}未用）</span>
              </div>
            </div>
            <div v-else class="balance-section balance-placeholder">
              <el-divider />
              <div class="daily-placeholder">暂无奖励数据</div>
            </div>

            <!-- 未用奖励列表 -->
            <div class="rewards-section">
              <div class="rewards-title">未用奖励</div>
              <div class="rewards-list">
                <template v-if="account.rewards && account.rewards.length > 0">
                  <div v-for="reward in account.rewards.slice(0, 3)" :key="reward.id" class="reward-row">
                    <span class="reward-email">{{ reward.email }}</span>
                    <el-button
                      size="small"
                      :loading="applyingKey === `${account.id}:${reward.id}`"
                      @click="handleApplyReward(account, reward)"
                    >
                      使用
                    </el-button>
                  </div>
                  <div v-for="i in (3 - Math.min(account.rewards.length, 3))" :key="'empty-' + i" class="reward-row reward-row-empty"></div>
                </template>
                <template v-else>
                  <div class="reward-row">
                    <span class="reward-placeholder">暂无未用奖励</span>
                  </div>
                  <div v-for="i in 2" :key="'empty-' + i" class="reward-row reward-row-empty"></div>
                </template>
              </div>
            </div>
          </template>

          <template #footer>
            <el-text type="info" size="small">
              更新于 {{ formatTime(account.fetched_at) }}
            </el-text>
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard-skeleton {
  margin-bottom: 16px;
}

.action-bar {
  margin-bottom: 16px;
  background: rgba(22, 33, 62, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.action-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.last-update {
  color: #a0aec0;
  font-size: 14px;
}

.cards-row {
  margin-top: 8px;
}

.card-col {
  margin-bottom: 16px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
}

.usage-card {
  background: rgba(22, 33, 62, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.usage-card :deep(.el-card__header) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.usage-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.usage-card :deep(.el-card__footer) {
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.usage-item {
  margin-bottom: 20px;
}

.usage-label {
  font-size: 13px;
  color: #a0aec0;
  margin-bottom: 8px;
}

.usage-meta {
  margin-top: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.retry-btn {
  margin-top: 12px;
}

.reward-tag {
  margin-bottom: 12px;
}

.balance-section {
  margin-top: 4px;
}

.balance-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.balance-label {
  color: #a0aec0;
  font-size: 13px;
}

.balance-value {
  color: #cbd5e0;
  font-size: 14px;
  font-family: monospace;
}

.balance-value-main {
  font-size: 16px;
  font-weight: 600;
  font-family: monospace;
}

.balance-detail {
  font-size: 11px;
  color: #64748b;
  margin-top: 6px;
}

.reward-used {
  color: #e2a03f;
}

.daily-section {
  margin-top: 4px;
}

.daily-header {
  font-size: 13px;
  color: #a0aec0;
  margin-bottom: 4px;
}

.daily-total {
  font-size: 22px;
  font-weight: 700;
  color: #e2e8f0;
  font-family: monospace;
  margin-bottom: 6px;
}

.top-models {
  margin-top: 2px;
}

.top-models-list {
  height: 72px;
}

.model-row {
  display: flex;
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
}

.model-row-empty {
  visibility: hidden;
}

.model-placeholder {
  color: #475569;
  font-size: 12px;
}

.model-name {
  flex: 1;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-cost {
  min-width: 70px;
  text-align: right;
  color: #67c23a;
  font-family: monospace;
  margin-right: 8px;
}

.model-count {
  min-width: 40px;
  text-align: right;
  color: #64748b;
}

.daily-placeholder {
  color: #475569;
  font-size: 13px;
  padding: 12px 0;
  text-align: center;
}

.balance-placeholder {
  opacity: 0.5;
}

/* 未用奖励 */
.rewards-section {
  margin-top: 8px;
}

.rewards-title {
  font-size: 13px;
  color: #a0aec0;
  margin-bottom: 6px;
}

.rewards-list {
  height: 96px;
}

.reward-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
}

.reward-row-empty {
  visibility: hidden;
}

.reward-email {
  flex: 1;
  color: #94a3b8;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.reward-placeholder {
  color: #475569;
  font-size: 12px;
}

/* 手机端适配 */
@media (max-width: 640px) {
  .action-inner {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .card-col {
    min-width: 0;
  }
  .usage-card {
    border-radius: 8px;
  }
  .daily-total {
    font-size: 18px;
  }
  .model-row {
    font-size: 11px;
  }
  .model-placeholder {
    font-size: 11px;
  }
  .top-models-list {
    height: 66px;
  }
  .reward-email {
    font-size: 11px;
  }
  .reward-row {
    height: 28px;
  }
  .rewards-list {
    height: 84px;
  }
}
</style>
