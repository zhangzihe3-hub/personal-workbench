<template>
  <div class="app-layout">
    <!-- 左侧侧边栏 240px（可收起） -->
    <aside class="sidebar" :class="{ collapsed }">
      <div class="logo" @click="$router.push('/dashboard')">
        <span class="logo-icon">⌘</span>
        <span v-if="!collapsed" class="logo-text">个人工作台</span>
      </div>
      <nav class="nav">
        <button
          v-for="item in navItems" :key="item.path"
          class="nav-item" :class="{ 'mobile-hidden': !item.primary, active: route.path === item.path }"
          :title="item.label" type="button"
          @click="navigateTo(item.path)"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span v-if="!collapsed" class="desktop-nav-label">{{ item.label }}</span>
          <span class="mobile-nav-label">{{ item.mobileLabel || item.label }}</span>
          <el-badge v-if="!collapsed && item.badge" :value="item.badge" :max="99" class="nav-badge" />
        </button>
        <button class="nav-item mobile-more-button" type="button" aria-label="更多" :class="{ active: moreActive }" @click="mobileMoreOpen = true">
          <el-icon :size="20"><Grid /></el-icon>
          <span>更多</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="account-summary" :title="currentUser?.username">
          <span class="account-avatar">{{ (currentUser?.displayName || currentUser?.username || 'U').slice(0, 1).toUpperCase() }}</span>
          <span v-if="!collapsed" class="account-copy"><strong>{{ currentUser?.displayName || currentUser?.username }}</strong><small>{{ currentUser?.role === 'admin' ? '管理员' : '普通用户' }}</small></span>
        </div>
        <div class="nav-item" @click="toggleCollapse" :title="collapsed ? '展开侧边栏' : '收起侧边栏'">
          <el-icon :size="18"><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon>
          <span v-if="!collapsed">收起</span>
        </div>
        <div class="nav-item" title="锁定应用" @click="lockApp" v-if="settingsStore.settings.passwordHash">
          <el-icon :size="18"><Lock /></el-icon>
          <span v-if="!collapsed">锁定</span>
        </div>
      </div>
    </aside>

    <!-- 右侧区域 -->
    <div class="main-area">
      <!-- 顶部状态栏 56px -->
      <header class="topbar">
        <strong class="mobile-page-title">{{ pageTitle }}</strong>
        <div class="search-trigger" @click="uiStore.openSearch()">
          <el-icon><Search /></el-icon>
          <span class="search-placeholder">搜索任务、日程、笔记…</span>
          <kbd>Ctrl K</kbd>
        </div>
        <div class="topbar-actions">
          <el-tooltip class="desktop-undo" :content="undoStore.canUndo ? '撤销 (Ctrl+Z)' : '撤销 (Ctrl+Z)，暂无可撤销操作'" :show-after="300">
            <el-button
              text circle
              class="desktop-only-action"
              :class="{ 'btn-inactive': !undoStore.canUndo }"
              @click="onUndoClick"
            ><el-icon><RefreshLeft /></el-icon></el-button>
          </el-tooltip>
          <el-tooltip class="desktop-new-task" content="快速新建任务 (Ctrl+N)" :show-after="300">
            <el-button class="desktop-only-action" type="primary" size="small" @click="uiStore.quickTaskVisible = true">
              <el-icon style="margin-right:4px"><Plus /></el-icon>新建任务
            </el-button>
          </el-tooltip>
          <el-tooltip class="desktop-quick-note" content="快速速记 (Ctrl+Shift+N)" :show-after="300">
            <el-button class="desktop-only-action" size="small" @click="uiStore.quickNoteVisible = true">
              <el-icon style="margin-right:4px"><EditPen /></el-icon>速记
            </el-button>
          </el-tooltip>
          <el-tooltip class="desktop-bell" content="延期任务提醒" :show-after="300">
            <el-button
              text circle class="bell-btn desktop-only-action"
              title="延期任务提醒"
              @click="$router.push('/tasks')"
            >
              <el-icon :size="18"><Bell /></el-icon>
              <span v-if="delayedCount" class="bell-badge">{{ delayedCount > 99 ? '99+' : delayedCount }}</span>
            </el-button>
          </el-tooltip>
          <el-tooltip class="desktop-logout" content="退出服务器登录" :show-after="300">
            <el-button class="desktop-only-action" text circle aria-label="退出登录" @click="logout"><el-icon><SwitchButton /></el-icon></el-button>
          </el-tooltip>
          <el-button class="mobile-create" type="primary" circle aria-label="快速新建任务" @click="uiStore.quickTaskVisible = true">
            <el-icon :size="21"><Plus /></el-icon>
          </el-button>
        </div>
      </header>

      <!-- 主内容区 -->
      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- 右侧详情面板 400px -->
    <DetailPanel />

    <transition name="mobile-sheet">
      <div v-if="mobileMoreOpen" class="mobile-more-layer" @click.self="mobileMoreOpen = false">
        <section class="mobile-more-sheet">
          <div class="mobile-sheet-handle" />
          <div class="mobile-sheet-header">
            <strong>更多功能</strong>
            <el-button text circle aria-label="关闭" @click="mobileMoreOpen = false"><el-icon><Close /></el-icon></el-button>
          </div>
          <div class="mobile-more-grid">
            <button v-for="item in moreNavItems" :key="item.path" type="button" @click="navigateTo(item.path)">
              <span class="more-icon"><el-icon :size="22"><component :is="item.icon" /></el-icon></span>
              <span>{{ item.label }}</span>
            </button>
          </div>
          <div class="mobile-sheet-actions">
            <div class="mobile-account"><span class="account-avatar">{{ (currentUser?.displayName || currentUser?.username || 'U').slice(0, 1).toUpperCase() }}</span><span><strong>{{ currentUser?.displayName || currentUser?.username }}</strong><small>{{ currentUser?.role === 'admin' ? '管理员' : '普通用户' }}</small></span></div>
            <button @click="uiStore.quickNoteVisible = true; mobileMoreOpen = false"><el-icon><EditPen /></el-icon>快速速记</button>
            <button v-if="settingsStore.settings.passwordHash" @click="lockApp(); mobileMoreOpen = false"><el-icon><Lock /></el-icon>锁定应用</button>
            <button class="danger" @click="logout"><el-icon><SwitchButton /></el-icon>退出登录</button>
          </div>
        </section>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import DetailPanel from '@/components/common/DetailPanel.vue'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { useSettingsStore } from '@/stores/settings'
