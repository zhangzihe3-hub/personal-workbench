<template>
  <div class="page-container admin-view">
    <div class="admin-heading">
      <div>
        <h2 class="page-title">用户与在线设备</h2>
        <p>管理登录账号、数据权限与当前在线会话</p>
      </div>
      <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>添加用户</el-button>
    </div>

    <el-alert v-if="!isAdmin" title="仅管理员可以访问用户管理" type="warning" :closable="false" show-icon />

    <template v-else>
      <section class="pwb-card admin-section">
        <div class="section-heading">
          <strong>用户管理</strong>
          <span>共 {{ users.length }} 个账号</span>
        </div>
        <div v-loading="loading" class="user-list">
          <article v-for="user in users" :key="user.username" class="user-row">
            <div class="user-identity">
              <span class="avatar">{{ (user.displayName || user.username).slice(0, 1).toUpperCase() }}</span>
              <div><strong>{{ user.displayName || user.username }}</strong><small>@{{ user.username }}</small></div>
            </div>
            <el-tag size="small" :type="user.role === 'admin' ? 'primary' : 'info'">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</el-tag>
            <span class="status" :class="{ off: !user.active }"><i />{{ user.active ? '启用' : '停用' }}</span>
            <span class="online-count">{{ user.onlineSessions ? `${user.onlineSessions} 台在线` : '当前离线' }}</span>
            <div class="row-actions">
              <el-button size="small" text type="primary" @click="openEdit(user)">编辑</el-button>
              <el-button size="small" text type="primary" @click="openReset(user)">重置密码</el-button>
              <el-button
                size="small" text :type="user.active ? 'danger' : 'success'"
                :disabled="user.username === currentUser?.username" @click="toggleUser(user)"
              >{{ user.active ? '停用' : '启用' }}</el-button>
            </div>
          </article>
        </div>
      </section>

      <section class="pwb-card admin-section">
        <div class="section-heading">
          <strong>在线设备</strong>
          <div><span>2 分钟内有活动视为在线</span><el-button text circle aria-label="刷新在线设备" @click="loadAll"><el-icon><Refresh /></el-icon></el-button></div>
        </div>
        <div class="session-list">
          <article v-for="session in sessions" :key="session.sessionId" class="session-row">
            <div><strong>{{ session.displayName || session.username }}</strong><small>@{{ session.username }}</small></div>
            <div class="device"><el-icon><Cellphone /></el-icon><span>{{ deviceName(session.userAgent) }}</span></div>
            <div><small>IP 地址</small><span>{{ session.ipAddress || '未知' }}</span></div>
            <div><small>最后活动</small><span>{{ relativeTime(session.lastSeenAt) }}</span></div>
            <span class="status" :class="{ off: !session.online }"><i />{{ session.online ? '在线' : '近期会话' }}</span>
            <el-button
              size="small" text type="danger" :disabled="session.sessionId === currentUser?.sessionId"
              @click="revokeSession(session)"
            >强制下线</el-button>
          </article>
          <el-empty v-if="!sessions.length && !loading" description="暂无有效登录会话" :image-size="72" />
        </div>
      </section>
    </template>

    <el-dialog v-model="userDialog" :title="editing ? '编辑用户' : '添加用户'" width="420px" class="mobile-sheet-dialog" append-to-body>
      <el-form label-position="top">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="editing" maxlength="64" autocomplete="off" />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="form.displayName" maxlength="100" />
        </el-form-item>
        <el-form-item v-if="!editing" label="初始密码" required>
          <el-input v-model="form.password" type="password" show-password minlength="6" autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width:100%"><el-option label="普通用户" value="user" /><el-option label="管理员" value="admin" /></el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="userDialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveUser">确定</el-button></template>
    </el-dialog>

    <el-dialog v-model="passwordDialog" title="重置密码" width="400px" class="mobile-sheet-dialog" append-to-body>
      <p class="dialog-tip">为 <strong>{{ selectedUser?.username }}</strong> 设置新密码；其他设备会被下线。</p>
      <el-form label-position="top"><el-form-item label="新密码" required><el-input v-model="newPassword" type="password" show-password minlength="6" autocomplete="new-password" /></el-form-item></el-form>
      <template #footer><el-button @click="passwordDialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="resetPassword">确认重置</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, getCurrentUser } from '@/services/api'

const users = ref([])
const sessions = ref([])
const loading = ref(false)
const saving = ref(false)
const userDialog = ref(false)
const passwordDialog = ref(false)
const editing = ref(false)
const selectedUser = ref(null)
const newPassword = ref('')
const currentUser = ref(getCurrentUser())
const isAdmin = computed(() => currentUser.value?.role === 'admin')
const form = reactive({ username: '', displayName: '', password: '', role: 'user' })
let refreshTimer = null

async function loadAll() {
  if (!isAdmin.value || loading.value) return
  loading.value = true
  try { [users.value, sessions.value] = await Promise.all([adminApi.listUsers(), adminApi.listSessions()]) }
  catch (error) { ElMessage.error(error.message) }
  finally { loading.value = false }
}

function openCreate() {
  editing.value = false
  Object.assign(form, { username: '', displayName: '', password: '', role: 'user' })
  userDialog.value = true
}

function openEdit(user) {
  editing.value = true
  Object.assign(form, { username: user.username, displayName: user.displayName, password: '', role: user.role })
  userDialog.value = true
}

