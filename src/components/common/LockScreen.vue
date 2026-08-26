<template>
  <div class="lock-screen">
    <div class="lock-card pwb-card">
      <div class="lock-icon">⌘</div>
      <h2>个人工作台已锁定</h2>
      <p class="tip">请输入解锁密码</p>
      <el-input
        v-model="password"
        type="password"
        size="large"
        placeholder="解锁密码"
        show-password
        @keyup.enter="unlock"
        autofocus
      />
      <p v-if="error" class="error">密码错误，请重试</p>
      <el-button type="primary" size="large" style="width:100%" @click="unlock">解锁</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { sha256 } from '@/utils/exporter'

const settingsStore = useSettingsStore()
const password = ref('')
const error = ref(false)

async function unlock() {
  if (!password.value) return
  const hash = await sha256(password.value)
  if (hash === settingsStore.settings.passwordHash) {
    settingsStore.unlock()
  } else {
    error.value = true
    password.value = ''
  }
}
</script>

<style scoped>
.lock-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pwb-bg);
}
.lock-card { width: 360px; text-align: center; padding: 40px 32px; }
.lock-icon {
  width: 56px; height: 56px;
  margin: 0 auto 16px;
  background: var(--pwb-primary);
  color: #fff; border-radius: 14px;
  font-size: 28px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
h2 { margin: 0 0 4px; font-size: 20px; }
.tip { color: var(--pwb-text-secondary); margin: 0 0 24px; }
.error { color: var(--pwb-p0); font-size: 12px; margin: 8px 0 0; text-align: left; }
.lock-card .el-button { margin-top: 16px; }
</style>
