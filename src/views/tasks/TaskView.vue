<template>
  <div class="task-view">
    <div v-if="mobileFiltersOpen" class="filter-mask" @click="mobileFiltersOpen = false" />
    <!-- ============ 左侧筛选栏 ============ -->
    <aside class="filter-panel pwb-card" :class="{ 'mobile-open': mobileFiltersOpen }">
      <div class="mobile-filter-header">
        <strong>筛选任务</strong>
        <el-button text circle @click="mobileFiltersOpen = false"><el-icon><Close /></el-icon></el-button>
      </div>
      <div class="filter-block">
        <div class="filter-label">关键词</div>
        <el-input v-model="filters.keyword" placeholder="搜索标题或描述" clearable size="small">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>

      <div class="filter-block">
        <div class="filter-label">状态</div>
        <div class="chip-list">
          <span
            v-for="opt in statusOptions" :key="opt.value"
            class="chip" :class="{ active: filters.status === opt.value }"
            @click="filters.status = opt.value"
          >{{ opt.label }}</span>
        </div>
      </div>

      <div class="filter-block">
        <div class="filter-label">四象限</div>
        <div class="chip-list">
          <span class="chip" :class="{ active: filters.quadrant === 'all' }" @click="filters.quadrant = 'all'">全部</span>
          <span
            v-for="q in QUADRANTS" :key="q.key"
            class="chip" :class="{ active: filters.quadrant === q.key }"
            @click="filters.quadrant = q.key"
          >{{ q.label }}</span>
        </div>
      </div>

      <div class="filter-block">
        <div class="filter-label">分类</div>
        <el-select v-model="filters.category" size="small" style="width: 100%">
          <el-option label="全部分类" value="all" />
          <el-option v-for="c in metaStore.taskCategories" :key="c" :label="c" :value="c" />
        </el-select>
      </div>

      <div class="filter-block">
        <div class="filter-label">标签</div>
        <el-select v-model="filters.tag" size="small" style="width: 100%" filterable>
          <el-option label="全部标签" value="all" />
          <el-option v-for="t in metaStore.allTags" :key="t" :label="`#${t}`" :value="t" />
        </el-select>
      </div>

      <div class="filter-block">
        <div class="filter-label">时间范围（按截止时间）</div>
        <div class="chip-list">
          <span
            v-for="opt in rangeOptions" :key="opt.value"
            class="chip" :class="{ active: filters.range === opt.value }"
            @click="filters.range = opt.value"
          >{{ opt.label }}</span>
        </div>
        <el-date-picker
          v-if="filters.range === 'custom'"
          v-model="filters.customRange"
          type="daterange" size="small" style="width: 100%; margin-top: 8px"
          start-placeholder="开始日期" end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        />
      </div>

      <div class="filter-block">
        <div class="filter-label">智能清单</div>
        <div class="view-list">
          <div v-for="v in taskStore.views" :key="v.view_id" class="view-item" @click="loadView(v)">
            <span class="view-name">{{ v.name }}</span>
            <el-icon class="view-del" @click.stop="deleteView(v.view_id)"><Close /></el-icon>
          </div>
          <el-button text size="small" @click="saveView"><el-icon><Plus /></el-icon>保存当前筛选</el-button>
        </div>
      </div>

      <el-button text size="small" class="reset-btn" @click="resetFilters">
        <el-icon><RefreshLeft /></el-icon>重置筛选
      </el-button>
    </aside>

    <!-- ============ 右侧主区域 ============ -->
    <section class="task-main">
      <!-- 顶部快速输入 -->
      <div class="quick-add pwb-card">
        <el-input
          v-model="quickInput"
          size="large"
          placeholder="一句话新增任务，如：明天18点前 重要紧急 交周报 #工作（回车创建）"
          @keyup.enter="quickAdd"
        >
          <template #prefix><el-icon><MagicStick /></el-icon></template>
          <template #append><el-button @click="quickAdd">添加</el-button></template>
        </el-input>
        <div v-if="parsed.title" class="parse-preview">
          <span class="preview-title">{{ parsed.title }}</span>
          <el-tag v-if="parsed.deadline" size="small" type="warning">截止 {{ fmtDateTime(parsed.deadline) }}</el-tag>
          <QuadrantTag v-if="parsed.important || parsed.urgent" :important="parsed.important" :urgent="parsed.urgent" />
          <el-tag v-if="parsed.repeat_type !== 'none'" size="small" effect="plain">重复</el-tag>
          <el-tag v-for="t in parsed.tags" :key="t" size="small" effect="plain">#{{ t }}</el-tag>
          <span class="preview-hint">回车创建</span>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar pwb-card">
        <div class="toolbar-left">
          <el-button class="mobile-filter-button" size="small" @click="mobileFiltersOpen = true">
            <el-icon><Filter /></el-icon>筛选
          </el-button>
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="list">清单</el-radio-button>
            <el-radio-button value="group">分组</el-radio-button>
            <el-radio-button value="kanban">看板</el-radio-button>
            <el-radio-button value="gantt">甘特</el-radio-button>
            <el-radio-button value="matrix">四象限</el-radio-button>
            <el-radio-button value="today">今日</el-radio-button>
          </el-radio-group>
          <el-select v-if="viewMode === 'group'" v-model="groupBy" size="small" style="width: 120px">
            <el-option label="按分类" value="category" />
            <el-option label="按象限" value="quadrant" />
            <el-option label="按状态" value="status" />
          </el-select>
        </div>
        <div class="toolbar-right">
          <el-radio-group v-if="viewMode === 'list'" v-model="sortMode" size="small">
            <el-radio-button value="default">默认排序</el-radio-button>
            <el-radio-button value="manual">手动排序</el-radio-button>
          </el-radio-group>
          <el-button size="small" :type="multiMode ? 'primary' : 'default'" @click="toggleMultiMode">
            <el-icon><Finished /></el-icon>{{ multiMode ? '退出多选' : '多选' }}
          </el-button>
        </div>
      </div>

      <!-- 批量操作栏 -->
      <transition name="fade">
        <div v-if="multiMode" class="batch-bar pwb-card">
          <el-checkbox
            :model-value="selectedIds.length > 0 && selectedIds.length === displayTasks.length"
            :indeterminate="selectedIds.length > 0 && selectedIds.length < displayTasks.length"
            @change="toggleSelectAll"
          >已选 {{ selectedIds.length }} 项</el-checkbox>
          <template v-if="selectedIds.length">
            <el-button size="small" type="success" @click="batchDone">标记完成</el-button>
            <el-select size="small" placeholder="改分类" style="width: 110px" @change="batchSetCategory">
              <el-option v-for="c in metaStore.taskCategories" :key="c" :label="c" :value="c" />
            </el-select>
            <el-select size="small" placeholder="改象限" style="width: 120px" @change="batchSetQuadrant">
              <el-option v-for="q in QUADRANTS" :key="q.key" :label="q.label" :value="q.key" />
            </el-select>
            <el-button size="small" @click="batchAddTag">加标签</el-button>
            <el-button size="small" type="danger" @click="batchRemove">删除</el-button>
          </template>
        </div>
      </transition>

      <!-- 任务列表 -->
      <div class="list-area" @scroll="closeContextMenu">
        <div v-if="taskStore.tasks.length === 0" class="empty-state">
          <div class="empty-emoji">🗒️</div>
          <p>还没有任务，在上方输入一句话开始吧</p>
        </div>

        <!-- 列表视图 -->
        <template v-else-if="viewMode === 'list'">
          <div v-if="displayTasks.length === 0" class="empty-state">
            <div class="empty-emoji">🔍</div>
            <p>没有符合条件的任务</p>
          </div>
          <template v-else>
            <div
              v-for="(task, idx) in displayTasks" :key="taskKey(task, idx)"
              class="task-item pwb-card"
              :class="{ done: task.status === 'done', 'drop-before': dragOverIndex === idx, dragging: dragIndex === idx }"
              :draggable="dragEnabled"
              @dragstart="onDragStart(idx, $event)"
              @dragover.prevent="onDragOver(idx)"
              @dragleave="onDragLeave(idx)"
              @drop.prevent="onDrop(idx)"
              @dragend="onDragEnd"
              @contextmenu.prevent="openContextMenu($event, task)"
            >
              <el-icon v-if="dragEnabled" class="drag-handle" title="拖拽排序"><Rank /></el-icon>
              <el-checkbox
                v-if="multiMode"
                :model-value="selectedIds.includes(task.task_id)"
                @change="toggleSelect(task.task_id)"
                @click.stop
              />
              <button class="check-btn" :class="{ checked: task.status === 'done' }" title="标记完成/取消完成" @click.stop="toggleDone(task)">
                <el-icon v-if="task.status === 'done'"><Check /></el-icon>
              </button>
              <div class="task-content" @click="openTaskDetail(task)">
                <div class="line1">
                  <el-icon v-if="task.pinned" class="pin-icon" title="已置顶"><Top /></el-icon>
                  <QuadrantTag :task="task" />
                  <span class="task-title" :class="{ strike: task.status === 'done' }">{{ task.title }}</span>
                  <el-tag v-if="task.repeat_type !== 'none' && !task._instance_date" size="small" type="warning" effect="plain">重复</el-tag>
                  <el-tag v-if="task._instance_date" size="small" effect="plain">{{ task._instance_date.slice(5) }}</el-tag>
                  <span v-if="task.subtasks.length" class="sub-progress">{{ subDoneCount(task) }}/{{ task.subtasks.length }}</span>
                  <el-tag v-if="task.status === 'delayed'" size="small" type="danger" effect="plain">已延期</el-tag>
                  <el-tag v-else-if="task.status === 'doing'" size="small" type="primary" effect="plain">进行中</el-tag>
                  <el-tag v-else-if="task.status === 'canceled'" size="small" type="info" effect="plain">已取消</el-tag>
                </div>
                <div class="line2">
                  <span v-if="task.deadline" class="meta-chip" :class="{ overdue: isOverdue(task) }">
                    <el-icon><AlarmClock /></el-icon>{{ fmtDateTime(task.deadline) }}
                  </span>
                  <span v-if="task.start_time" class="meta-chip"><el-icon><Timer /></el-icon>{{ fmtDate(task.start_time) }} 起</span>
                  <span class="meta-chip"><el-icon><Folder /></el-icon>{{ task.category }}</span>
                  <span v-for="t in task.tags" :key="t" class="meta-chip tag-chip">#{{ t }}</span>
                </div>
              </div>
              <button class="mobile-task-actions" type="button" aria-label="任务操作" @click.stop="openMobileMenu(task)">
                <el-icon><MoreFilled /></el-icon>
              </button>
            </div>
            <div
              v-if="dragEnabled && dragIndex !== null"
              class="drop-tail" :class="{ 'drop-before': dragOverIndex === displayTasks.length }"
              @dragover.prevent="onDragOver(displayTasks.length)"
              @drop.prevent="onDrop(displayTasks.length)"
            >放到末尾</div>
          </template>
        </template>

        <!-- 分组视图 -->
        <template v-else-if="viewMode === 'group'">
          <div v-if="displayTasks.length === 0" class="empty-state">
            <div class="empty-emoji">🔍</div>
            <p>没有符合条件的任务</p>
          </div>
          <template v-else>
            <div v-for="group in groupedTasks" :key="group.key" class="group-block">
              <div class="group-header">
                <span v-if="groupBy === 'quadrant'" class="group-dot" :style="{ background: group.color }"></span>
                <span class="group-name">{{ group.label }}</span>
                <span class="group-count">{{ group.list.length }}</span>
              </div>
              <div
                v-for="task in group.list" :key="taskKey(task, group.list.indexOf(task))"
                class="task-item pwb-card"
                :class="{ done: task.status === 'done' }"
                @contextmenu.prevent="openContextMenu($event, task)"
              >
                <el-checkbox
                  v-if="multiMode"
                  :model-value="selectedIds.includes(task.task_id)"
                  @change="toggleSelect(task.task_id)"
                  @click.stop
                />
                <button class="check-btn" :class="{ checked: task.status === 'done' }" @click.stop="toggleDone(task)">
                  <el-icon v-if="task.status === 'done'"><Check /></el-icon>
                </button>
                <div class="task-content" @click="openTaskDetail(task)">
                  <div class="line1">
                    <el-icon v-if="task.pinned" class="pin-icon"><Top /></el-icon>
                    <QuadrantTag :task="task" />
                    <span class="task-title" :class="{ strike: task.status === 'done' }">{{ task.title }}</span>
                    <span v-if="task.subtasks.length" class="sub-progress">{{ subDoneCount(task) }}/{{ task.subtasks.length }}</span>
                  </div>
                  <div class="line2">
                    <span v-if="task.deadline" class="meta-chip" :class="{ overdue: isOverdue(task) }">
                      <el-icon><AlarmClock /></el-icon>{{ fmtDateTime(task.deadline) }}
                    </span>
                    <span class="meta-chip"><el-icon><Folder /></el-icon>{{ task.category }}</span>
                    <span v-for="t in task.tags" :key="t" class="meta-chip tag-chip">#{{ t }}</span>
                  </div>
                </div>
                <button class="mobile-task-actions" type="button" aria-label="任务操作" @click.stop="openMobileMenu(task)">
                  <el-icon><MoreFilled /></el-icon>
                </button>
              </div>
            </div>
          </template>
        </template>

        <!-- 看板视图 -->
        <KanbanBoard v-else-if="viewMode === 'kanban'" :tasks="filteredTasks" @toggle="toggleDone" />

        <!-- 甘特图视图 -->
        <GanttChart v-else-if="viewMode === 'gantt'" :tasks="filteredTasks" />

        <!-- 四象限矩阵 -->
        <QuadrantMatrix v-else-if="viewMode === 'matrix'" :tasks="filteredTasks" @toggle="toggleDone" />

        <!-- 今日清单 -->
        <template v-else-if="viewMode === 'today'">
          <div class="today-summary pwb-card">
            <span class="ts-title">今日任务</span>
            <span class="ts-stats">{{ todayDoneCount }} 已完成 / {{ todayList.length }} 共</span>
            <el-button text size="small" @click="filters.range = 'today'; viewMode = 'list'">查看全部今日</el-button>
          </div>
          <div v-if="todayList.length === 0" class="empty-state">
            <div class="empty-emoji">✅</div>
            <p>今天没有待办任务，休息一下吧</p>
          </div>
          <div
            v-for="task in todayList" :key="taskKey(task, todayList.indexOf(task))"
            class="task-item pwb-card"
            :class="{ done: task.status === 'done' }"
            @contextmenu.prevent="openContextMenu($event, task)"
          >
            <button class="check-btn" :class="{ checked: task.status === 'done' }" @click.stop="toggleDone(task)">
              <el-icon v-if="task.status === 'done'"><Check /></el-icon>
            </button>
            <div class="task-content" @click="openTaskDetail(task)">
              <div class="line1">
                <QuadrantTag :task="task" />
                <span class="task-title" :class="{ strike: task.status === 'done' }">{{ task.title }}</span>
                <el-tag v-if="task.status === 'delayed'" size="small" type="danger" effect="plain">已延期</el-tag>
              </div>
              <div class="line2">
                <span v-if="task.deadline" class="meta-chip" :class="{ overdue: isOverdue(task) }">
                  <el-icon><AlarmClock /></el-icon>{{ fmtDateTime(task.deadline) }}
                </span>
                <span class="meta-chip"><el-icon><Folder /></el-icon>{{ task.category }}</span>
              </div>
            </div>
            <button class="mobile-task-actions" type="button" aria-label="任务操作" @click.stop="openMobileMenu(task)">
              <el-icon><MoreFilled /></el-icon>
            </button>
          </div>
        </template>
      </div>
    </section>

    <!-- ============ 自实现右键菜单 ============ -->
    <teleport to="body">
      <div v-if="ctxMenu.visible" class="ctx-mask" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }" @click.stop>
          <div class="ctx-item" @click="ctxOpenDetail"><el-icon><View /></el-icon>查看详情</div>
          <div class="ctx-item" @click="ctxTogglePin"><el-icon><Top /></el-icon>{{ ctxMenu.task?.pinned ? '取消置顶' : '置顶' }}</div>
          <div class="ctx-divider" />
          <div class="ctx-group-title">四象限</div>
          <div
            v-for="q in QUADRANTS" :key="q.key"
            class="ctx-item" @click="ctxSetQuadrant(q)"
          ><span class="q-dot" :style="{ background: q.color }"></span>{{ q.label }}</div>
          <div class="ctx-group-title">状态</div>
          <div
            v-for="opt in ctxStatusOptions" :key="opt.value"
            class="ctx-item" @click="ctxSetStatus(opt.value)"
          >{{ opt.label }}</div>
          <div class="ctx-group-title">分类</div>
          <div class="ctx-cat-list">
            <div
              v-for="c in metaStore.taskCategories" :key="c"
              class="ctx-item" @click="ctxSetCategory(c)"
            >{{ c }}</div>
          </div>
          <div class="ctx-divider" />
          <div class="ctx-item danger" @click="ctxDelete"><el-icon><Delete /></el-icon>删除任务</div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useTaskStore, defaultTaskSort, QUADRANTS, getQuadrant, expandTasks } from '@/stores/task'
