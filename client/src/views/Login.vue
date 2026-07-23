<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '../api'

const router = useRouter()
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!password.value) {
    ElMessage.warning('请输入密码')
    return
  }
  loading.value = true
  try {
    const { data } = await login(password.value)
    localStorage.setItem('token', data.token)
    ElMessage.success('登录成功')
    router.push('/')
  } catch (err) {
    ElMessage.error('密码错误')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <el-card class="login-card" shadow="never">
    <div class="login-header">
      <el-icon :size="36" color="#409eff"><Monitor /></el-icon>
      <h2>OpenCode Go 余额监控</h2>
    </div>
    <el-input
      v-model="password"
      type="password"
      placeholder="请输入密码"
      show-password
      size="large"
      @keyup.enter="handleLogin"
    />
    <el-button
      type="primary"
      size="large"
      :loading="loading"
      class="login-btn"
      @click="handleLogin"
    >
      登录
    </el-button>
  </el-card>
</template>

<style scoped>
.login-card {
  width: 100%;
  max-width: 400px;
  background: rgba(22, 33, 62, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 16px;
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.login-header h2 {
  margin: 0;
  color: #e2e8f0;
  font-size: 20px;
  font-weight: 600;
}

.login-btn {
  width: 100%;
  margin-top: 20px;
}
</style>
