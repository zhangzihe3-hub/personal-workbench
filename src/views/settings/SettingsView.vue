<!--
  系统设置页（PRD 3.7）
  五个分区：
  1. 基础设置（工作时间段 / 默认提醒 / 番茄钟时长 / 主题 / 主色）
  2. 分类与标签（分类增删、标签增删与合并）
  3. 数据管理（导出 JSON 可加密 / 导入覆盖 / 一键清空）
  4. 安全设置（解锁密码 SHA-256 / 自动锁定时长）
  5. 关于（版本 / 新手引导 / 快捷键说明）
  所有设置修改经 settingsStore.update 即时生效；增删改接入全局撤销栈。
  主色修改同步更新 --pwb-primary 与 Element Plus 主色 --el-color-primary。
-->
<template>
  <div class="page-container settings-view">
    <h2 class="page-title">系统设置</h2>

    <!-- ============ 1. 基础设置 ============ -->
    <section class="pwb-card settings-section">
      <div class="section-title">基础设置</div>
      <el-form label-width="140px" class="section-form">
        <el-form-item label="工作时间段">
          <el-time-select
            v-model="form.workStart" start="06:00" step="00:30" end="23:00"
            style="width: 140px" @change="v => applySetting('workStart', v, '工作开始时间')"
          />
          <span class="form-sep">至</span>
          <el-time-select
            v-model="form.workEnd" start="06:00" step="00:30" end="23:59"
            style="width: 140px" @change="v => applySetting('workEnd', v, '工作结束时间')"
          />
        </el-form-item>
        <el-form-item label="默认提醒时长">
          <el-input-number
            v-model="form.defaultRemind" :min="0" :max="1440"
            @change="v => applySetting('defaultRemind', v, '默认提醒时长')"
          />
          <span class="form-hint">分钟（0 为不提醒）</span>
        </el-form-item>
        <el-form-item label="任务截止提醒">
          <el-input-number
            v-model="form.defaultTaskRemind" :min="0" :max="1440"
            @change="v => applySetting('defaultTaskRemind', v, '任务截止提醒')"
          />
          <span class="form-hint">分钟（0 为不提醒，任务可单独覆盖）</span>
        </el-form-item>
        <el-form-item label="番茄钟工作时长">
          <el-input-number
            v-model="form.pomodoroWork" :min="1" :max="120"
            @change="v => applySetting('pomodoroWork', v, '番茄钟工作时长')"
          />
          <span class="form-hint">分钟</span>
        </el-form-item>
        <el-form-item label="番茄钟休息时长">
          <el-input-number
            v-model="form.pomodoroBreak" :min="1" :max="60"
            @change="v => applySetting('pomodoroBreak', v, '番茄钟休息时长')"
          />
          <span class="form-hint">分钟</span>
        </el-form-item>
        <el-form-item label="外观主题">
          <div class="theme-picker" role="radiogroup" aria-label="外观主题">
            <button
              v-for="theme in THEMES" :key="theme.value" type="button" role="radio"
              class="theme-option" :class="[`theme-${theme.value}`, { selected: form.theme === theme.value }]"
              :aria-checked="form.theme === theme.value" @click="selectTheme(theme.value)"
            >
              <span class="theme-swatch"><el-icon v-if="form.theme === theme.value"><Check /></el-icon></span>
              <span>{{ theme.label }}</span>
            </button>
          </div>
        </el-form-item>
      </el-form>
    </section>

    <!-- ============ 2. 分类与标签 ============ -->
    <section class="pwb-card settings-section">
      <div class="section-title">分类与标签</div>
      <div class="meta-grid">
        <!-- 任务分类 -->
        <div class="meta-block">
          <div class="meta-label">任务分类</div>
          <div class="chip-list">
            <el-tag
              v-for="c in metaStore.taskCategories" :key="c" closable
              @close="removeCategory(c, 'task')"
            >{{ c }}</el-tag>
          </div>
          <div class="add-row">
            <el-input v-model="newTaskCategory" size="small" maxlength="50" placeholder="新分类名称" @keyup.enter="addCategory('task')" />
            <el-button size="small" @click="addCategory('task')">添加</el-button>
          </div>
        </div>
        <!-- 日程分类 -->
        <div class="meta-block">
          <div class="meta-label">日程分类</div>
          <div class="chip-list">
            <el-tag
              v-for="c in metaStore.scheduleCategories" :key="c" closable type="warning"
              @close="removeCategory(c, 'schedule')"
            >{{ c }}</el-tag>
          </div>
          <div class="add-row">
            <el-input v-model="newScheduleCategory" size="small" maxlength="50" placeholder="新分类名称" @keyup.enter="addCategory('schedule')" />
            <el-button size="small" @click="addCategory('schedule')">添加</el-button>
          </div>
        </div>
        <!-- 全局标签 -->
        <div class="meta-block">
          <div class="meta-label">全局标签</div>
          <div class="chip-list">
            <el-tag
              v-for="t in metaStore.allTags" :key="t" closable type="success" effect="plain"
              @close="removeTag(t)"
            >#{{ t }}</el-tag>
            <span v-if="!metaStore.allTags.length" class="form-hint">暂无标签</span>
          </div>
          <div class="add-row">
            <el-input v-model="newTag" size="small" maxlength="50" placeholder="新标签名称" @keyup.enter="addTag" />
            <el-button size="small" @click="addTag">添加</el-button>
          </div>
        </div>
        <!-- 标签合并 -->
        <div class="meta-block">
          <div class="meta-label">标签合并</div>
          <div class="merge-row">
            <el-select v-model="mergeFrom" size="small" filterable placeholder="源标签（将被替换）">
              <el-option v-for="t in metaStore.allTags" :key="t" :label="`#${t}`" :value="t" />
            </el-select>
            <el-icon><Right /></el-icon>
            <el-select v-model="mergeTo" size="small" filterable allow-create default-first-option placeholder="目标标签">
              <el-option v-for="t in metaStore.allTags" :key="t" :label="`#${t}`" :value="t" />
            </el-select>
            <el-button size="small" type="primary" @click="mergeTags">合并</el-button>
          </div>
          <div class="form-hint">合并后所有任务与笔记中的源标签会被替换为目标标签</div>
        </div>
      </div>
    </section>

    <!-- ============ 3. 数据管理 ============ -->
    <section class="pwb-card settings-section">
      <div class="section-title">数据管理</div>
      <div class="data-block">
        <div class="data-row">
          <div class="data-info">
            <div class="data-name">导出全部数据</div>
            <div class="data-desc">导出任务、日程、笔记、设置等全部数据为 JSON 备份文件</div>
          </div>
          <el-checkbox v-model="exportEncrypted" size="small">密码加密</el-checkbox>
          <el-input
            v-if="exportEncrypted" v-model="exportPassword" size="small" type="password" show-password
            placeholder="加密密码" style="width: 150px"
          />
          <el-button type="primary" @click="exportData">
            <el-icon><Download /></el-icon>导出 JSON
          </el-button>
        </div>
        <div class="data-row">
          <div class="data-info">
            <div class="data-name">导入数据</div>
            <div class="data-desc">从 JSON 备份文件恢复数据（覆盖当前数据，支持加密备份）</div>
          </div>
          <input ref="importFileRef" type="file" accept=".json,application/json" style="display: none" @change="onImportFile" />
          <el-button @click="importFileRef?.click()">
            <el-icon><Upload /></el-icon>选择文件导入
          </el-button>
        </div>
        <div class="data-row danger">
          <div class="data-info">
            <div class="data-name">一键清空</div>
            <div class="data-desc">清空全部业务数据（保留系统设置），操作前请先导出备份</div>
          </div>
          <el-button type="danger" plain @click="clearAll">
            <el-icon><Delete /></el-icon>清空所有数据
          </el-button>
        </div>
      </div>
    </section>

    <!-- ============ 4. 账号安全 ============ -->
    <section class="pwb-card settings-section">
      <div class="section-title">账号安全</div>
      <div class="account-security-row">
        <div class="account-avatar" aria-hidden="true">{{ accountInitial }}</div>
        <div class="data-info">
          <div class="data-name">登录密码</div>
          <div class="data-desc">
            当前账号：{{ currentUser?.displayName || currentUser?.username || '当前用户' }}
            <span v-if="currentUser?.displayName && currentUser?.username">（{{ currentUser.username }}）</span>
          </div>
          <div class="data-desc">修改服务器登录密码后，其他已登录设备会立即下线，本设备保持登录。</div>
        </div>
        <el-button type="primary" plain @click="loginPasswordDialogVisible = true">修改登录密码</el-button>
      </div>
    </section>

    <!-- ============ 5. 本机应用锁 ============ -->
    <section class="pwb-card settings-section">
      <div class="section-title">本机应用锁</div>
      <el-form label-width="140px" class="section-form">
        <el-form-item label="本机解锁密码">
          <template v-if="!settingsStore.settings.passwordHash">
            <el-input v-model="pwdForm.newPwd" type="password" show-password size="small" placeholder="设置新密码" style="width: 180px" />
            <el-input v-model="pwdForm.confirmPwd" type="password" show-password size="small" placeholder="确认密码" style="width: 180px" />
            <el-button size="small" type="primary" @click="setPassword">设置密码</el-button>
          </template>
          <template v-else>
            <el-input v-model="pwdForm.oldPwd" type="password" show-password size="small" placeholder="当前密码" style="width: 160px" />
            <el-input v-model="pwdForm.newPwd" type="password" show-password size="small" placeholder="新密码" style="width: 160px" />
            <el-input v-model="pwdForm.confirmPwd" type="password" show-password size="small" placeholder="确认新密码" style="width: 160px" />
            <el-button size="small" type="primary" @click="changePassword">修改密码</el-button>
            <el-button size="small" type="danger" plain @click="clearPassword">清除密码</el-button>
          </template>
          <div class="form-hint full">仅保护当前设备上的应用，不会修改服务器登录密码；密码使用 SHA-256 不可逆哈希本地存储</div>
        </el-form-item>
        <el-form-item label="自动锁定">
          <el-radio-group
            v-model="form.autoLockMinutes"
            @change="v => applySetting('autoLockMinutes', v, '自动锁定时长')"
          >
            <el-radio-button :value="0">从不</el-radio-button>
            <el-radio-button :value="5">5 分钟</el-radio-button>
            <el-radio-button :value="10">10 分钟</el-radio-button>
            <el-radio-button :value="30">30 分钟</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </section>

    <!-- ============ 6. 关于 ============ -->
    <section class="pwb-card settings-section">
      <div class="section-title">关于</div>
      <div class="about-row">
        <span>个人工作台 Personal Workbench</span>
        <el-tag size="small" effect="plain">版本 1.5.0</el-tag>
        <el-button size="small" @click="replayOnboarding">重新播放新手引导</el-button>
      </div>
      <div class="shortcut-title">快捷键说明</div>
      <table class="shortcut-table">
        <tbody>
          <tr v-for="s in SHORTCUTS" :key="s.keys">
            <td class="sc-keys"><kbd>{{ s.keys }}</kbd></td>
            <td class="sc-desc">{{ s.desc }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <el-dialog
      v-model="loginPasswordDialogVisible"
      title="修改登录密码"
      width="440px"
      class="mobile-sheet-dialog login-password-dialog"
      append-to-body
      :close-on-click-modal="!changingLoginPassword"
      :close-on-press-escape="!changingLoginPassword"
      @closed="resetLoginPasswordForm"
    >
      <div class="login-password-tip">请输入当前服务器登录密码，并设置至少 6 位的新密码。</div>
      <el-form label-position="top" @submit.prevent="submitLoginPassword">
        <el-form-item label="当前登录密码">
          <el-input
            v-model="loginPasswordForm.currentPassword"
            type="password"
            show-password
            autocomplete="current-password"
            placeholder="请输入当前登录密码"
          />
        </el-form-item>
        <el-form-item label="新登录密码">
          <el-input
            v-model="loginPasswordForm.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
            maxlength="128"
            placeholder="至少 6 位"
          />
        </el-form-item>
        <el-form-item label="再次输入新密码">
          <el-input
            v-model="loginPasswordForm.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
            maxlength="128"
            placeholder="请再次输入新密码"
            @keyup.enter="submitLoginPassword"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="changingLoginPassword" @click="loginPasswordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="changingLoginPassword" @click="submitLoginPassword">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSettingsStore } from '@/stores/settings'
import { useMetaStore } from '@/stores/meta'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore } from '@/stores/schedule'
import { useNoteStore } from '@/stores/note'
import { useGoalStore } from '@/stores/goal'
import { useToolboxStore } from '@/stores/toolbox'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { exportAllData, importAllData, clearAllData } from '@/db'
import { downloadJSON, encryptText, decryptText, sha256 } from '@/utils/exporter'
import { dateKey } from '@/utils/datetime'
import { changeLoginPassword, getCurrentUser } from '@/services/api'

