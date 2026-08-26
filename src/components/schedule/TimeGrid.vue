<!--
  日/周视图时间轴网格（0-24 时）
  - 日程块按时间绝对定位，重叠日程左右分栏
  - 拖拽块体移动改时间（周视图可跨天），拖底部手柄拉伸改时长（15 分钟吸附）
  - 重复日程实例的变更由父组件走 editInstance 生成例外
  - 纯展示 + 交互组件，数据变更通过 change 事件上抛
-->
<template>
  <div class="time-grid">
    <!-- 列头：日期 -->
    <div class="tg-header">
      <div class="gutter-head"></div>
      <div
        v-for="(d, i) in days"
        :key="i"
        class="col-head"
        :class="{ today: isToday(d) }"
      >
        <span class="dow">周{{ '一二三四五六日'[d.isoWeekday() - 1] }}</span>
        <span class="dnum">{{ d.format('M/D') }}</span>
      </div>
    </div>

    <div class="tg-body">
      <!-- 左侧时间刻度 -->
      <div class="hour-gutter" :style="{ height: GRID_HEIGHT + 'px' }">
        <div v-for="h in 24" :key="h" class="hour-cell">
          <span>{{ String(h - 1).padStart(2, '0') }}:00</span>
        </div>
      </div>

      <!-- 日列 -->
      <div class="cols" ref="colsRef" :style="{ height: GRID_HEIGHT + 'px' }">
        <div
          v-for="(d, di) in days"
          :key="dateKey(d)"
          class="day-col"
          :class="{ today: isToday(d) }"
        >
          <div v-for="h in 24" :key="h" class="hour-line"></div>
          <!-- 当前时间指示线 -->
          <div v-if="isToday(d)" class="now-line" :style="{ top: nowTop + 'px' }"></div>

          <div
            v-for="b in previewColumns[di]"
            :key="b._uid"
            class="block"
            :class="{ expired: b._expired, 'is-dragging': drag && drag.uid === b._uid }"
            :style="blockStyle(b)"
            :title="`${timeText(b)} ${b.item.title}`"
            @mousedown.prevent="onBlockDown($event, b, di, 'move')"
            @click.stop
          >
            <div class="block-inner">
              <div class="block-time">{{ timeText(b) }}</div>
              <div class="block-title">{{ b.item.title }}</div>
              <div v-if="b.item.location" class="block-loc">{{ b.item.location }}</div>
            </div>
            <div
              class="resize-handle"
              @mousedown.prevent.stop="onBlockDown($event, b, di, 'resize')"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { dayjs, dateKey, isToday, isPast } from '@/utils/datetime'
import { categoryColor, colorWithAlpha } from './categoryColor'

const props = defineProps({
  /** 要展示的日期列（日视图 1 天，周视图 7 天，dayjs 数组） */
  days: { type: Array, required: true },
  /** 已展开的日程实例（覆盖 days 区间） */
  instances: { type: Array, default: () => [] }
})

const emit = defineEmits(['open', 'change'])

const HOUR_HEIGHT = 48                 // 每小时高度（8px 栅格倍数）
const SNAP = 15                        // 拖拽吸附分钟数
const GRID_HEIGHT = 24 * HOUR_HEIGHT

const colsRef = ref(null)
const now = ref(dayjs())
let nowTimer = null

onMounted(() => {
  nowTimer = setInterval(() => { now.value = dayjs() }, 60 * 1000)
})
onBeforeUnmount(() => {
  clearInterval(nowTimer)
  unbindDrag()
})

/** 当前时间指示线位置 */
const nowTop = computed(() => (now.value.hour() * 60 + now.value.minute()) / 60 * HOUR_HEIGHT)

/**
 * 每日列的日程块布局：
 * 1. 裁剪到当日 0-24 点；2. 按开始时间排序；3. 重叠聚簇后列分配（左右分栏）
 */