import { useMetaStore } from '@/stores/meta'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { parseTaskInput } from '@/utils/nlp'
import { dayjs, fmtDateTime, fmtDate, todayRange, weekRange, monthRange, isPast, nowISO } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'
import KanbanBoard from '@/components/tasks/KanbanBoard.vue'
import GanttChart from '@/components/tasks/GanttChart.vue'
import QuadrantMatrix from '@/components/tasks/QuadrantMatrix.vue'

const taskStore = useTaskStore()
const metaStore = useMetaStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()
const mobileFiltersOpen = ref(false)

/* ---------------- 筛选 ---------------- */
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '待开始', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
  { label: '已取消', value: 'canceled' },
  { label: '已延期', value: 'delayed' }
]
const rangeOptions = [
  { label: '全部', value: 'all' },
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '自定义', value: 'custom' }
]
const filters = reactive({
  keyword: '', status: 'all', quadrant: 'all', category: 'all',
  tag: 'all', range: 'all', customRange: null
})
function resetFilters() {
  Object.assign(filters, { keyword: '', status: 'all', quadrant: 'all', category: 'all', tag: 'all', range: 'all', customRange: null })
}

/** 非时间筛选（作用于主任务） */
const baseFiltered = computed(() => {
  let list = taskStore.tasks
  if (filters.status !== 'all') list = list.filter(t => t.status === filters.status)
  if (filters.quadrant !== 'all') {
    const q = QUADRANTS.find(x => x.key === filters.quadrant)
    list = list.filter(t => t.important === q.important && t.urgent === q.urgent)
  }
  if (filters.category !== 'all') list = list.filter(t => t.category === filters.category)
  if (filters.tag !== 'all') list = list.filter(t => t.tags.includes(filters.tag))
  const kw = filters.keyword.trim().toLowerCase()
  if (kw) {
    list = list.filter(t =>
      t.title.toLowerCase().includes(kw) || (t.description || '').toLowerCase().includes(kw)
    )
  }
  return list
})