const settingsStore = useSettingsStore()
const metaStore = useMetaStore()
const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()
const noteStore = useNoteStore()
const goalStore = useGoalStore()
const toolboxStore = useToolboxStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()

const currentUser = getCurrentUser()
const accountInitial = String(currentUser?.displayName || currentUser?.username || '我').trim().slice(0, 1).toUpperCase()
const loginPasswordDialogVisible = ref(false)
const changingLoginPassword = ref(false)
const loginPasswordForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })

function resetLoginPasswordForm() {
  loginPasswordForm.currentPassword = ''
  loginPasswordForm.newPassword = ''
  loginPasswordForm.confirmPassword = ''
}

async function submitLoginPassword() {
  if (changingLoginPassword.value) return
  if (!loginPasswordForm.currentPassword) { ElMessage.warning('请输入当前登录密码'); return }
  if (loginPasswordForm.newPassword.length < 6) { ElMessage.warning('新密码至少需要 6 位'); return }
  if (loginPasswordForm.newPassword.length > 128) { ElMessage.warning('新密码不能超过 128 位'); return }
  if (loginPasswordForm.currentPassword === loginPasswordForm.newPassword) { ElMessage.warning('新密码不能与当前密码相同'); return }
  if (loginPasswordForm.newPassword !== loginPasswordForm.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  changingLoginPassword.value = true
  try {
    const result = await changeLoginPassword(loginPasswordForm.currentPassword, loginPasswordForm.newPassword)
    loginPasswordDialogVisible.value = false
    const revoked = Number(result?.revokedOtherSessions || 0)
    ElMessage.success(revoked ? `登录密码已修改，其他 ${revoked} 个设备已下线` : '登录密码已修改')
  } catch (error) {
    ElMessage.error(error.message || '修改登录密码失败')
  } finally {
    changingLoginPassword.value = false
  }
}

/* ---------------- 本地表单（初始值来自全局设置） ---------------- */
const form = reactive({ ...settingsStore.settings })
const THEMES = [
  { value: 'white', label: '白色' },
  { value: 'black', label: '黑色' },
  { value: 'blue', label: '蓝色' },
  { value: 'green', label: '绿色' }
]

async function selectTheme(value) {
  form.theme = value
  await applySetting('theme', value, '外观主题')
}

/** 通用设置修改：update 即时生效 + 轻提示 + 撤销 */
async function applySetting(field, value, label) {
  const oldValue = settingsStore.settings[field]
  if (JSON.stringify(oldValue) === JSON.stringify(value)) return
  await settingsStore.update({ [field]: value })
  undoStore.push({
    label: `修改${label}`,
    undo: async () => {
      await settingsStore.update({ [field]: oldValue })
      form[field] = oldValue
    },
    redo: async () => {
      await settingsStore.update({ [field]: value })
      form[field] = value
    }
  })
  ElMessage.success('设置已保存')
}

/* ---------------- 分类管理 ---------------- */
const newTaskCategory = ref('')
const newScheduleCategory = ref('')

async function addCategory(type) {
  const name = (type === 'task' ? newTaskCategory.value : newScheduleCategory.value).trim()
  if (!name) return
  if (metaStore.categories.some(c => c.name === name)) {
    ElMessage.warning('任务与日程的分类名称需全局唯一')
    return
  }
  await metaStore.addCategory(name, type)
  if (type === 'task') newTaskCategory.value = ''
  else newScheduleCategory.value = ''
  undoStore.push({
    label: '新增分类',
    undo: async () => { await metaStore.removeCategory(name, type) },
    redo: async () => { await metaStore.addCategory(name, type) }
  })
  ElMessage.success('分类已添加')
}

async function removeCategory(name, type) {
  await metaStore.removeCategory(name, type)
  undoStore.push({
    label: '删除分类',
    undo: async () => { await metaStore.addCategory(name, type) },
    redo: async () => { await metaStore.removeCategory(name, type) }
  })
  ElMessage.success('分类已删除，可通过 Ctrl+Z 撤销')
}

/* ---------------- 标签管理 ---------------- */
const newTag = ref('')

async function addTag() {
  const name = newTag.value.trim()
  if (!name) return
  if (metaStore.allTags.includes(name)) { ElMessage.warning('标签已存在'); return }
  await metaStore.addTag(name)
  newTag.value = ''
  undoStore.push({
    label: '新增标签',
    undo: async () => { await metaStore.removeTag(name) },
    redo: async () => { await metaStore.addTag(name) }
  })
  ElMessage.success('标签已添加')
}

async function removeTag(name) {
  await metaStore.removeTag(name)
  undoStore.push({
    label: '删除标签',
    undo: async () => { await metaStore.addTag(name) },
    redo: async () => { await metaStore.removeTag(name) }
  })
  ElMessage.success('标签已删除，可通过 Ctrl+Z 撤销')
}

/* ---------------- 标签合并 ---------------- */
const mergeFrom = ref('')
const mergeTo = ref('')

async function mergeTags() {
  const from = mergeFrom.value
  const to = (mergeTo.value || '').trim()
  if (!from || !to) { ElMessage.warning('请选择源标签与目标标签'); return }
  if (from === to) { ElMessage.warning('源标签与目标标签不能相同'); return }
  // 快照受影响实体的 tags，供撤销恢复
  const affectedTasks = taskStore.tasks.filter(t => t.tags?.includes(from))
    .map(t => ({ id: t.task_id, tags: [...t.tags] }))
  const affectedNotes = noteStore.notes.filter(n => n.tags?.includes(from))
    .map(n => ({ id: n.note_id, tags: [...n.tags] }))
  await metaStore.mergeTag(from, to, { tasks: taskStore.tasks, notes: noteStore.notes })
  undoStore.push({
    label: '合并标签',
    undo: async () => {
      await metaStore.addTag(from)
      for (const s of affectedTasks) await taskStore.updateTask(s.id, { tags: s.tags })
      for (const s of affectedNotes) await noteStore.updateNote(s.id, { tags: s.tags })
    },
    redo: async () => {
      await metaStore.mergeTag(from, to, { tasks: taskStore.tasks, notes: noteStore.notes })
    }
  })
  mergeFrom.value = ''
  mergeTo.value = ''
  ElMessage.success(`已将 #${from} 合并到 #${to}`)
}

/* ---------------- 数据管理 ---------------- */
const exportPassword = ref('')
const exportEncrypted = ref(false)
const importFileRef = ref(null)

/** 导出全部数据为 JSON（可选密码加密，文件名含日期） */
async function exportData() {
  const data = await exportAllData()
  const filename = `pwb_backup_${dateKey(new Date())}.json`
  if (exportEncrypted.value) {
    if (!exportPassword.value) { ElMessage.warning('请先填写加密密码'); return }
    const payload = encryptText(JSON.stringify(data), exportPassword.value)
    downloadJSON({ app: 'personal-workbench', encrypted: true, payload }, filename)
    ElMessage.success('已导出加密备份文件')
  } else {
    downloadJSON(data, filename)
    ElMessage.success('已导出备份文件')
  }
}

/** 导入：支持明文 JSON 与加密备份；导入前确认覆盖风险 */
function onImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = '' // 允许重复选择同一文件
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    const text = String(reader.result || '')
    let json = null
    try {
      const parsed = JSON.parse(text)
      if (parsed && parsed.encrypted && parsed.payload) {
        // 加密备份：解密后解析
        json = JSON.parse(await askDecrypt(parsed.payload))
      } else {
        json = parsed
      }
    } catch (err1) {
      // 兜底：文件内容本身是加密字符串（无 JSON 包装）
      try {
        json = JSON.parse(await askDecrypt(text.trim()))
      } catch {
        ElMessage.error('导入失败：文件格式不正确或密码错误')
        return
      }
    }
    try {
      await ElMessageBox.confirm(
        '导入将覆盖当前全部本地数据，且不可恢复。建议先导出备份。确定继续导入吗？',
        '覆盖风险提示',
        { confirmButtonText: '确定导入', cancelButtonText: '取消', type: 'warning' }
      )
    } catch { return }
    try {
      await importAllData(json)
      await reloadAllStores()
      ElMessage.success('数据导入成功')
    } catch (err) {
      ElMessage.error(`导入失败：${err.message || '数据格式不正确'}`)
    }
  }
  reader.readAsText(file)
}

