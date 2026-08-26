<template>
  <ServerLogin v-if="authReady && !authenticated" @authenticated="bootstrap" />
  <LockScreen v-else-if="settingsStore.locked" />
  <template v-else-if="ready && authenticated">
    <AppLayout />
    <!-- 全局弹层 -->
    <GlobalSearch />
    <QuickTaskDialog />
    <QuickNoteDialog />
    <OnboardingGuide />
    <ReminderPopup />
  </template>
  <div v-else class="app-loading">
    <el-icon class="is-loading" :size="32"><Loading /></el-icon>
    <p>{{ loadError || '正在连接个人工作台服务器…' }}</p>
    <el-button v-if="loadError" type="primary" @click="bootstrap">重试</el-button>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import AppLayout from '@/layout/AppLayout.vue'
import LockScreen from '@/components/common/LockScreen.vue'
import GlobalSearch from '@/components/search/GlobalSearch.vue'
import QuickTaskDialog from '@/components/common/QuickTaskDialog.vue'
import QuickNoteDialog from '@/components/common/QuickNoteDialog.vue'
import OnboardingGuide from '@/components/common/OnboardingGuide.vue'
import ReminderPopup from '@/components/common/ReminderPopup.vue'
import ServerLogin from '@/components/common/ServerLogin.vue'

import { useSettingsStore } from '@/stores/settings'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore } from '@/stores/schedule'
import { useNoteStore } from '@/stores/note'
import { useMetaStore } from '@/stores/meta'
import { useGoalStore } from '@/stores/goal'
import { useToolboxStore } from '@/stores/toolbox'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { startMonitor, stopMonitor } from '@/services/monitor'
import { checkSession, getToken } from '@/services/api'
import { listenForNativeNotificationActions, syncNativeNotifications } from '@/services/native'
import { router } from '@/router'

const ready = ref(false)
const authReady = ref(false)
const authenticated = ref(false)
const loadError = ref('')
const settingsStore = useSettingsStore()
const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()
const colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
const onColorSchemeChange = () => settingsStore.applyTheme()
let nativeNotificationListener = null
let pendingNativeTarget = null
let dataRefreshTimer = null
let dataRefreshing = false
let lastDataRefreshAt = 0

async function loadBusinessData() {
  await Promise.all([
    useMetaStore().load(),
    taskStore.load(),
    scheduleStore.load(),
    useNoteStore().load(),
    useGoalStore().load(),
    useToolboxStore().load()
  ])
  await syncNativeNotifications(taskStore.tasks, scheduleStore.schedules, settingsStore.settings)
}

async function refreshRemoteData({ force = false } = {}) {
  if (!authenticated.value || !ready.value || settingsStore.locked || document.hidden || dataRefreshing) return
  if (!force && Date.now() - lastDataRefreshAt < 12000) return
  dataRefreshing = true
  try {
    await loadBusinessData()
    lastDataRefreshAt = Date.now()
    window.dispatchEvent(new CustomEvent('pwb:data-refreshed', { detail: { at: lastDataRefreshAt } }))
  } catch {
    // 临时断网时保留当前数据，下次轮询或恢复前台后继续同步。
  } finally {
    dataRefreshing = false
  }
}

function requestDataRefresh() {
  refreshRemoteData({ force: true })
}

function onVisibilityChange() {
  if (!document.hidden) requestDataRefresh()
}

function startDataSync() {
  stopDataSync()
  dataRefreshTimer = window.setInterval(() => refreshRemoteData(), 15000)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', requestDataRefresh)
  window.addEventListener('online', requestDataRefresh)
  window.addEventListener('pwb:refresh-request', requestDataRefresh)
}

function stopDataSync() {
  if (dataRefreshTimer) window.clearInterval(dataRefreshTimer)
  dataRefreshTimer = null
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', requestDataRefresh)
  window.removeEventListener('online', requestDataRefresh)
  window.removeEventListener('pwb:refresh-request', requestDataRefresh)
}

function openNativeTarget(target) {
  if (!ready.value) { pendingNativeTarget = target; return }
  const route = target.type === 'task' ? '/tasks' : '/schedule'
  router.push(route)
  uiStore.openDetail(target.type, target.id)
  pendingNativeTarget = null
}

/** 全局快捷键（PRD 3.5.4 + 撤销增强） */
function onKeydown(e) {
  const mod = e.ctrlKey || e.metaKey
  if (e.key === 'Escape') {
    if (uiStore.handleEscape()) e.preventDefault()
    return
  }
  if (!mod) return
  const key = e.key.toLowerCase()
  if (key === 'k') {
    e.preventDefault()
    uiStore.openSearch()
  } else if (key === 'n' && e.shiftKey) {
    e.preventDefault()
    uiStore.quickNoteVisible = true
  } else if (key === 'n') {
    e.preventDefault()
    uiStore.quickTaskVisible = true
  } else if (key === 'z' && !e.shiftKey) {
    // 输入框内不拦截系统撤销
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
    e.preventDefault()
    undoStore.undo()
  } else if ((key === 'y') || (key === 'z' && e.shiftKey)) {
    const tag = document.activeElement?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
    e.preventDefault()
    undoStore.redo()
  }
}

async function bootstrap() {
  ready.value = false
  loadError.value = ''
  try {
    await settingsStore.load()
    // 并行加载全部业务数据（本地单用户，数据量小）
    await loadBusinessData()
    lastDataRefreshAt = Date.now()
    authenticated.value = true
    ready.value = true
    startMonitor()
    startDataSync()
    if (pendingNativeTarget) openNativeTarget(pendingNativeTarget)
  // 新手引导
    if (!settingsStore.settings.onboarded) uiStore.onboardingVisible = true
  // 主题跟随系统变化
  } catch (error) {
    authenticated.value = Boolean(getToken())
    loadError.value = error.message || '服务器连接失败'
  }
}

function onAuthExpired() {
  stopMonitor()
  stopDataSync()
  ready.value = false
  authenticated.value = false
  authReady.value = true
}

onMounted(async () => {
  colorSchemeMedia.addEventListener('change', onColorSchemeChange)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('pwb:auth-expired', onAuthExpired)
  nativeNotificationListener = await listenForNativeNotificationActions(openNativeTarget)
  authenticated.value = Boolean(await checkSession())
  authReady.value = true
  if (authenticated.value) await bootstrap()
})

onBeforeUnmount(() => {
  stopMonitor()
  stopDataSync()
  colorSchemeMedia.removeEventListener('change', onColorSchemeChange)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('pwb:auth-expired', onAuthExpired)
  nativeNotificationListener?.remove()
})
</script>

<style scoped>
.app-loading {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--pwb-text-secondary);
}
</style>
