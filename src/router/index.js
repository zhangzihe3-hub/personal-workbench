import { createRouter, createWebHashHistory } from 'vue-router'
import { getCurrentUser } from '@/services/api'

// Hash 路由：Nginx、Capacitor WebView 与刷新场景均无需额外路由重写
const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('@/views/dashboard/DashboardView.vue'), meta: { title: '工作台' } },
  { path: '/tasks', name: 'tasks', component: () => import('@/views/tasks/TaskView.vue'), meta: { title: '任务' } },
  { path: '/schedule', name: 'schedule', component: () => import('@/views/schedule/ScheduleView.vue'), meta: { title: '日程' } },
  { path: '/notes', name: 'notes', component: () => import('@/views/notes/NoteView.vue'), meta: { title: '笔记' } },
  { path: '/stats', name: 'stats', component: () => import('@/views/stats/StatsView.vue'), meta: { title: '统计' } },
  { path: '/toolbox', name: 'toolbox', component: () => import('@/views/toolbox/ToolboxView.vue'), meta: { title: '工具箱' } },
  { path: '/goals', name: 'goals', component: () => import('@/views/goals/GoalView.vue'), meta: { title: '目标' } },
  { path: '/settings', name: 'settings', component: () => import('@/views/settings/SettingsView.vue'), meta: { title: '设置' } },
  { path: '/users', name: 'users', component: () => import('@/views/admin/UserManagementView.vue'), meta: { title: '用户管理', requiresAdmin: true } }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(to => {
  if (to.meta.requiresAdmin && getCurrentUser()?.role !== 'admin') return '/settings'
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 个人工作台` : '个人工作台'
})
