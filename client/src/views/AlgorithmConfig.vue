<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getAlgorithmConfig, updateAlgorithmConfig, simulateAlgorithm, getChannelStatus } from '../api'

const loading = ref(false)
const submitLoading = ref(false)
const simulateLoading = ref(false)
const simulateResult = ref(null)

const form = reactive({
  rolling_period_hours: 5,
  weekly_period_days: 7,
  monthly_period_days: 30,
  weight_rolling: 0.1,
  weight_weekly: 0.2,
  weight_monthly: 0.7,
  bonus_cap_rolling: 0.1,
  bonus_cap_weekly: 0.2,
  bonus_cap_monthly: 0.7,
  tier_threshold: 0.3,
  fuse_rolling_warn: 0.9,
  fuse_rolling_disable: 0.98,
  fuse_weekly_warn: 0.95,
  fuse_monthly_warn: 0.98,
  fuse_monthly_disable: 1.0,
  sync_balance_interval_minutes: 10,
  sync_priority_interval_minutes: 30,
})

// 模拟数据
const channelAccounts = ref([])
const originalAccounts = ref([])
const channelLoading = ref(false)

function isDirty(account) {
  const orig = originalAccounts.value.find(a => a.id === account.id)
  if (!orig) return false
  return orig.rolling_pct !== account.rolling_pct
    || orig.weekly_pct !== account.weekly_pct
    || orig.monthly_pct !== account.monthly_pct
}

function resetChannelData() {
  channelAccounts.value = JSON.parse(JSON.stringify(originalAccounts.value))
  ElMessage.success('已恢复真实数据')
}

function formatBalance(row) {
  const acc = channelAccounts.value.find(a => a.id === row.account_id)
  if (acc && acc.balance_remaining != null) return '$' + Number(acc.balance_remaining).toFixed(2)
  const mPct = channelAccounts.value.find(a => a.id === row.account_id)?.monthly_pct ?? 0
  return '$' + (60 * (1 - mPct / 100)).toFixed(2)
}

async function loadChannelStatus() {
  channelLoading.value = true
  try {
    const { data } = await getChannelStatus()
    const list = (data.accounts || []).filter(a => a.new_api_channel_id)
    // 只保留有 new_api_channel_id 的账号
    channelAccounts.value = list.map(a => ({
      id: a.id,
      name: a.name,
      rolling_pct: a.rolling_pct ?? 0,
      weekly_pct: a.weekly_pct ?? 0,
      monthly_pct: a.monthly_pct ?? 0,
      rolling_reset_at: a.rolling_reset_at || null,
      weekly_reset_at: a.weekly_reset_at || null,
      monthly_reset_at: a.monthly_reset_at || null,
      balance_remaining: a.balance_remaining ?? 0,
    }))
    originalAccounts.value = JSON.parse(JSON.stringify(channelAccounts.value))
  } catch {
    ElMessage.error('获取渠道状态失败')
  } finally {
    channelLoading.value = false
  }
}