const columns = computed(() => {
  return props.days.map((d) => {
    const dayStart = d.startOf('day')
    const dayEnd = d.endOf('day')
    const evs = props.instances
      .filter(s => dayjs(s.start_time).isBefore(dayEnd) && dayjs(s.end_time).isAfter(dayStart))
      .map((s) => {
        const st = dayjs(s.start_time).isBefore(dayStart) ? dayStart : dayjs(s.start_time)
        const en = dayjs(s.end_time).isAfter(dayEnd) ? dayEnd : dayjs(s.end_time)
        let startMin = st.hour() * 60 + st.minute()
        let endMin = en.isSame(dayEnd) ? 1440 : en.hour() * 60 + en.minute()
        if (endMin <= startMin) endMin = Math.min(startMin + SNAP, 1440)
        return {
          item: s,
          _uid: `${s.schedule_id}|${s._instance_date || ''}`,
          _color: categoryColor(s.category),
          _expired: isPast(s.end_time),
          startMin,
          endMin,
          col: 0,
          cols: 1
        }
      })
      .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

    // 重叠聚簇：同簇内分配列号
    let cluster = []
    let clusterEnd = -1
    const flush = () => {
      const colLastEnd = []
      for (const ev of cluster) {
        let placed = false
        for (let c = 0; c < colLastEnd.length; c++) {
          if (colLastEnd[c] <= ev.startMin) {
            ev.col = c
            colLastEnd[c] = ev.endMin
            placed = true
            break
          }
        }
        if (!placed) {
          ev.col = colLastEnd.length
          colLastEnd.push(ev.endMin)
        }
      }
      for (const ev of cluster) ev.cols = colLastEnd.length
      cluster = []
    }
    for (const ev of evs) {
      if (cluster.length && ev.startMin >= clusterEnd) flush()
      cluster.push(ev)
      clusterEnd = Math.max(clusterEnd, ev.endMin)
    }
    if (cluster.length) flush()
    return evs
  })
})

/* ---------------- 拖拽（移动 / 拉伸） ---------------- */

/** 拖拽状态：uid 标识块，mode=move|resize，dMin 分钟偏移，dDay 列偏移 */
const drag = ref(null)

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function onBlockDown(e, block, dayIndex, mode) {
  drag.value = {
    uid: block._uid,
    mode,
    dayIndex,
    origBlock: block,
    startClientX: e.clientX,
    startClientY: e.clientY,
    dMin: 0,
    dDay: 0,
    moved: false
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragUp)
}

function onDragMove(e) {
  const d = drag.value
  if (!d) return
  const dy = e.clientY - d.startClientY
  const dx = e.clientX - d.startClientX
  if (Math.abs(dy) > 3 || Math.abs(dx) > 3) d.moved = true
  d.dMin = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP) * SNAP
  // 周视图支持横向拖到其他日期列
  if (d.mode === 'move' && props.days.length > 1 && colsRef.value) {
    const rect = colsRef.value.getBoundingClientRect()
    const colWidth = rect.width / props.days.length
    const targetCol = clamp(Math.floor((e.clientX - rect.left) / colWidth), 0, props.days.length - 1)
    d.dDay = targetCol - d.dayIndex
  }
}

function onDragUp() {
  const d = drag.value
  if (!d) return
  unbindDrag()
  const block = d.origBlock
  if (!d.moved) {
    // 未移动视为点击 → 打开详情
    drag.value = null
    emit('open', block.item)
    return
  }
  const targetDayIdx = clamp(d.dayIndex + d.dDay, 0, props.days.length - 1)
  const dayStart = props.days[targetDayIdx].startOf('day')
  let newStartMin = block.startMin
  let newEndMin = block.endMin
  if (d.mode === 'move') {
    const dur = block.endMin - block.startMin
    newStartMin = clamp(block.startMin + d.dMin, 0, 1440 - dur)
    newEndMin = newStartMin + dur
  } else {
    newEndMin = clamp(block.endMin + d.dMin, block.startMin + SNAP, 1440)
  }
  drag.value = null
  if (newStartMin === block.startMin && newEndMin === block.endMin && d.dDay === 0) return
  emit('change', {
    item: block.item,
    startISO: dayStart.add(newStartMin, 'minute').toISOString(),
    endISO: dayStart.add(newEndMin, 'minute').toISOString()
  })
}