/** 展开重复任务（未来 90 天实例） */
const expandedTasks = computed(() => {
  const start = dayjs().subtract(7, 'day').startOf('day')
  const end = dayjs().add(90, 'day').endOf('day')
  return expandTasks(baseFiltered.value, start, end)
})

/** 时间范围筛选作用于展开后的实例 */
const filteredTasks = computed(() => {
  let list = expandedTasks.value
  if (filters.range !== 'all') {
    let range = null
    if (filters.range === 'today') range = todayRange()
    else if (filters.range === 'week') range = weekRange()
    else if (filters.range === 'month') range = monthRange()
    else if (filters.range === 'custom' && filters.customRange?.length === 2) {
      range = [
        dayjs(filters.customRange[0]).startOf('day').toISOString(),
        dayjs(filters.customRange[1]).endOf('day').toISOString()
      ]
    }
    if (range) list = list.filter(t => t.deadline && t.deadline >= range[0] && t.deadline <= range[1])
  }
  return list
})

/* ---------------- 排序与视图 ---------------- */
const viewMode = ref('list') // list | group | kanban | gantt | matrix | today
const groupBy = ref('category') // category | quadrant | status
const sortMode = ref('default') // default | manual

const displayTasks = computed(() => {
  const list = [...filteredTasks.value]
  if (sortMode.value === 'manual' && viewMode.value === 'list') {
    return list.sort((a, b) => a.sort_order - b.sort_order)
  }
  return list.sort(defaultTaskSort)
})

