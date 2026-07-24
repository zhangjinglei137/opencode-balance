<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Moon, Expand, Fold, Link, Setting } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()

const isLoginPage = computed(() => route.name === 'login')
const menuOpen = ref(false)

function logout() {
  localStorage.removeItem('token')
  ElMessage.success('已退出登录')
  router.push('/login')
}

function closeMenu() {
  menuOpen.value = false
}
</script>

<template>
  <el-config-provider class="dark">
    <div v-if="isLoginPage" class="login-page">
      <router-view />
    </div>

    <div v-else class="app-layout" :class="{ 'menu-open': menuOpen }">
      <!-- 移动端遮罩 -->
      <div v-if="menuOpen" class="menu-overlay" @click="closeMenu" />

      <aside class="sidebar" :class="{ open: menuOpen }">
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
          @select="closeMenu"
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
            <el-menu-item index="/channels">
              <el-icon><Link /></el-icon>
              <span>渠道控制</span>
            </el-menu-item>
            <el-menu-item index="/algorithm">
              <el-icon><Setting /></el-icon>
              <span>算法配置</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <div class="topbar-left">
            <el-button class="menu-toggle" text @click="menuOpen = !menuOpen">
              <el-icon :size="20"><Fold v-if="menuOpen" /><Expand v-else /></el-icon>
            </el-button>
            <h1 class="page-title">OpenCode Go 余额监控</h1>
          </div>
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

/* 侧边栏 */
.sidebar {
  width: 220px;
  flex-shrink: 0;
  background: #16213e;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  z-index: 100;
  transition: transform 0.25s ease;
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

/* 主区域 */
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
  padding: 0 24px;
  background: rgba(22, 33, 62, 0.6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-toggle {
  display: none;
  color: #a0aec0;
  padding: 4px;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #e2e8f0;
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

/* 移动端遮罩 */
.menu-overlay {
  display: none;
}

/* 手机端 < 768px */
@media (max-width: 767px) {
  .menu-toggle {
    display: inline-flex;
  }

  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.4);
  }

  .menu-overlay {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 99;
  }

  .topbar {
    padding: 0 16px;
  }

  .content {
    padding: 16px;
  }

  .page-title {
    font-size: 16px;
  }
}
</style>
