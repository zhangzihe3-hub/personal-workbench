<template>
  <div class="server-login">
    <div class="login-card pwb-card">
      <div class="login-logo">⌘</div>
      <h1>个人工作台</h1>
      <p class="subtitle">登录你的账号，在 Web、H5 与 Android 间同步个人数据</p>
        <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="服务器 API 地址">
          <el-input v-model="form.server" size="large" :placeholder="native ? 'http://服务器IP:端口/api' : '/api'" />
        </el-form-item>
        <el-alert
          v-if="native && insecureHttp" title="当前使用 HTTP，登录信息未加密，建议尽快配置 HTTPS"
          type="warning" :closable="false" show-icon class="http-warning"
        />
        <el-form-item label="用户名">
          <el-input v-model="form.username" size="large" autocomplete="username" placeholder="请输入用户名" autofocus />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password" type="password" show-password size="large"
            autocomplete="current-password" @keyup.enter="submit"
          />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
        <el-button type="primary" size="large" native-type="submit" :loading="loading" class="login-button">
          登录工作台
        </el-button>
      </el-form>
      <div class="server-address">
        {{ native ? '请输入完整 HTTP/HTTPS 地址，并以 /api 结尾' : 'Web 同域部署保持 /api 即可' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { getApiBase, login, setApiBase, validateApiBase } from '@/services/api'

const emit = defineEmits(['authenticated'])
const native = Capacitor.isNativePlatform()
const savedApiBase = getApiBase()
const form = reactive({
  server: native && !/^https?:\/\//i.test(savedApiBase) ? '' : savedApiBase,
  username: '',
  password: '',
})
const insecureHttp = computed(() => /^http:\/\//i.test(form.server.trim()))
const loading = ref(false)
const error = ref('')

async function submit() {
  if (loading.value) return
  if (!form.username || !form.password) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    const apiBase = validateApiBase(form.server, native)
    setApiBase(apiBase)
    await login(form.username, form.password)
    emit('authenticated')
  } catch (e) {
    error.value = e.message || '登录失败，请检查服务器和账号配置'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.server-login {
  min-height: 100%; display: grid; place-items: center; padding: 24px;
  background: radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--pwb-primary) 18%, transparent), transparent 36%), var(--pwb-bg);
}
.login-card { width: min(420px, 100%); padding: 36px; }
.login-logo {
  width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 15px;
  display: grid; place-items: center; background: var(--pwb-primary); color: #fff; font-size: 28px; font-weight: 700;
}
h1 { margin: 0; text-align: center; font-size: 24px; }
.subtitle { margin: 8px 0 28px; text-align: center; color: var(--pwb-text-secondary); line-height: 1.6; }
.login-button { width: 100%; margin-top: 18px; }
.http-warning { margin-bottom: 18px; }
.server-address { margin-top: 18px; text-align: center; color: var(--pwb-text-secondary); font-size: 12px; word-break: break-all; }
</style>