const statusLabelMap = { todo: '待开始', doing: '进行中', done: '已完成', canceled: '已取消', delayed: '已延期' }

const groupedTasks = computed(() => {
  const map = new Map()
  for (const t of filteredTasks.value) {
    let key
    if (groupBy.value === 'category') key = t.category
    else if (groupBy.value === 'quadrant') key = getQuadrant(t).key
    else key = t.status
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(t)
  }
  for (const list of map.values()) list.sort(defaultTaskSort)
  let entries = [...map.entries()]
  if (groupBy.value === 'quadrant') {
    const order = ['iu', 'in', 'nu', 'nn']
    entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  } else if (groupBy.value === 'status') {
    const order = ['todo', 'doing', 'delayed', 'done', 'canceled']
    entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  } else {
    entries.sort((a, b) => a[0].localeCompare(b[0], 'zh'))
  }
  return entries.map(([key, list]) => {
    let label = key
    let color = null
    if (groupBy.value === 'quadrant') {
      const q = QUADRANTS.find(x => x.key === key)
      label = q ? q.label : key
      color = q ? q.color : null
    } else if (groupBy.value === 'status') {
      label = statusLabelMap[key] || key
    }
    return { key, label, color, list }
  })
})

/* ---------------- 今日清单 ---------------- */
const todayList = computed(() => {
  const today = dayjs().format('YYYY-MM-DD')
  const now = nowISO()
  return filteredTasks.value.filter(t => {
    if (t.status === 'done' || t.status === 'canceled') {
      return t.completed_at && dayjs(t.completed_at).format('YYYY-MM-DD') === today
    }
    const d = t.deadline ? dayjs(t.deadline).format('YYYY-MM-DD') : null
    const st = t.start_time ? dayjs(t.start_time).format('YYYY-MM-DD') : null
    const overdue = t.deadline && t.deadline < now
    return d === today || st === today || overdue
  })
})
const todayDoneCount = computed(() => todayList.value.filter(t => t.status === 'done').length)