/** 弹出密码输入并解密；解密失败抛错 */
async function askDecrypt(payload) {
  const { value } = await ElMessageBox.prompt('该备份文件已加密，请输入密码', '解密备份', {
    confirmButtonText: '解密', cancelButtonText: '取消', inputType: 'password'
  })
  return decryptText(payload, value || '')
}

/** 导入/清空后重新加载全部 store 刷新界面 */
async function reloadAllStores() {
  await settingsStore.load()
  await Promise.all([
    metaStore.load(), taskStore.load(), scheduleStore.load(),
    noteStore.load(), goalStore.load(), toolboxStore.load()
  ])
  // 表单与最新设置同步（导入可能改变了设置项）
  Object.assign(form, settingsStore.settings)
  settingsStore.applyTheme()
}

/** 一键清空：连续两次确认 */
async function clearAll() {
  try {
    await ElMessageBox.confirm(
      '此操作将清空任务、日程、笔记、目标、习惯、收藏等全部业务数据（保留系统设置）。是否继续？',
      '清空数据',
      { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' }
    )
    await ElMessageBox.confirm(
      '请再次确认：清空后数据无法恢复（撤销栈也无法还原整库）。建议先导出备份。确定清空吗？',
      '最后确认',
      { confirmButtonText: '确定清空', cancelButtonText: '取消', type: 'error' }
    )
  } catch { return }
  await clearAllData()
  await reloadAllStores()
  ElMessage.success('已清空全部业务数据')
}

/* ---------------- 安全设置 ---------------- */
const pwdForm = reactive({ oldPwd: '', newPwd: '', confirmPwd: '' })

function resetPwdForm() {
  pwdForm.oldPwd = ''
  pwdForm.newPwd = ''
  pwdForm.confirmPwd = ''
}

/** 设置新密码（当前无密码时） */
async function setPassword() {
  if (!pwdForm.newPwd) { ElMessage.warning('请输入密码'); return }
  if (pwdForm.newPwd !== pwdForm.confirmPwd) { ElMessage.warning('两次输入的密码不一致'); return }
  const hash = await sha256(pwdForm.newPwd)
  await settingsStore.update({ passwordHash: hash })
  undoStore.push({
    label: '设置解锁密码',
    undo: async () => { await settingsStore.update({ passwordHash: '' }) },
    redo: async () => { await settingsStore.update({ passwordHash: hash }) }
  })
  resetPwdForm()
  ElMessage.success('密码已设置，下次启动需解锁')
}

/** 修改密码（验证旧密码） */
async function changePassword() {
  const oldHash = await sha256(pwdForm.oldPwd || '')
  if (oldHash !== settingsStore.settings.passwordHash) { ElMessage.error('当前密码不正确'); return }
  if (!pwdForm.newPwd) { ElMessage.warning('请输入新密码'); return }
  if (pwdForm.newPwd !== pwdForm.confirmPwd) { ElMessage.warning('两次输入的新密码不一致'); return }
  const prevHash = settingsStore.settings.passwordHash
  const hash = await sha256(pwdForm.newPwd)
  await settingsStore.update({ passwordHash: hash })
  undoStore.push({
    label: '修改解锁密码',
    undo: async () => { await settingsStore.update({ passwordHash: prevHash }) },
    redo: async () => { await settingsStore.update({ passwordHash: hash }) }
  })
  resetPwdForm()
  ElMessage.success('密码已修改')
}

/** 清除密码（验证旧密码 + 二次确认） */
async function clearPassword() {
  const oldHash = await sha256(pwdForm.oldPwd || '')
  if (oldHash !== settingsStore.settings.passwordHash) { ElMessage.error('当前密码不正确'); return }
  try {
    await ElMessageBox.confirm('清除密码后应用将不再锁定，确定清除吗？', '清除密码', {
      confirmButtonText: '确定清除', cancelButtonText: '取消', type: 'warning'
    })
  } catch { return }
  const prevHash = settingsStore.settings.passwordHash
  await settingsStore.update({ passwordHash: '' })
  undoStore.push({
    label: '清除解锁密码',
    undo: async () => { await settingsStore.update({ passwordHash: prevHash }) },
    redo: async () => { await settingsStore.update({ passwordHash: '' }) }
  })
  resetPwdForm()
  ElMessage.success('密码已清除')
}

/* ---------------- 关于 ---------------- */
const SHORTCUTS = [
  { keys: 'Ctrl + K', desc: '呼出全局搜索' },
  { keys: 'Ctrl + N', desc: '快速新建任务' },
  { keys: 'Ctrl + Shift + N', desc: '快速新建笔记' },
  { keys: 'Ctrl + Z', desc: '撤销上一步操作' },
  { keys: 'Ctrl + Y / Ctrl + Shift + Z', desc: '重做' },
  { keys: 'Esc', desc: '关闭当前弹窗 / 面板' }
]

function replayOnboarding() {
  uiStore.onboardingVisible = true
  ElMessage.success('已打开新手引导')
}
</script>

<style scoped>
.settings-view { display: flex; flex-direction: column; gap: 16px; max-width: 960px; }
.settings-section { display: flex; flex-direction: column; gap: 16px; }
.section-title { font-weight: 600; font-size: 15px; padding-bottom: 8px; border-bottom: 1px solid var(--pwb-border); }
.section-form :deep(.el-form-item) { margin-bottom: 16px; }
.form-sep { margin: 0 8px; color: var(--pwb-text-secondary); }
.form-hint { margin-left: 8px; font-size: 12px; color: var(--pwb-text-secondary); }
.form-hint.full { width: 100%; margin-left: 0; margin-top: 4px; }
.theme-picker { display: grid; grid-template-columns: repeat(4, minmax(74px, 1fr)); gap: 14px; width: min(460px, 100%); }
.theme-option { min-height: 86px; padding: 8px; border: 1px solid var(--pwb-border); border-radius: 10px; background: transparent; color: var(--pwb-text); font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 7px; }
.theme-option.selected { border-color: var(--pwb-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--pwb-primary) 16%, transparent); }
.theme-swatch { width: 52px; height: 42px; border-radius: 7px; border: 1px solid rgba(0,0,0,.12); display: grid; place-items: center; color: #fff; }
.theme-white .theme-swatch { background: #fff; color: #2563eb; }
.theme-black .theme-swatch { background: #1d1e1f; }
.theme-blue .theme-swatch { background: #2563eb; }
.theme-green .theme-swatch { background: #16a34a; }

/* 分类与标签 */
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.meta-block { display: flex; flex-direction: column; gap: 8px; }
.meta-label { font-size: 13px; font-weight: 600; color: var(--pwb-text-secondary); }
.chip-list { display: flex; flex-wrap: wrap; gap: 8px; min-height: 32px; }
.add-row { display: flex; gap: 8px; }
.merge-row { display: flex; align-items: center; gap: 8px; }

/* 数据管理 */
.data-block { display: flex; flex-direction: column; gap: 8px; }
.data-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
}
.data-row.danger { border-color: var(--pwb-p0); }
.data-info { flex: 1; }
.data-name { font-weight: 600; margin-bottom: 4px; }
.data-desc { font-size: 12px; color: var(--pwb-text-secondary); }

/* 账号安全 */
.account-security-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
}
.account-avatar {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--pwb-primary) 14%, var(--pwb-bg-card));
  color: var(--pwb-primary);
  font-size: 17px;
  font-weight: 700;
}
.login-password-tip { margin-bottom: 16px; color: var(--pwb-text-secondary); font-size: 13px; line-height: 1.6; }

/* 关于 */
.about-row { display: flex; align-items: center; gap: 16px; }
.shortcut-title { font-size: 13px; font-weight: 600; color: var(--pwb-text-secondary); margin-top: 8px; }
.shortcut-table { border-collapse: collapse; width: 100%; }
.shortcut-table td { padding: 8px; border-bottom: 1px solid var(--pwb-border); font-size: 13px; }
.sc-keys { width: 240px; }
.sc-keys kbd {
  background: var(--pwb-bg-hover);
  border: 1px solid var(--pwb-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: 12px;
}
.sc-desc { color: var(--pwb-text-secondary); }

@media (max-width: 640px) {
  .theme-picker { grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .theme-option { min-width: 0; min-height: 78px; padding: 6px 2px; }
  .theme-swatch { width: 44px; height: 36px; }
  .account-security-row { align-items: flex-start; flex-wrap: wrap; padding: 14px; }
  .account-security-row .data-info { min-width: calc(100% - 60px); }
  .account-security-row > .el-button { width: 100%; margin-left: 58px; }
}
</style>