async function saveUser() {
  if (!form.username.trim()) return ElMessage.warning('请输入用户名')
  if (!editing.value && form.password.length < 6) return ElMessage.warning('密码至少需要 6 位')
  saving.value = true
  try {
    if (editing.value) await adminApi.updateUser(form.username, { displayName: form.displayName, role: form.role })
    else await adminApi.createUser({ ...form })
    userDialog.value = false
    ElMessage.success(editing.value ? '用户信息已更新' : '用户已创建')
    await loadAll()
  } catch (error) { ElMessage.error(error.message) }
  finally { saving.value = false }
}

async function toggleUser(user) {
  try {
    await ElMessageBox.confirm(`${user.active ? '停用' : '启用'}用户 ${user.username}？${user.active ? '该用户所有设备将立即下线。' : ''}`, '账号状态', { type: 'warning' })
    await adminApi.updateUser(user.username, { active: !user.active })
    ElMessage.success(user.active ? '用户已停用' : '用户已启用')
    await loadAll()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message) }
}

function openReset(user) { selectedUser.value = user; newPassword.value = ''; passwordDialog.value = true }

async function resetPassword() {
  if (newPassword.value.length < 6) return ElMessage.warning('密码至少需要 6 位')
  saving.value = true
  try {
    await adminApi.resetPassword(selectedUser.value.username, newPassword.value)
    passwordDialog.value = false
    ElMessage.success('密码已重置')
    await loadAll()
  } catch (error) { ElMessage.error(error.message) }
  finally { saving.value = false }
}

async function revokeSession(session) {
  try {
    await ElMessageBox.confirm(`强制下线 ${session.username} 的 ${deviceName(session.userAgent)}？`, '强制下线', { type: 'warning' })
    await adminApi.revokeSession(session.sessionId)
    ElMessage.success('设备已下线')
    await loadAll()
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error.message) }
}

function deviceName(ua = '') {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS / iPadOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : '未知系统'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '浏览器'
  return `${browser} · ${os}`
}

function relativeTime(value) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime())
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => { loadAll(); refreshTimer = window.setInterval(loadAll, 20_000) })
onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<style scoped>
.admin-view { display: flex; flex-direction: column; gap: 16px; }
.admin-heading, .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.admin-heading p { margin: -8px 0 0; color: var(--pwb-text-secondary); font-size: 13px; }
.admin-section { flex: 0 0 auto; padding: 0; overflow: hidden; }
.section-heading { min-height: 58px; padding: 0 18px; border-bottom: 1px solid var(--pwb-border); }
.section-heading > span, .section-heading div > span { color: var(--pwb-text-secondary); font-size: 12px; }
.user-row, .session-row { min-height: 66px; padding: 10px 18px; display: grid; align-items: center; gap: 14px; border-bottom: 1px solid var(--pwb-border); }
.user-row { grid-template-columns: minmax(180px, 1.4fr) 90px 76px 100px minmax(230px, auto); }
.session-row { grid-template-columns: minmax(140px, 1fr) minmax(170px, 1.4fr) 110px 110px 86px auto; }
.user-row:last-child, .session-row:last-child { border-bottom: 0; }
.user-identity, .device { display: flex; align-items: center; gap: 10px; min-width: 0; }
.avatar { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--pwb-primary) 12%, var(--pwb-bg-card)); color: var(--pwb-primary); font-weight: 700; }
.user-identity div, .session-row > div { display: flex; flex-direction: column; min-width: 0; }
small { color: var(--pwb-text-secondary); font-size: 11px; margin-top: 3px; }
.status { display: inline-flex; align-items: center; gap: 6px; color: #16a34a; font-size: 13px; }
.status i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.status.off { color: var(--pwb-text-secondary); }
.online-count { color: var(--pwb-text-secondary); font-size: 12px; }
.row-actions { display: flex; justify-content: flex-end; white-space: nowrap; }
.dialog-tip { margin: 0 0 18px; color: var(--pwb-text-secondary); }

@media (max-width: 900px) {
  .user-row { grid-template-columns: minmax(160px, 1.4fr) 82px 70px minmax(210px, auto); }
  .online-count { display: none; }
  .session-row { grid-template-columns: minmax(120px, 1fr) minmax(150px, 1.3fr) 100px 76px auto; }
  .session-row > div:nth-child(3) { display: none; }
}

@media (max-width: 640px) {
  .admin-view { padding: 10px 16px 24px; background: var(--pwb-bg-card); }
  .admin-heading { align-items: flex-start; }
  .admin-heading > div { display: none; }
  .admin-heading .el-button { margin-left: auto; }
  .admin-section { border-width: 1px 0; border-radius: 0; margin: 0 -16px; }
  .section-heading { min-height: 54px; padding: 0 16px; }
  .user-row, .session-row { display: flex; flex-wrap: wrap; padding: 14px 16px; gap: 9px 12px; }
  .user-identity, .session-row > div:first-child { flex: 1 1 180px; }
  .user-row > .el-tag, .user-row > .status { flex: 0 0 auto; }
  .row-actions { flex: 1 0 100%; justify-content: flex-start; border-top: 1px dashed var(--pwb-border); padding-top: 6px; }
  .session-row .device { order: 3; flex: 1 0 100%; }
  .session-row > div:nth-child(3) { display: none; }
  .session-row > div:nth-child(4) { order: 4; flex-direction: row; gap: 6px; }
  .session-row > .status { margin-left: auto; }
  .session-row > .el-button { order: 5; margin-left: auto; }
}
</style>