function unbindDrag() {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragUp)
}

/** 应用拖拽预览：被拖块按偏移临时重定位 */
const previewColumns = computed(() => {
  const d = drag.value
  const cols = columns.value.map(list =>
    d && d.moved ? list.filter(b => b._uid !== d.uid) : list.slice()
  )
  if (d && d.moved) {
    const src = d.origBlock
    const nb = { ...src }
    if (d.mode === 'move') {
      const dur = src.endMin - src.startMin
      nb.startMin = clamp(src.startMin + d.dMin, 0, 1440 - dur)
      nb.endMin = nb.startMin + dur
    } else {
      nb.endMin = clamp(src.endMin + d.dMin, src.startMin + SNAP, 1440)
    }
    const target = clamp(d.dayIndex + d.dDay, 0, props.days.length - 1)
    cols[target] = [...cols[target], nb]
  }
  return cols
})

/* ---------------- 渲染辅助 ---------------- */

function blockStyle(b) {
  const top = (b.startMin / 60) * HOUR_HEIGHT
  const height = Math.max(((b.endMin - b.startMin) / 60) * HOUR_HEIGHT, 16)
  const widthPct = 100 / b.cols
  return {
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(${b.col * widthPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
    background: colorWithAlpha(b._color, 0.22),
    borderLeft: `3px solid ${b._color}`
  }
}

function timeText(b) {
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${fmt(b.startMin)}-${fmt(b.endMin)}`
}
</script>

<style scoped>
.time-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.tg-header {
  display: flex;
  border-bottom: 1px solid var(--pwb-border);
  flex-shrink: 0;
}
.gutter-head { width: 56px; flex-shrink: 0; }
.col-head {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--pwb-text-secondary);
  border-left: 1px solid var(--pwb-border);
}
.col-head.today { color: var(--pwb-primary); font-weight: 600; }
.tg-body {
  flex: 1;
  display: flex;
  overflow-y: auto;
}
.hour-gutter {
  width: 56px;
  flex-shrink: 0;
  position: relative;
}
.hour-cell {
  height: 48px;
  position: relative;
}
.hour-cell span {
  position: absolute;
  top: -7px;
  right: 8px;
  font-size: 11px;
  color: var(--pwb-text-secondary);
}
.cols {
  flex: 1;
  display: flex;
  position: relative;
}
.day-col {
  flex: 1;
  position: relative;
  border-left: 1px solid var(--pwb-border);
}
.day-col.today { background: color-mix(in srgb, var(--pwb-primary) 4%, transparent); }
.hour-line {
  height: 48px;
  border-bottom: 1px solid var(--pwb-border);
  opacity: 0.6;
}
.now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #f56c6c;
  z-index: 3;
  pointer-events: none;
}
.block {
  position: absolute;
  border-radius: 4px;
  cursor: grab;
  overflow: hidden;
  z-index: 2;
  user-select: none;
}
.block:hover { z-index: 4; box-shadow: var(--pwb-shadow); }
.block.is-dragging { opacity: 0.85; z-index: 5; box-shadow: var(--pwb-shadow); }
.block.expired { filter: grayscale(0.9); opacity: 0.55; }
.block-inner {
  padding: 2px 6px;
  overflow: hidden;
  height: 100%;
}
.block-time {
  font-size: 11px;
  color: var(--pwb-text-secondary);
  line-height: 1.3;
}
.block-title {
  font-size: 12px;
  color: var(--pwb-text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.block-loc {
  font-size: 11px;
  color: var(--pwb-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8px;
  cursor: ns-resize;
}
</style>
