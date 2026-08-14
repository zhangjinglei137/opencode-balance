<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getChannelStatus, syncBalance, syncPriority, getSyncLogs, updateAccount } from '../api'

const channels = ref([])
const loading = ref(false)
const syncBalanceLoading = ref(false)
const syncPriorityLoading = ref(false)
const logs = ref([])
const logsLoading = ref(false)
let pollTimer = null

function fmtBalance(v) {
  if (v == null || v === '') return '-'
  return '$' + Number(v).toFixed(2)
}

function fmtPct(v) {
  if (v == null || v === '') return '-'
  return Number(v).toFixed(1) + '%'
}

function fmtRate(v) {
  if (v == null || v === '') return '-'
  return Number(v).toFixed(2)
}

async function loadChannels() {
  loading.value = true
  try {
    const { data } = await getChannelStatus()
    const accounts = data.accounts || []
    const preview = data.algorithm_preview || []
    // 合并算法预览结果到对应账号
    const previewMap = {}
    preview.forEach(p => { previewMap[p.account_id] = p })
    channels.value = accounts.map(a => {
      const p = previewMap[a.id]
      return {
        ...a,
        calculated_priority: p ? p.priority : null,
        calculated_weight: p ? p.weight : null,
        burn_rate: p ? p.burn_rate : null,
        weekly_factor: p ? p.weekly_factor : null,
        tier: p ? p.tier : null,
        fused: p ? p.fused : false,
        fallback: p ? p.fallback : false,
        stale: p ? p.stale : false,
      }
    })
  } catch {
    ElMessage.error('获取渠道状态失败')
  } finally {
    loading.value = false
  }
}

async function handleSyncBalance() {
  syncBalanceLoading.value = true
  try {
    await syncBalance()
    ElMessage.success('余额同步成功')
    await loadChannels()
    await loadLogs()
  } catch {
    ElMessage.error('余额同步失败')
  } finally {
    syncBalanceLoading.value = false
  }
}

async function handleSyncPriority() {
  syncPriorityLoading.value = true
  try {
    await syncPriority()
    ElMessage.success('优先级同步成功')
    await loadChannels()
    await loadLogs()
  } catch {
    ElMessage.error('优先级同步失败')
  } finally {
    syncPriorityLoading.value = false
  }
}

async function handleToggleBalance(row) {
  try {
    await updateAccount(row.id, { syncBalanceEnabled: row.sync_balance_enabled })
    ElMessage.success('已更新')
  } catch {
    ElMessage.error('更新失败')
    row.sync_balance_enabled = !row.sync_balance_enabled
  }
}

async function handleTogglePriority(row) {
  try {
    await updateAccount(row.id, { syncPriorityEnabled: row.sync_priority_enabled })
    ElMessage.success('已更新')
  } catch {
    ElMessage.error('更新失败')
    row.sync_priority_enabled = !row.sync_priority_enabled
  }
}

async function loadLogs() {
  logsLoading.value = true
  try {
    const { data } = await getSyncLogs(20)
    logs.value = data.logs || (Array.isArray(data) ? data : [])
  } catch {
    // silent
  } finally {
    logsLoading.value = false
  }
}

function statusTag(status) {
  if (status === 'success') return { type: 'success' }
  if (status === 'error') return { type: 'danger' }
  return { type: 'info' }
}

function statusText(status) {
  if (status === 'success') return '成功'
  if (status === 'error') return '失败'
  return status
}

function syncTypeText(t) {
  if (t === 'balance') return '余额同步'
  if (t === 'priority') return '优先级同步'
  return t
}

function rowClass({ row }) {
  if (row.fused && row.fallback) return 'fallback-row'
  if (row.fused) return 'fused-row'
  return ''
}

function isVisible() {
  return document.visibilityState === 'visible'
}

