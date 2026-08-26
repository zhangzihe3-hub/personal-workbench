<!--
  月视图日历网格（周一开头，固定 6 行 x 7 列）
  - 每格展示日程色条（按分类哈希取色，过期置灰）
  - 点击色条打开详情；点击空白快速创建；色条可拖拽到其他日期改期
  - 纯展示 + 交互组件，数据变更通过事件上抛给 ScheduleView 处理
-->
<template>
  <div class="month-grid">
    <!-- 星期表头（周一开头） -->
    <div class="week-header">
      <div v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w" class="week-name">周{{ w }}</div>
    </div>

    <div class="grid-body">
      <div
        v-for="cell in cells"
        :key="cell.key"
        class="day-cell"
        :class="{
          'out-month': !cell.inMonth,
          'is-today': cell.key === todayKey,
          'drag-over': dragOverKey === cell.key
        }"
        @click="onCellClick(cell)"
        @dragover.prevent="dragOverKey = cell.key"
        @dragleave="onDragLeave(cell.key)"
        @drop.prevent="onDrop(cell)"
      >
        <div class="date-row">
          <span class="date-num" :class="{ 'today-badge': cell.key === todayKey }">{{ cell.day }}</span>
        </div>

        <div class="chips">
          <div
            v-for="item in cell.items.slice(0, MAX_VISIBLE)"
            :key="item._uid"
            class="chip"
            :class="{ expired: item._expired, dragging: dragged && dragged._uid === item._uid }"
            :style="{ background: item._color }"
            :title="`${item._timeText} ${item.title}`"
            draggable="true"
            @dragstart="onDragStart(item)"
            @dragend="onDragEnd"
            @click.stop="emit('open', item)"
          >
            <span class="chip-time">{{ item._timeText }}</span>
            <span class="chip-title">{{ item.title }}</span>
          </div>

          <!-- 超出显示的日程收进 Popover -->
          <el-popover
            v-if="cell.items.length > MAX_VISIBLE"
            placement="right"
            trigger="click"
            width="240"
            popper-class="mobile-schedule-popover"
          >
            <template #reference>
              <div class="more-link" @click.stop>+{{ cell.items.length - MAX_VISIBLE }} 更多</div>
            </template>
            <div class="more-list">
              <div
                v-for="item in cell.items"
                :key="item._uid"
                class="more-item"
                :class="{ expired: item._expired }"
                @click="emit('open', item)"
              >
                <span class="dot" :style="{ background: item._color }"></span>
                <span class="more-time">{{ item._timeText }}</span>
                <span class="more-title">{{ item.title }}</span>
              </div>
            </div>
          </el-popover>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { dayjs, dateKey, fmtTime, isPast } from '@/utils/datetime'
import { categoryColor } from './categoryColor'

const props = defineProps({
  /** 当前月份基准（dayjs） */
  cursor: { type: Object, required: true },
  /** 已展开的日程实例（覆盖整个网格区间） */
  instances: { type: Array, default: () => [] }
})

const emit = defineEmits(['open', 'move', 'create'])

const MAX_VISIBLE = 3 // 每格最多直接显示的色条数
const todayKey = dateKey(dayjs())

const dragged = ref(null)      // 正在拖拽的日程实例
const dragOverKey = ref('')    // 当前悬停的目标日期

/** 生成 42 个格子（当月 1 日所在周的周一开始） */
const cells = computed(() => {
  const gridStart = props.cursor.startOf('month').startOf('isoWeek')
  // 实例按日期分桶（跨天日程只落在开始日，保持简洁）
  const byDate = {}
  for (const s of props.instances) {
    const key = dateKey(s.start_time)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push({
      ...s,
      _uid: `${s.schedule_id}|${s._instance_date || ''}`,
      _color: categoryColor(s.category),
      _timeText: fmtTime(s.start_time),
      _expired: isPast(s.end_time)
    })
  }
  const list = []
  for (let i = 0; i < 42; i++) {
    const d = gridStart.add(i, 'day')
    const key = dateKey(d)
    list.push({
      key,
      day: d.date(),
      inMonth: d.month() === props.cursor.month(),
      items: byDate[key] || []
    })
  }
  return list
})

/** 点击格子空白区域 → 快速创建（预填当日 9:00-10:00） */
function onCellClick(cell) {
  emit('create', cell.key)
}

function onDragStart(item) {
  dragged.value = item
}

function onDragEnd() {
  dragged.value = null
  dragOverKey.value = ''
}

function onDragLeave(key) {
  if (dragOverKey.value === key) dragOverKey.value = ''
}

/** 拖放到目标日期 → 上抛改期事件（重复实例由父组件走 editInstance） */
function onDrop(cell) {
  if (dragged.value) {
    emit('move', { item: dragged.value, dateKey: cell.key })
  }
  onDragEnd()
}
</script>

<style scoped>
.month-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 480px;
}
.week-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--pwb-border);
  flex-shrink: 0;
}
.week-name {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--pwb-text-secondary);
}
.grid-body {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
}
.day-cell {
  border-right: 1px solid var(--pwb-border);
  border-bottom: 1px solid var(--pwb-border);
  padding: 4px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 80px;
}
.day-cell:nth-child(7n) { border-right: none; }
.day-cell:hover { background: var(--pwb-bg-hover); }
.day-cell.out-month { opacity: 0.45; }
.day-cell.drag-over {
  background: var(--pwb-bg-hover);
  outline: 2px dashed var(--pwb-primary);
  outline-offset: -2px;
}
.date-row {
  display: flex;
  justify-content: flex-start;
  padding: 0 2px 2px;
}
.date-num {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 50%;
}
.today-badge {
  background: var(--pwb-primary);
  color: #fff;
  font-weight: 600;
}
.chips {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.chip {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
  color: #fff;
  cursor: grab;
  white-space: nowrap;
  overflow: hidden;
}
.chip.dragging { opacity: 0.5; }
.chip.expired { filter: grayscale(0.9); opacity: 0.55; }
.chip-time { flex-shrink: 0; opacity: 0.85; }
.chip-title { overflow: hidden; text-overflow: ellipsis; }
.more-link {
  font-size: 12px;
  color: var(--pwb-primary);
  padding: 0 6px;
  cursor: pointer;
}
.more-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 320px;
  overflow: auto;
}
.more-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.more-item:hover { background: var(--pwb-bg-hover); }
.more-item.expired { opacity: 0.55; }
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.more-time { color: var(--pwb-text-secondary); flex-shrink: 0; }
.more-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