import { useTaskStore } from '@/stores/task'
import { getCurrentUser, logout } from '@/services/api'

const uiStore = useUiStore()
const undoStore = useUndoStore()
const settingsStore = useSettingsStore()
const taskStore = useTaskStore()
const route = useRoute()
const router = useRouter()
const mobileMoreOpen = ref(false)
const currentUser = getCurrentUser()

const collapsed = computed({
  get: () => settingsStore.settings.sidebarCollapsed,
  set: (v) => settingsStore.update({ sidebarCollapsed: v })
})

const delayedCount = computed(() => taskStore.delayedTasks.length)

const navItems = computed(() => [
  { path: '/dashboard', label: '工作台', mobileLabel: '首页', icon: 'HomeFilled', primary: true },
  { path: '/tasks', label: '任务', icon: 'List', badge: taskStore.activeTasks.length || null, primary: true },
  { path: '/schedule', label: '日程', icon: 'Calendar', primary: true },
  { path: '/notes', label: '笔记', icon: 'Notebook', primary: true },
  { path: '/stats', label: '统计', icon: 'DataAnalysis' },
  { path: '/toolbox', label: '工具箱', icon: 'Suitcase' },
  { path: '/goals', label: '目标', icon: 'Aim' },
  { path: '/settings', label: '设置', icon: 'Setting' },
  ...(currentUser?.role === 'admin' ? [{ path: '/users', label: '用户管理', icon: 'UserFilled' }] : [])
])
const moreNavItems = computed(() => navItems.value.filter(item => !item.primary))
const moreActive = computed(() => moreNavItems.value.some(item => item.path === route.path))
const pageTitle = computed(() => navItems.value.find(item => item.path === route.path)?.label || '个人工作台')

function toggleCollapse() {
  collapsed.value = !collapsed.value
}

async function navigateTo(path) {
  mobileMoreOpen.value = false
  uiStore.closeDetail()
  if (route.path !== path) await router.push(path)
  window.dispatchEvent(new CustomEvent('pwb:refresh-request'))
}

