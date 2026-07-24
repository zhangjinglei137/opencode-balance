<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { getAccounts, createAccount, updateAccount, deleteAccount, reorderAccounts } from '../api'
import { View, Hide } from '@element-plus/icons-vue'

const accounts = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitLoading = ref(false)
const visibleCookies = ref(new Set())

const form = reactive({
  id: null,
  name: '',
  workspaceId: '',
  authCookie: '',
  newApiChannelId: '',
  syncBalanceEnabled: false,
  syncPriorityEnabled: false,
})

function resetForm() {
  form.id = null
  form.name = ''
  form.workspaceId = ''
  form.authCookie = ''
  form.newApiChannelId = ''
  form.syncBalanceEnabled = false
  form.syncPriorityEnabled = false
}

function openAdd() {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  form.id = row.id
  form.name = row.name
  form.workspaceId = row.workspace_id
  form.authCookie = ''
  form.newApiChannelId = row.new_api_channel_id || ''
  form.syncBalanceEnabled = row.sync_balance_enabled ?? false
  form.syncPriorityEnabled = row.sync_priority_enabled ?? false
  dialogVisible.value = true
}

async function loadAccounts() {
  loading.value = true
  try {
    const { data } = await getAccounts()
    accounts.value = data
    await nextTick()
    // ponytail: 用原生 HTML5 拖拽，给表格行加 draggable
    document.querySelectorAll('.accounts-table .draggable-row').forEach(tr => {
      tr.setAttribute('draggable', 'true')
    })
  } catch (err) {
    ElMessage.error('获取账号失败')
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  submitLoading.value = true
  try {
    const payload = {
      name: form.name,
      workspaceId: form.workspaceId,
      newApiChannelId: form.newApiChannelId,
      syncBalanceEnabled: form.syncBalanceEnabled,
      syncPriorityEnabled: form.syncPriorityEnabled,
    }
    if (form.authCookie) {
      payload.authCookie = form.authCookie
    }
    if (isEdit.value) {
      await updateAccount(form.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createAccount(payload)
      ElMessage.success('添加成功')
    }
    dialogVisible.value = false
    await loadAccounts()
  } catch (err) {
    ElMessage.error(isEdit.value ? '更新失败' : '添加失败')
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(row) {
  try {
    await deleteAccount(row.id)
    ElMessage.success('删除成功')
    await loadAccounts()
  } catch (err) {
    ElMessage.error('删除失败')
  }
}

function toggleCookie(id) {
  if (visibleCookies.value.has(id)) {
    visibleCookies.value.delete(id)
  } else {
    visibleCookies.value.add(id)
  }
}

function displayCookie(row) {
  const raw = row.auth_cookie_preview || row.authCookie || ''
  if (visibleCookies.value.has(row.id)) return raw
  return raw.length > 10 ? raw.slice(0, 10) + '...' : raw
}

// 拖拽排序
const dragIndex = ref(-1)
const dragOverIndex = ref(-1)

function rowClassName({ row, rowIndex }) {
  return 'draggable-row'
}

function onTableDragStart(e) {
  const tr = e.target.closest('tr.draggable-row')
  if (!tr) return
  const idx = Array.from(tr.parentElement.children).indexOf(tr)
  dragIndex.value = idx
  e.dataTransfer.effectAllowed = 'move'
}

function onTableDragOver(e) {
  const tr = e.target.closest('tr.draggable-row')
  if (!tr || dragIndex.value === -1) return
  const idx = Array.from(tr.parentElement.children).indexOf(tr)
  if (dragOverIndex.value !== idx) {
    dragOverIndex.value = idx
    const list = [...accounts.value]
    const item = list.splice(dragIndex.value, 1)[0]
    list.splice(idx, 0, item)
    accounts.value = list
    dragIndex.value = idx
  }
}

async function onTableDragEnd() {
  if (dragIndex.value === -1) return
  dragIndex.value = -1
  dragOverIndex.value = -1
  try {
    await reorderAccounts(accounts.value.map(a => a.id))
    ElMessage.success('排序已保存')
  } catch { /* 静默 */ }
}

onMounted(() => {
  loadAccounts()
})
</script>

<template>
  <el-card class="accounts-card" shadow="never">
    <div class="toolbar">
      <el-button type="primary" @click="openAdd">添加账号</el-button>
      <span class="drag-hint">↕ 拖拽行可调整顺序</span>
    </div>

    <div @dragstart="onTableDragStart" @dragover.prevent="onTableDragOver" @dragend="onTableDragEnd">
    <el-table :data="accounts" v-loading="loading" class="accounts-table"
      row-key="id"
      :row-class-name="rowClassName">
      <el-table-column label="" width="44">
        <template #default="{ $index }">
          <span class="drag-handle" :data-index="$index">⋮⋮</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="80" />
      <el-table-column prop="workspace_id" label="Workspace ID" min-width="140" show-overflow-tooltip />
      <el-table-column label="Cookie" min-width="160">
        <template #default="{ row }">
          <el-input :model-value="displayCookie(row)" readonly class="cookie-input">
            <template #suffix>
              <el-icon class="eye-icon" @click="toggleCookie(row.id)">
                <View v-if="visibleCookies.has(row.id)" />
                <Hide v-else />
              </el-icon>
            </template>
          </el-input>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确定删除该账号吗？" confirm-button-text="确定" cancel-button-text="取消"
            @confirm="handleDelete(row)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑账号' : '添加账号'" width="75%"
      :close-on-click-modal="false"
      class="account-dialog">
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="Workspace ID">
          <el-input v-model="form.workspaceId" placeholder="请输入 Workspace ID" />
        </el-form-item>
        <el-form-item label="Auth Cookie">
          <el-input v-model="form.authCookie" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }"
            :placeholder="isEdit ? '留空则不修改' : '请输入 Auth Cookie'" />
        </el-form-item>
        <el-form-item label="New API 渠道 ID">
          <el-input v-model="form.newApiChannelId" placeholder="输入 New API 渠道 ID（可选）" />
        </el-form-item>
        <el-form-item label="余额同步">
          <el-switch v-model="form.syncBalanceEnabled" />
        </el-form-item>
        <el-form-item label="优先级同步">
          <el-switch v-model="form.syncPriorityEnabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">提交</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.accounts-card {
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

.drag-hint {
  color: #64748b;
  font-size: 12px;
}

.drag-handle {
  cursor: grab;
  color: #475569;
  font-size: 18px;
  user-select: none;
  line-height: 1;
}

.drag-handle:active {
  cursor: grabbing;
}

/* 暗色表格 - 全局覆盖 */
.accounts-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(15, 23, 42, 0.8);
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.04);
  --el-table-border-color: rgba(255, 255, 255, 0.06);
  --el-table-text-color: #cbd5e0;
  --el-table-header-text-color: #94a3b8;
}

/* 覆盖所有可能的白色 */
.accounts-table :deep(.el-table__inner-wrapper::before) { background: transparent !important; }
.accounts-table :deep(.el-table__header-wrapper) { background: transparent !important; }
.accounts-table :deep(.el-table__body-wrapper) { background: transparent !important; }

.accounts-table :deep(.el-table__header th) {
  background: rgba(15, 23, 42, 0.8) !important;
  color: #94a3b8 !important;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid rgba(255, 255, 255, 0.08) !important;
  padding: 10px 0;
}

.accounts-table :deep(.el-table__header th .cell) {
  color: #94a3b8 !important;
  font-weight: 500;
}

.accounts-table :deep(.el-table__body tr) {
  background: transparent !important;
}

.accounts-table :deep(.el-table__body td) {
  background: transparent !important;
  color: #cbd5e0 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
  padding: 10px 0;
}

.accounts-table :deep(.el-table__body tr:hover > td) {
  background: rgba(255, 255, 255, 0.04) !important;
}

.accounts-table :deep(.el-table__empty-block) {
  background: transparent !important;
}

.accounts-table :deep(.el-table__empty-text) {
  color: #64748b;
}

.accounts-table :deep(.el-loading-mask) {
  background: rgba(22, 33, 62, 0.6) !important;
}

.cookie-input :deep(.el-input__wrapper) {
  background: rgba(0, 0, 0, 0.2);
  box-shadow: none;
  border-color: rgba(255, 255, 255, 0.08);
}

.eye-icon {
  cursor: pointer;
  color: #94a3b8;
  transition: color 0.2s;
}

.eye-icon:hover {
  color: #e2e8f0;
}

.accounts-table :deep(.draggable-row) {
  cursor: grab;
  user-select: none;
}

.accounts-table :deep(.draggable-row:active) {
  cursor: grabbing;
}

/* 手机端 */
@media (max-width: 640px) {
  .toolbar {
    flex-wrap: wrap;
  }

  .drag-hint {
    display: none;
  }

  .account-dialog {
    --el-dialog-width: 75vw;
    max-width: 500px;
  }

  .account-dialog :deep(.el-dialog__body) {
    overflow-x: hidden;
    word-break: break-all;
  }

  .accounts-table :deep(.el-table__body td),
  .accounts-table :deep(.el-table__header th) {
    padding: 8px 4px !important;
  }
}
</style>