/* ---------------- 快速新增 ---------------- */
const quickInput = ref('')
const parsed = computed(() => parseTaskInput(quickInput.value))

async function quickAdd() {
  const p = parsed.value
  if (!p.title) {
    ElMessage.warning('请输入任务标题')
    return
  }
  const task = await taskStore.addTask({
    title: p.title,
    deadline: p.deadline,
    important: p.important,
    urgent: p.urgent,
    repeat_type: p.repeat_type,
    tags: p.tags,
    description: p.description
  })
  for (const t of p.tags) await metaStore.addTag(t)
  quickInput.value = ''
  ElMessage.success('任务已创建')
  undoStore.push({
    label: `新建任务「${task.title}」`,
    undo: async () => taskStore.deleteTask(task.task_id),
    redo: async () => taskStore.restoreTask(task)
  })
}

/* ---------------- 任务操作 ---------------- */
function subDoneCount(task) {
  return task.subtasks.filter(s => s.status === 'done').length
}
function isOverdue(task) {
  return task.deadline && isPast(task.deadline) && task.status !== 'done' && task.status !== 'canceled'
}
function taskKey(task, idx) {
  return task._instance_date ? `${task.task_id}_${task._instance_date}` : (task.task_id || idx)
}
function openTaskDetail(task) {
  uiStore.openDetail('task', task._master_id || task.task_id)
}