/** 撤销点击：无可撤销操作时给出明确提示，避免“点击无反应” */
function onUndoClick() {
  if (undoStore.canUndo) {
    undoStore.undo()
  } else {
    ElMessage.info('暂无操作可撤销')
  }
}

function lockApp() {
  settingsStore.lock()
}
</script>

<style scoped>
.app-layout { display: flex; height: 100%; overflow: hidden; }

.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--pwb-sidebar-bg);
  border-right: 1px solid var(--pwb-border);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
}
.sidebar.collapsed { width: 64px; }

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--pwb-border);
}
.logo-icon {
  width: 32px; height: 32px;
  background: var(--pwb-primary);
  color: #fff; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: 700;
  flex-shrink: 0;
}
.logo-text { font-size: 16px; font-weight: 600; white-space: nowrap; }

.nav { flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--pwb-text);
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease;
  width: 100%; border: 0; background: transparent; font: inherit; text-align: left;
}
.nav-item:hover { background: var(--pwb-bg-hover); }
.nav-item.active { background: color-mix(in srgb, var(--pwb-primary) 12%, transparent); color: var(--pwb-primary); font-weight: 500; }
.nav-badge { margin-left: auto; }
.mobile-nav-label, .mobile-more-button { display: none; }

.sidebar-footer { padding: 8px; border-top: 1px solid var(--pwb-border); }
.account-summary, .mobile-account { display: flex; align-items: center; gap: 10px; padding: 8px 10px; min-width: 0; }
.account-avatar { width: 32px; height: 32px; flex: 0 0 32px; display: grid; place-items: center; border-radius: 9px; background: color-mix(in srgb, var(--pwb-primary) 12%, var(--pwb-bg-card)); color: var(--pwb-primary); font-weight: 700; }
.account-copy, .mobile-account > span:last-child { display: flex; flex-direction: column; overflow: hidden; }
.account-copy strong, .mobile-account strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.account-copy small, .mobile-account small { color: var(--pwb-text-secondary); font-size: 11px; }

.main-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }

.topbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--pwb-sidebar-bg);
  border-bottom: 1px solid var(--pwb-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  gap: 16px;
}
.search-trigger {
  flex: 0 1 420px;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  background: var(--pwb-bg);
  border: 1px solid var(--pwb-border);
  border-radius: 8px;
  color: var(--pwb-text-secondary);
  cursor: pointer;
  transition: border-color 0.15s;
}
.search-trigger:hover { border-color: var(--pwb-primary); }
.search-placeholder { flex: 1; font-size: 13px; }
.search-trigger kbd {
  font-size: 11px;
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: inherit;
}
.topbar-actions { display: flex; align-items: center; gap: 8px; }

/* 无可撤销操作时按钮弱化但仍可点击（点击给提示） */
.btn-inactive { color: var(--pwb-text-secondary); opacity: 0.55; }
.btn-inactive:hover { color: var(--pwb-text); opacity: 0.8; }

/* 铃铛按钮内嵌徽标：点击数字同样触发按钮跳转；扩大点击热区避免边缘点击落空 */
.bell-btn {
  position: relative;
  width: 40px;
  height: 40px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--pwb-bg-hover); /* 固定背景，确保整个区域可点击 */
  border-radius: 50%;
  border: 1px solid var(--pwb-border);
  transition: background 0.15s ease;
}
.bell-btn:hover { background: var(--pwb-bg); }
.bell-btn::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
}
.bell-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: var(--pwb-p0);
  color: #fff;
  font-size: 11px;
  line-height: 17px;
  text-align: center;
  pointer-events: none; /* 点击穿透到按钮 */
  box-shadow: 0 0 0 2px var(--pwb-sidebar-bg);
}

.content { flex: 1; overflow: hidden; }

/* 平板适配 */
@media (max-width: 900px) {
  .sidebar { width: 64px; }
  .sidebar .logo-text, .sidebar .nav-item span, .sidebar .nav-badge { display: none; }
  .search-placeholder { display: none; }
}