onMounted(() => {
  loadChannels()
  loadLogs()
  pollTimer = setInterval(() => {
    if (isVisible()) loadChannels()
  }, 30000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

function handleVisibilityChange() {
  if (isVisible()) loadChannels()
}
</script>

<template>
  <el-card class="channel-card" shadow="never">
    <!-- 顶部操作区 -->
    <div class="toolbar">
      <el-button type="primary" :loading="syncBalanceLoading" @click="handleSyncBalance">
        同步余额
      </el-button>
      <el-button type="primary" :loading="syncPriorityLoading" @click="handleSyncPriority">
        同步优先级
      </el-button>
    </div>

    <!-- 渠道映射表 -->
    <el-table :data="channels" v-loading="loading" class="channel-table" empty-text="暂无渠道数据" :row-class-name="rowClass">
      <el-table-column label="账号名称" min-width="120">
        <template #default="{ row }">
          {{ row.name || row.account?.name || '-' }}
          <el-tag v-if="row.fused && row.fallback" size="small" type="warning" effect="dark" class="fused-tag">熔断·保底</el-tag>
          <el-tag v-else-if="row.fused" size="small" type="danger" effect="dark" class="fused-tag">熔断</el-tag>
          <el-tag v-else-if="row.stale" size="small" type="info" effect="dark" class="fused-tag">过期</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="New API 渠道 ID" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="channel-id" :class="{ unbound: !row.new_api_channel_id }">
            {{ row.new_api_channel_id || '未关联' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="余额同步" width="100" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.sync_balance_enabled" @change="handleToggleBalance(row)" />
        </template>
      </el-table-column>
      <el-table-column label="优先级同步" width="100" align="center">
        <template #default="{ row }">
          <el-switch v-model="row.sync_priority_enabled" @change="handleTogglePriority(row)" />
        </template>
      </el-table-column>
      <el-table-column label="滚动用量" width="100" align="right">
        <template #default="{ row }">{{ fmtPct(row.rolling_pct) }}</template>
      </el-table-column>
      <el-table-column label="周度用量" width="100" align="right">
        <template #default="{ row }">{{ fmtPct(row.weekly_pct) }}</template>
      </el-table-column>
      <el-table-column label="月度用量" width="100" align="right">
        <template #default="{ row }">{{ fmtPct(row.monthly_pct) }}</template>
      </el-table-column>
      <el-table-column label="当前余额" width="110" align="right">
        <template #default="{ row }">{{ fmtBalance(row.balance_remaining) }}</template>
      </el-table-column>
      <el-table-column label="算法优先级" width="100" align="right">
        <template #default="{ row }">
          {{ row.calculated_priority ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="算法权重" width="100" align="right">
        <template #default="{ row }">
          {{ row.calculated_weight ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="调度分" width="100" align="right">
        <template #default="{ row }">{{ fmtRate(row.burn_rate) }}</template>
      </el-table-column>
      <el-table-column label="周因子" width="100" align="right">
        <template #default="{ row }">{{ fmtRate(row.weekly_factor) }}</template>
      </el-table-column>
    </el-table>

    <!-- 同步日志区 -->
    <div class="log-section">
      <h3 class="log-title">同步日志</h3>
      <el-table :data="logs" v-loading="logsLoading" class="channel-table" empty-text="暂无同步日志" max-height="320">
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ row.created_at || row.time || '-' }}</template>
        </el-table-column>
        <el-table-column label="账号" min-width="120">
          <template #default="{ row }">{{ row.account_name || row.account?.name || '-' }}</template>
        </el-table-column>
        <el-table-column label="同步类型" width="120">
          <template #default="{ row }">{{ syncTypeText(row.sync_type || row.type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status).type" size="small" effect="dark">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="消息" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.message || '-' }}</template>
        </el-table-column>
      </el-table>
    </div>
  </el-card>
</template>

<style scoped>
.channel-card {
  background: rgba(22, 33, 62, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.channel-id {
  color: #cbd5e0;
}
.channel-id.unbound {
  color: #64748b;
  font-style: italic;
}

.fused-tag {
  margin-left: 8px;
}

.channel-table :deep(.fused-row > td) {
  background: rgba(245, 108, 108, 0.06) !important;
}

.channel-table :deep(.fused-row:hover > td) {
  background: rgba(245, 108, 108, 0.1) !important;
}

.channel-table :deep(.fallback-row > td) {
  background: rgba(230, 162, 60, 0.07) !important;
}

.channel-table :deep(.fallback-row:hover > td) {
  background: rgba(230, 162, 60, 0.12) !important;
}

.log-section {
  margin-top: 24px;
}

.log-title {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}

/* 暗色表格覆盖 */
.channel-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(15, 23, 42, 0.8);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.04);
  --el-table-border-color: rgba(255, 255, 255, 0.06);
  --el-table-text-color: #cbd5e0;
  --el-table-header-text-color: #94a3b8;
}

.channel-table :deep(.el-table__inner-wrapper::before) { background: transparent !important; }
.channel-table :deep(.el-table__header-wrapper) { background: transparent !important; }
.channel-table :deep(.el-table__body-wrapper) { background: transparent !important; }

.channel-table :deep(.el-table__header th) {
  background: rgba(15, 23, 42, 0.8) !important;
  color: #94a3b8 !important;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid rgba(255, 255, 255, 0.08) !important;
  padding: 10px 0;
}

.channel-table :deep(.el-table__header th .cell) {
  color: #94a3b8 !important;
  font-weight: 500;
}

.channel-table :deep(.el-table__body tr) {
  background: transparent !important;
}

.channel-table :deep(.el-table__body td) {
  background: transparent !important;
  color: #cbd5e0 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
  padding: 10px 0;
}

.channel-table :deep(.el-table__body tr:hover > td) {
  background: rgba(255, 255, 255, 0.04) !important;
}

.channel-table :deep(.el-table__empty-block) {
  background: transparent !important;
}

.channel-table :deep(.el-table__empty-text) {
  color: #64748b;
}

.channel-table :deep(.el-loading-mask) {
  background: rgba(22, 33, 62, 0.6) !important;
}

/* 手机端 */
@media (max-width: 640px) {
  .toolbar {
    flex-wrap: wrap;
  }

  .channel-table :deep(.el-table__body td),
  .channel-table :deep(.el-table__header th) {
    padding: 8px 4px !important;
  }
}
</style>