async function toggleDone(task) {
  // 重复任务实例：标记该次完成
  if (task._master_id && task._instance_date) {
    const master = taskStore.byId(task._master_id)
    if (!master) return
    const before = JSON.parse(JSON.stringify(master))
    await taskStore.markInstance(task._master_id, task._instance_date, 'complete')
    const after = JSON.parse(JSON.stringify(taskStore.byId(task._master_id)))
    ElMessage.success('已完成本次')
    undoStore.push({
      label: `完成重复任务「${task.title}」本次`,
      undo: async () => taskStore.restoreTask(before),
      redo: async () => taskStore.restoreTask(after)
    })
    return
  }
  const target = task.status === 'done' ? 'todo' : 'done'
  const before = JSON.parse(JSON.stringify(task))
  await taskStore.setStatus(task.task_id, target)
  const after = JSON.parse(JSON.stringify(taskStore.byId(task.task_id)))
  undoStore.push({
    label: target === 'done' ? `完成任务「${task.title}」` : `恢复任务「${task.title}」`,
    undo: async () => taskStore.restoreTask(before),
    redo: async () => taskStore.restoreTask(after)
  })
}

async function togglePin(task) {
  const target = task._master_id || task.task_id
  const res = await taskStore.togglePin(target)
  if (res) ElMessage.success(res.pinned ? '已置顶' : '已取消置顶')
}

/* ---------------- 手动拖拽排序 ---------------- */
const dragIndex = ref(null)
const dragOverIndex = ref(null)
const dragEnabled = computed(() => viewMode.value === 'list' && sortMode.value === 'manual' && !multiMode.value)