@media (max-width: 640px) {
  .app-layout { flex-direction: column-reverse; background: var(--pwb-bg-card); }
  .main-area { width: 100%; min-height: 0; }
  .sidebar, .sidebar.collapsed {
    width: 100%; height: calc(64px + env(safe-area-inset-bottom));
    border-right: 0; border-top: 1px solid var(--pwb-border); z-index: 1100;
    padding-bottom: env(safe-area-inset-bottom); background: var(--pwb-bg-card);
  }
  .logo, .sidebar-footer { display: none; }
  .nav { flex-direction: row; padding: 6px 8px 4px; gap: 0; overflow: hidden; }
  .nav-item {
    min-width: 0; flex: 1 1 20%; flex-direction: column; justify-content: center; gap: 3px;
    padding: 4px 2px; border-radius: 10px; font-size: 11px; line-height: 1.1;
    border: 0; background: transparent; font-family: inherit;
    touch-action: manipulation; -webkit-tap-highlight-color: transparent; pointer-events: auto;
  }
  .nav-item.mobile-hidden { display: none; }
  .mobile-more-button { display: flex; }
  .desktop-nav-label { display: none !important; }
  .sidebar .nav-item .mobile-nav-label, .mobile-more-button span { display: block; }
  .nav-item.active { background: transparent; color: var(--pwb-primary); font-weight: 600; }
  .nav-badge { display: none; }
  .topbar {
    height: calc(58px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 16px 0;
    gap: 8px; background: var(--pwb-bg-card); border-bottom-color: color-mix(in srgb, var(--pwb-border) 70%, transparent);
  }
  .search-trigger {
    flex: 0 0 42px; width: 42px; height: 42px; padding: 0; justify-content: center;
    border: 0; background: transparent; color: var(--pwb-text);
  }
  .search-trigger .el-icon { font-size: 21px; }
  .search-placeholder, .search-trigger kbd { display: none; }
  .topbar-actions { gap: 4px; }
  .desktop-undo, .desktop-new-task, .desktop-quick-note, .desktop-bell, .desktop-logout { display: none !important; }
  .desktop-only-action { display: none !important; }
  .content { min-height: 0; }
}

.mobile-page-title, .mobile-create, .mobile-more-layer { display: none; }

@media (max-width: 640px) {
  .mobile-page-title { display: block; flex: 1; font-size: 21px; letter-spacing: -.3px; }
  .mobile-create { display: inline-flex; width: 40px; height: 40px; }
  .mobile-more-layer {
    display: flex; position: fixed; inset: 0; z-index: 3000; align-items: flex-end;
    background: rgba(15, 23, 42, .38); backdrop-filter: blur(2px);
  }
  .mobile-more-sheet {
    width: 100%; max-height: 78vh; overflow-y: auto; padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
    border-radius: 24px 24px 0 0; background: var(--pwb-bg-card); box-shadow: 0 -12px 36px rgba(15,23,42,.16);
  }
  .mobile-sheet-handle { width: 40px; height: 4px; border-radius: 2px; background: var(--pwb-border); margin: 0 auto 8px; }
  .mobile-sheet-header { display: flex; align-items: center; justify-content: space-between; min-height: 48px; font-size: 18px; }
  .mobile-more-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px 8px; padding: 12px 0 22px; }
  .mobile-more-grid button { display: flex; flex-direction: column; align-items: center; gap: 7px; min-height: 70px; padding: 0; border: 0; background: transparent; color: var(--pwb-text); font: inherit; font-size: 12px; touch-action: manipulation; }
  .more-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; background: color-mix(in srgb, var(--pwb-primary) 10%, var(--pwb-bg-card)); color: var(--pwb-primary); }
  .mobile-sheet-actions { border-top: 1px solid var(--pwb-border); display: flex; flex-direction: column; padding-top: 8px; }
  .mobile-account { padding: 10px 8px 14px; border-bottom: 1px solid var(--pwb-border); margin-bottom: 4px; }
  .mobile-sheet-actions button { min-height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 8px; border: 0; background: transparent; color: var(--pwb-text); font: inherit; }
  .mobile-sheet-actions button.danger { color: var(--pwb-p0); }
  .mobile-sheet-enter-active, .mobile-sheet-leave-active { transition: opacity .2s ease; }
  .mobile-sheet-enter-from, .mobile-sheet-leave-to { opacity: 0; }
}
</style>