async function loadConfig() {
  loading.value = true
  try {
    const { data } = await getAlgorithmConfig()
    if (data) {
      Object.keys(form).forEach(k => {
        if (data[k] !== undefined) form[k] = data[k]
      })
    }
  } catch {
    ElMessage.error('获取算法配置失败')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  submitLoading.value = true
  try {
    await updateAlgorithmConfig({ ...form })
    ElMessage.success('配置已保存')
  } catch {
    ElMessage.error('保存配置失败')
  } finally {
    submitLoading.value = false
  }
}

async function handleSimulate() {
  simulateLoading.value = true
  try {
    const manualInputs = channelAccounts.value.map(a => ({
      account_id: a.id,
      name: a.name,
      rolling_pct: a.rolling_pct,
      weekly_pct: a.weekly_pct,
      monthly_pct: a.monthly_pct,
      rolling_reset_at: a.rolling_reset_at,
      weekly_reset_at: a.weekly_reset_at,
      monthly_reset_at: a.monthly_reset_at,
    }))
    const { data } = await simulateAlgorithm({
      config_overrides: { ...form },
      manual_inputs: manualInputs,
    })
    simulateResult.value = data
  } catch {
    ElMessage.error('模拟运行失败')
  } finally {
    simulateLoading.value = false
  }
}

onMounted(() => {
  loadConfig()
  loadChannelStatus()
})
</script>

<template>
  <div class="algorithm-page">
    <!-- 卡片 1：算法规则说明 -->
    <el-card class="algo-card" shadow="never">
      <template #header>
        <span class="card-title">算法规则说明</span>
      </template>
      <el-alert type="info" :closable="false" show-icon class="algo-desc">
        <template #title>
          <div class="desc-content">
            <p><strong>核心思想：</strong>三周期（滚动/周度/月度）剩余率 × 时间修正系数 → 综合健康得分 → 分档 → 同档权重</p>
            <p><strong>熔断规则：</strong></p>
            <ul>
              <li>滚动用量超过熔断警告线 → 降权警告</li>
              <li>滚动用量超过熔断禁线 → 渠道禁用</li>
              <li>周度用量超过熔断降档线 → 优先级降档</li>
              <li>月度用量超过熔断最低线 → 优先级降至最低</li>
              <li>月度用量超过熔断禁线 → 渠道禁用</li>
            </ul>
            <p><strong>参数含义：</strong></p>
            <ul>
              <li><b>周期参数</b>：滚动/周度/月度三个时间窗口的长度</li>
              <li><b>权重参数</b>：三个周期健康得分的加权系数</li>
              <li><b>加成上限</b>：各周期剩余率加成封顶值</li>
              <li><b>分档阈值 θ</b>：健康得分低于此值时降档</li>
              <li><b>熔断参数</b>：各周期用量百分比的警告/禁用阈值</li>
              <li><b>同步间隔</b>：余额和优先级自动同步的间隔时间（分钟）</li>
            </ul>
          </div>
        </template>
      </el-alert>
    </el-card>

    <!-- 卡片 2：模拟数据 -->
    <el-card class="algo-card" shadow="never">
      <template #header>
        <div class="card-header-row">
          <span class="card-title">模拟数据</span>
          <el-button size="small" plain @click="resetChannelData" :disabled="channelLoading">恢复真实数据</el-button>
        </div>
      </template>
      <el-table
        :data="channelAccounts"
        v-loading="channelLoading"
        class="algo-table"
        empty-text="无关联 New API 的渠道账号"
        :row-class-name="({ row }) => isDirty(row) ? 'dirty' : ''"
      >
        <el-table-column label="账号名" min-width="100">
          <template #default="{ row }">{{ row.name }}</template>
        </el-table-column>
        <el-table-column label="滚动用量%" min-width="110" align="right">
          <template #default="{ row }">
            <el-input-number
              v-model="row.rolling_pct"
              :min="0" :max="100" :precision="1" :step="1"
              size="small" controls-position="right"
              style="width:110px"
            />
          </template>
        </el-table-column>
        <el-table-column label="周度用量%" min-width="110" align="right">
          <template #default="{ row }">
            <el-input-number
              v-model="row.weekly_pct"
              :min="0" :max="100" :precision="1" :step="1"
              size="small" controls-position="right"
              style="width:110px"
            />
          </template>
        </el-table-column>
        <el-table-column label="月度用量%" min-width="110" align="right">
          <template #default="{ row }">
            <el-input-number
              v-model="row.monthly_pct"
              :min="0" :max="100" :precision="1" :step="1"
              size="small" controls-position="right"
              style="width:110px"
            />
          </template>
        </el-table-column>
      </el-table>
      <p class="simulate-note">修改以上数据仅用于模拟运行，不影响实际同步</p>
    </el-card>

    <!-- 卡片 3：参数配置 -->
    <el-card class="algo-card" shadow="never">
      <template #header>
        <span class="card-title">参数配置</span>
      </template>
      <el-form label-position="top" v-loading="loading" class="algo-form">
        <!-- 周期参数 -->
        <div class="param-group">
          <h4 class="group-title">周期参数</h4>
          <el-row :gutter="24">
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="滚动周期(小时)">
                <el-input-number v-model="form.rolling_period_hours" :min="1" :max="720" :precision="0" :step="1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="周度周期(天)">
                <el-input-number v-model="form.weekly_period_days" :min="1" :max="365" :precision="0" :step="1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="月度周期(天)">
                <el-input-number v-model="form.monthly_period_days" :min="1" :max="365" :precision="0" :step="1" style="width:100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 综合得分权重 -->
        <div class="param-group">
          <h4 class="group-title">综合得分权重</h4>
          <el-row :gutter="24">
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="滚动权重">
                <el-input-number v-model="form.weight_rolling" :min="0" :max="1" :precision="2" :step="0.1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="周度权重">
                <el-input-number v-model="form.weight_weekly" :min="0" :max="1" :precision="2" :step="0.1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="月度权重">
                <el-input-number v-model="form.weight_monthly" :min="0" :max="1" :precision="2" :step="0.1" style="width:100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 时间修正系数加成上限 -->
        <div class="param-group">
          <h4 class="group-title">时间修正系数加成上限</h4>
          <el-row :gutter="24">
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="滚动加成">
                <el-input-number v-model="form.bonus_cap_rolling" :min="0" :max="1" :precision="2" :step="0.1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="周度加成">
                <el-input-number v-model="form.bonus_cap_weekly" :min="0" :max="1" :precision="2" :step="0.1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="月度加成">
                <el-input-number v-model="form.bonus_cap_monthly" :min="0" :max="1" :precision="2" :step="0.1" style="width:100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 分档与熔断 -->
        <div class="param-group">
          <h4 class="group-title">分档与熔断</h4>
          <el-row :gutter="24">
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="分档阈值 θ">
                <el-input-number v-model="form.tier_threshold" :min="0" :max="1" :precision="2" :step="0.05" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="滚动警告线">
                <el-input-number v-model="form.fuse_rolling_warn" :min="0" :max="1" :precision="2" :step="0.05" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="滚动禁用线">
                <el-input-number v-model="form.fuse_rolling_disable" :min="0" :max="1" :precision="2" :step="0.05" style="width:100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="24" style="margin-top:0">
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="周度降档线">
                <el-input-number v-model="form.fuse_weekly_warn" :min="0" :max="1" :precision="2" :step="0.05" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="月度最低线">
                <el-input-number v-model="form.fuse_monthly_warn" :min="0" :max="1" :precision="2" :step="0.05" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="8">
              <el-form-item label="月度禁用线">
                <el-input-number v-model="form.fuse_monthly_disable" :min="0" :max="1" :precision="2" :step="0.05" style="width:100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 同步间隔 -->
        <div class="param-group">
          <h4 class="group-title">同步间隔</h4>
          <el-row :gutter="24">
            <el-col :xs="24" :sm="12" :md="12">
              <el-form-item label="余额同步间隔(分钟)">
                <el-input-number v-model="form.sync_balance_interval_minutes" :min="1" :max="1440" :precision="0" :step="1" style="width:100%" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :sm="12" :md="12">
              <el-form-item label="优先级同步间隔(分钟)">
                <el-input-number v-model="form.sync_priority_interval_minutes" :min="1" :max="1440" :precision="0" :step="1" style="width:100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="form-actions">
          <el-button type="primary" :loading="submitLoading" @click="handleSave">保存配置</el-button>
          <el-button :loading="simulateLoading" @click="handleSimulate">模拟运行</el-button>
        </div>
      </el-form>
    </el-card>

    <!-- 卡片 4：模拟结果 -->
    <el-card v-if="simulateResult" class="algo-card" shadow="never">
      <template #header>
        <span class="card-title">模拟结果</span>
      </template>
      <el-table :data="Array.isArray(simulateResult) ? simulateResult : (simulateResult.results || [])" class="algo-table" empty-text="无模拟数据">
        <el-table-column label="账号名" min-width="120">
          <template #default="{ row }">{{ row.name || row.account_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="健康得分" width="100" align="right">
          <template #default="{ row }">{{ (row.health_score ?? row.score)?.toFixed(2) ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="优先级" width="90" align="right">
          <template #default="{ row }">{{ row.calculated_priority ?? row.priority ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="权重" width="90" align="right">
          <template #default="{ row }">{{ row.calculated_weight ?? row.weight ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="分档" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" effect="dark" :type="(row.tier ?? 0) > 1 ? 'warning' : 'success'">
              Tier {{ row.tier ?? '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="滚动剩余" width="100" align="right">
          <template #default="{ row }">
            {{ row.rolling_remain != null ? row.rolling_remain.toFixed(1) + 'h' : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="周度剩余" width="100" align="right">
          <template #default="{ row }">
            {{ row.weekly_remain != null ? row.weekly_remain.toFixed(1) + 'd' : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="月度剩余" width="100" align="right">
          <template #default="{ row }">
            {{ row.monthly_remain != null ? row.monthly_remain.toFixed(1) + 'd' : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="余额" width="100" align="right">
          <template #default="{ row }">
            {{ formatBalance(row) }}
          </template>
        </el-table-column>
        <el-table-column label="熔断标记" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.fused" size="small" type="danger" effect="dark">熔断</el-tag>
            <span v-else-if="row.fuse_reason" class="fuse-warn-text">{{ row.fuse_reason }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
      <p class="simulate-note">注意：以上为模拟结果，未实际同步到 New API</p>
    </el-card>
  </div>
</template>

<style scoped>
.algorithm-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.algo-card {
  background: rgba(22, 33, 62, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.algo-desc {
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.desc-content {
  font-size: 13px;
  line-height: 1.7;
  color: #cbd5e0;
}

.desc-content p {
  margin: 4px 0;
}

.desc-content ul {
  margin: 4px 0;
  padding-left: 20px;
}

.desc-content li {
  margin: 2px 0;
}

.desc-content strong {
  color: #e2e8f0;
}

.algo-form {
  padding: 0;
}

.param-group {
  margin-bottom: 24px;
}

.param-group:last-child {
  margin-bottom: 0;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
  margin: 0 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.form-actions {
  margin-top: 20px;
  display: flex;
  gap: 12px;
}

/* 暗色表格覆盖 */
.algo-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(15, 23, 42, 0.8);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.04);
  --el-table-border-color: rgba(255, 255, 255, 0.06);
  --el-table-text-color: #cbd5e0;
  --el-table-header-text-color: #94a3b8;
}

.algo-table :deep(.el-table__inner-wrapper::before) { background: transparent !important; }
.algo-table :deep(.el-table__header-wrapper) { background: transparent !important; }
.algo-table :deep(.el-table__body-wrapper) { background: transparent !important; }

.algo-table :deep(.el-table__header th) {
  background: rgba(15, 23, 42, 0.8) !important;
  color: #94a3b8 !important;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid rgba(255, 255, 255, 0.08) !important;
  padding: 10px 0;
}

.algo-table :deep(.el-table__header th .cell) {
  color: #94a3b8 !important;
  font-weight: 500;
}

.algo-table :deep(.el-table__body tr) {
  background: transparent !important;
}

.algo-table :deep(.el-table__body td) {
  background: transparent !important;
  color: #cbd5e0 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
  padding: 10px 0;
}

.algo-table :deep(.el-table__body tr:hover > td) {
  background: rgba(255, 255, 255, 0.04) !important;
}

.algo-table :deep(.el-table__empty-block) {
  background: transparent !important;
}

.algo-table :deep(.el-table__empty-text) {
  color: #64748b;
}

.algo-table :deep(.el-loading-mask) {
  background: rgba(22, 33, 62, 0.6) !important;
}

/* 修改行高亮 */
.algo-table :deep(.dirty > td) {
  background: rgba(255, 193, 7, 0.08) !important;
}

.simulate-note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #64748b;
  text-align: center;
}

/* 手机端 */
@media (max-width: 640px) {
  .form-actions {
    flex-direction: column;
  }

  .form-actions .el-button {
    width: 100%;
  }

  .algo-table :deep(.el-table__body td),
  .algo-table :deep(.el-table__header th) {
    padding: 8px 4px !important;
  }
}
</style>