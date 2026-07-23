<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Moon } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

const isLoginPage = computed(() => route.name === 'login')

function logout() {
  localStorage.removeItem('token')
  ElMessage.success('已退出登录')
  router.push('/login')
}
</script>

<template>
  <el-config-provider class="dark">
    <div v-if="isLoginPage" class="login-page">
      <router-view />
    </div>

    <div v-else class="app-layout">
      <aside class="sidebar">
        <div class="brand">
          <el-icon :size="22"><Moon /></el-icon>
          <span>余额监控</span>
        </div>
        <el-menu
          :default-active="route.path"
          class="main-menu"
          :router="true"
          background-color="#16213e"
          text-color="#a0aec0"
          active-text-color="#ffffff"
        >
          <el-menu-item-group title="导航">
            <el-menu-item index="/">
              <el-icon><Odometer /></el-icon>
              <span>仪表盘</span>
            </el-menu-item>
            <el-menu-item index="/accounts">
              <el-icon><UserFilled /></el-icon>
              <span>账号管理</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <h1 class="page-title">OpenCode Go 余额监控</h1>
          <el-button text type="danger" @click="logout">退出登录</el-button>
        </header>
        <div class="content">
          <router-view />
        </div>
      </main>
    </div>
  </el-config-provider>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  background: #1a1a2e;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-layout {
  display: flex;
  min-height: 100vh;
  background: #1a1a2e;
}

.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #16213e;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.brand {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  color: #ffffff;
  font-size: 18px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.main-menu {
  border-right: none;
  background: transparent;
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  background: rgba(22, 33, 62, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(8px);
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e2e8f0;
}

.content {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}
</style>