function onDragStart(idx, e) {
  dragIndex.value = idx
  e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(idx) { dragOverIndex.value = idx }
function onDragLeave(idx) { if (dragOverIndex.value === idx) dragOverIndex.value = null }
function onDragEnd() { dragIndex.value = null; dragOverIndex.value = null }

async function onDrop(targetIdx) {
  const from = dragIndex.value
  onDragEnd()
  if (from === null || from === targetIdx || from === targetIdx - 1) return
  const list = [...displayTasks.value]
  const [moved] = list.splice(from, 1)
  const insertAt = from < targetIdx ? targetIdx - 1 : targetIdx
  list.splice(insertAt, 0, moved)
  const beforeOrders = list.map(t => ({ id: t.task_id, sort_order: t.sort_order }))
  const afterOrders = list.map((t, i) => ({ id: t.task_id, sort_order: i }))
  const applyOrders = async (orders) => {
    for (const o of orders) {
      const t = taskStore.byId(o.id)
      if (t && t.sort_order !== o.sort_order) await taskStore.updateTask(o.id, { sort_order: o.sort_order })
    }
  }
  await applyOrders(afterOrders)
  ElMessage.success('排序已保存')
  undoStore.push({
    label: '调整任务排序',
    undo: async () => applyOrders(beforeOrders),
    redo: async () => applyOrders(afterOrders)
  })
}

/* ---------------- 多选与批量操作 ---------------- */
const multiMode = ref(false)
const selectedIds = ref([])

function toggleMultiMode() {
  multiMode.value = !multiMode.value
  if (!multiMode.value) selectedIds.value = []
}
function toggleSelect(id) {
  if (selectedIds.value.includes(id)) selectedIds.value = selectedIds.value.filter(x => x !== id)
  else selectedIds.value = [...selectedIds.value, id]
}
function toggleSelectAll(val) {
  selectedIds.value = val ? displayTasks.value.map(t => t.task_id) : []
}

async function runBatch(patch, label) {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  const snapshots = await taskStore.batchUpdate(ids, patch)
  ElMessage.success(`${label}成功`)
  undoStore.push({
    label: `${label}（${ids.length} 项）`,
    undo: async () => { for (const s of snapshots) await taskStore.restoreTask(s) },
    redo: async () => { await taskStore.batchUpdate(ids, patch) }
  })
  selectedIds.value = []
}

async function batchDone() { await runBatch({ status: 'done' }, '批量标记完成') }
async function batchSetCategory(category) {
  if (!category) return
  await runBatch({ category }, '批量修改分类')
}
async function batchSetQuadrant(qKey) {
  const q = QUADRANTS.find(x => x.key === qKey)
  if (!q) return
  await runBatch({ important: q.important, urgent: q.urgent }, '批量修改象限')
}
async function batchAddTag() {
  try {
    const { value } = await ElMessageBox.prompt('输入要添加的标签名', '批量加标签', {
      confirmButtonText: '添加', cancelButtonText: '取消', inputPattern: /\S+/, inputErrorMessage: '标签名不能为空'
    })
    const tag = value.trim().replace(/^#/, '')
    await metaStore.addTag(tag)
    await runBatch({ addTags: [tag] }, '批量加标签')
  } catch { /* 用户取消 */ }
}
async function batchRemove() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 个任务吗？删除后可通过撤销恢复。`, '批量删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'
    })
  } catch { return }
  const snapshots = await taskStore.batchDelete(ids)
  ElMessage.success('已删除')
  undoStore.push({
    label: `批量删除任务（${ids.length} 项）`,
    undo: async () => { for (const s of snapshots) await taskStore.restoreTask(s) },
    redo: async () => { await taskStore.batchDelete(ids) }
  })
  selectedIds.value = []
}

/* ---------------- 右键菜单 ---------------- */
const ctxMenu = reactive({ visible: false, x: 0, y: 0, task: null })
const ctxStatusOptions = [
  { label: '待开始', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
  { label: '已取消', value: 'canceled' }
]

function openContextMenu(e, task) {
  ctxMenu.task = task
  ctxMenu.visible = true
  const menuW = 200
  const menuH = 460
  ctxMenu.x = Math.min(e.clientX, window.innerWidth - menuW - 8)
  ctxMenu.y = Math.min(e.clientY, window.innerHeight - menuH - 8)
}
function openMobileMenu(task) {
  ctxMenu.task = task
  ctxMenu.x = 0
  ctxMenu.y = 0
  ctxMenu.visible = true
}
function closeContextMenu() {
  ctxMenu.visible = false
  ctxMenu.task = null
}

async function ctxUpdate(patch, label) {
  const task = ctxMenu.task
  const targetId = task?._master_id || task?.task_id
  closeContextMenu()
  if (!targetId) return
  const before = JSON.parse(JSON.stringify(taskStore.byId(targetId)))
  if (patch.status) {
    await taskStore.setStatus(targetId, patch.status)
  } else {
    await taskStore.updateTask(targetId, patch)
  }
  const after = JSON.parse(JSON.stringify(taskStore.byId(targetId)))
  ElMessage.success(label)
  undoStore.push({
    label: `${label}「${task.title}」`,
    undo: async () => taskStore.restoreTask(before),
    redo: async () => taskStore.restoreTask(after)
  })
}
function ctxOpenDetail() {
  const task = ctxMenu.task
  closeContextMenu()
  if (task) openTaskDetail(task)
}
function ctxTogglePin() {
  const task = ctxMenu.task
  closeContextMenu()
  if (task) togglePin(task)
}
function ctxSetQuadrant(q) { ctxUpdate({ important: q.important, urgent: q.urgent }, `象限已改为「${q.label}」`) }
function ctxSetStatus(s) { ctxUpdate({ status: s }, `状态已改为「${statusLabelMap[s]}」`) }
function ctxSetCategory(c) { ctxUpdate({ category: c }, `分类已改为「${c}」`) }
async function ctxDelete() {
  const task = ctxMenu.task
  const targetId = task?._master_id || task?.task_id
  closeContextMenu()
  if (!targetId) return
  try {
    await ElMessageBox.confirm(`确定删除任务「${task.title}」吗？删除后可通过撤销恢复。`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消'
    })
  } catch { return }
  const snapshot = JSON.parse(JSON.stringify(taskStore.byId(targetId)))
  await taskStore.deleteTask(targetId)
  ElMessage.success('任务已删除')
  undoStore.push({
    label: `删除任务「${task.title}」`,
    undo: async () => taskStore.restoreTask(snapshot),
    redo: async () => taskStore.deleteTask(targetId)
  })
}

/* ---------------- 智能清单 ---------------- */
async function saveView() {
  try {
    const { value } = await ElMessageBox.prompt('给这个智能清单起个名字', '保存当前筛选', {
      confirmButtonText: '保存', cancelButtonText: '取消', inputPattern: /\S+/, inputErrorMessage: '名称不能为空'
    })
    const snapshot = JSON.parse(JSON.stringify(filters))
    await taskStore.addView({ name: value.trim(), filters: snapshot })
    ElMessage.success('智能清单已保存')
  } catch { /* 用户取消 */ }
}
function loadView(v) {
  Object.assign(filters, JSON.parse(JSON.stringify(v.filters)))
  ElMessage.success(`已加载「${v.name}」`)
}
async function deleteView(id) {
  await taskStore.deleteView(id)
  ElMessage.success('已删除清单')
}
</script>

<style scoped>
.task-view {
  height: 100%;
  display: flex;
  gap: 16px;
  padding: 16px 24px;
  overflow: hidden;
}

/* ---- 左侧筛选栏 ---- */
.filter-panel {
  width: 232px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.mobile-filter-header, .mobile-filter-button { display: none; }
.filter-label {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  margin-bottom: 8px;
}
.chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid var(--pwb-border);
  color: var(--pwb-text-secondary);
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}
.chip:hover { border-color: var(--pwb-primary); color: var(--pwb-primary); }
.chip.active {
  background: var(--pwb-primary);
  border-color: var(--pwb-primary);
  color: #fff;
}
.reset-btn { align-self: flex-start; color: var(--pwb-text-secondary); }

.view-list { display: flex; flex-direction: column; gap: 4px; }
.view-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.view-item:hover { background: var(--pwb-bg-hover); }
.view-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.view-del { color: var(--pwb-text-secondary); }
.view-del:hover { color: var(--pwb-p0); }

/* ---- 右侧主区域 ---- */
.task-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.quick-add { padding: 16px; }
.parse-preview {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--pwb-bg);
  border-radius: var(--pwb-radius);
}
.preview-title { font-weight: 600; margin-right: 4px; }
.preview-hint { font-size: 12px; color: var(--pwb-text-secondary); margin-left: auto; }

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 8px; }

.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  flex-wrap: wrap;
}

/* ---- 任务列表 ---- */
.list-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 16px;
}
.task-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.task-item:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1); }
.task-item.done { opacity: 0.72; }
.task-item.dragging { opacity: 0.4; }
.task-item.drop-before { box-shadow: 0 -2px 0 var(--pwb-primary); }
.drag-handle { color: var(--pwb-text-secondary); cursor: grab; margin-top: 2px; }
.check-btn {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: 50%;
  border: 2px solid var(--pwb-text-secondary);
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}
.check-btn:hover { border-color: var(--pwb-primary); }
.check-btn.checked { background: var(--pwb-primary); border-color: var(--pwb-primary); }
.mobile-task-actions { display: none; }
.task-content { flex: 1; min-width: 0; }
.line1 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.task-title { font-weight: 500; word-break: break-all; }
.task-title.strike { text-decoration: line-through; color: var(--pwb-text-secondary); }
.pin-icon { color: var(--pwb-warning); }
.sub-progress {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  background: var(--pwb-bg-hover);
  border-radius: 8px;
  padding: 0 8px;
}
.line2 {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--pwb-text-secondary);
}
.meta-chip.overdue { color: var(--pwb-p0); font-weight: 600; }
.tag-chip { color: var(--pwb-primary); }
.drop-tail {
  text-align: center;
  font-size: 12px;
  color: var(--pwb-text-secondary);
  border: 1px dashed var(--pwb-border);
  border-radius: var(--pwb-radius);
  padding: 16px;
}
.drop-tail.drop-before { border-color: var(--pwb-primary); color: var(--pwb-primary); }

/* ---- 分组视图 ---- */
.group-block { display: flex; flex-direction: column; gap: 8px; }
.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 0;
  font-weight: 600;
}
.group-dot { width: 10px; height: 10px; border-radius: 50%; }
.group-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--pwb-text-secondary);
  background: var(--pwb-bg-hover);
  border-radius: 8px;
  padding: 0 8px;
}

/* ---- 今日清单 ---- */
.today-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.ts-title { font-weight: 600; }
.ts-stats { color: var(--pwb-text-secondary); font-size: 13px; }

/* ---- 空状态 ---- */
.empty-state {
  text-align: center;
  color: var(--pwb-text-secondary);
  padding: 64px 0;
}
.empty-emoji { font-size: 48px; margin-bottom: 16px; }

@media (max-width: 640px) {
  .task-view { padding: 10px; gap: 10px; }
  .task-main { width: 100%; }
  .filter-panel {
    position: fixed; left: 0; top: 0; bottom: 0; z-index: 1201;
    width: min(86vw, 320px); border-radius: 0; transform: translateX(-105%);
    transition: transform .2s ease; padding: 16px;
  }
  .filter-panel.mobile-open { transform: translateX(0); }
  .filter-mask { position: fixed; inset: 0; z-index: 1200; background: rgba(0, 0, 0, .42); }
  .mobile-filter-header { display: flex; align-items: center; justify-content: space-between; }
  .mobile-filter-button { display: inline-flex; }
  .toolbar { align-items: flex-start; overflow-x: auto; flex-wrap: nowrap; padding: 8px; }
  .toolbar-left, .toolbar-right { flex-shrink: 0; }
  .quick-add { padding: 8px; }
  .task-item { padding: 12px 10px; }
  .drag-handle { display: none; }
  .mobile-task-actions {
    display: inline-flex; align-items: center; justify-content: center; flex: 0 0 42px;
    width: 42px; height: 42px; margin: -11px -10px -8px 0; padding: 0;
    border: 0; background: transparent; color: var(--pwb-text-secondary); font-size: 18px;
  }
}
</style>

<!-- 右键菜单需脱离 scoped（teleport 到 body） -->
<style>
.ctx-mask { position: fixed; inset: 0; z-index: 3000; }
.ctx-menu {
  position: fixed;
  width: 200px;
  max-height: 460px;
  overflow-y: auto;
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
  box-shadow: var(--pwb-shadow);
  padding: 8px;
  z-index: 3001;
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--pwb-text);
  cursor: pointer;
}
.ctx-item:hover { background: var(--pwb-bg-hover); }
.ctx-item.danger { color: var(--pwb-p0); }
.ctx-divider { height: 1px; background: var(--pwb-border); margin: 8px 0; }
.ctx-group-title {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  padding: 4px 8px;
}
.q-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.ctx-cat-list { max-height: 120px; overflow-y: auto; }
</style>
