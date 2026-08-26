<!--
  笔记页中栏（PRD 3.3）：全文检索 + 筛选 + 笔记列表
  - 顶部全文检索框：匹配标题与正文，命中片段用 <mark class="highlight-mark"> 高亮
  - 工具栏：新建笔记、批量导出全部笔记为 zip（downloadNotesZip）
  - 创建时间范围筛选：按 created_at 日期区间过滤
  - 列表项：标题/正文摘要/更新时间/字数；hover 显示「导出 Markdown / 删除」操作按钮
  - 列表点击选中、双链 [[标题]] 渲染为可点击样式（跳转由父组件统一处理）
  数据操作（新建/删除/导出）统一由父组件 NoteView 处理，本组件仅负责展示与事件通知
-->
<template>
  <section class="list-panel pwb-card">
    <!-- 全文检索 -->
    <el-input
      :model-value="keyword" placeholder="搜索标题与正文…" clearable class="search-input"
      @update:model-value="emit('update:keyword', $event)"
    >
      <template #prefix><el-icon><Search /></el-icon></template>
    </el-input>

    <!-- 工具栏：新建 / 导出全部 -->
    <div class="list-toolbar">
      <el-button type="primary" size="small" @click="emit('create')">
        <el-icon><Plus /></el-icon>新建笔记
      </el-button>
      <el-button size="small" title="批量导出全部笔记为 zip" @click="emit('export-all')">
        <el-icon><Download /></el-icon>导出全部
      </el-button>
    </div>

    <!-- 创建时间范围筛选 -->
    <div class="filter-bar">
      <el-date-picker
        :model-value="createRange" type="daterange" size="small" clearable
        start-placeholder="创建起始" end-placeholder="创建截止"
        value-format="YYYY-MM-DD" style="width: 100%"
        @update:model-value="emit('update:range', $event || [])"
      />
    </div>

    <!-- 笔记列表 -->
    <div v-if="notes.length" class="note-list">
      <div
        v-for="n in notes" :key="n.note_id"
        class="note-item" :class="{ active: n.note_id === selectedId }"
        @click="emit('select', n)"
      >
        <div class="note-title" v-html="highlightHtml(n.title || '未命名')"></div>
        <div class="note-summary" v-html="summaryHtml(n.content)"></div>
        <div class="note-meta">
          <span>{{ fmtDateTime(n.updated_at) }}</span>
          <span>{{ n.word_count }} 字</span>
          <span v-if="n.folder" class="meta-folder">{{ n.folder }}</span>
        </div>
        <div class="note-actions" @click.stop>
          <el-button text size="small" title="导出为 Markdown" @click="emit('export-one', n)">
            <el-icon><Download /></el-icon>
          </el-button>
          <el-button text size="small" type="danger" title="删除笔记" @click="emit('remove', n)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-list">
      <el-empty :image-size="96" :description="emptyText">
        <el-button v-if="!total" type="primary" size="small" @click="emit('create')">新建第一篇笔记</el-button>
        <el-button v-else size="small" @click="resetFilters">清除筛选</el-button>
      </el-empty>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { fmtDateTime } from '@/utils/datetime'

const props = defineProps({
  notes: { type: Array, default: () => [] },        // 父组件筛选后的笔记列表（recentNotes 倒序）
  total: { type: Number, default: 0 },              // 全部笔记数（noteStore.notes.length）
  keyword: { type: String, default: '' },           // 全文检索关键词
  hasFilter: { type: Boolean, default: false },     // 是否处于筛选状态（文件夹/标签/时间范围）
  createRange: { type: Array, default: () => [] },  // 创建时间范围 ['YYYY-MM-DD','YYYY-MM-DD']
  selectedId: { type: String, default: null }       // 当前选中的笔记 id（高亮）
})
const emit = defineEmits([
  'update:keyword', 'update:range',
  'select', 'create', 'export-all', 'export-one', 'remove'
])

/** 空状态文案：区分「无任何笔记」与「筛选无匹配」 */
const emptyText = computed(() => {
  if (!props.total) return '暂无笔记'
  if (props.keyword || props.hasFilter || props.createRange.length === 2) return '没有匹配的笔记'
  return '暂无笔记'
})

/** 清除筛选：复位关键词与创建时间范围 */
function resetFilters() {
  emit('update:keyword', '')
  emit('update:range', [])
}

/* ---------------- 高亮渲染（v-html，需严格转义防 XSS） ---------------- */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 普通文本片段：转义 + 关键词高亮（<mark class="highlight-mark">） */
function highlightSegment(text) {
  let html = escapeHtml(text)
  const kw = props.keyword.trim()
  if (kw) {
    const reg = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    html = html.replace(reg, m => `<mark class="highlight-mark">${m}</mark>`)
  }
  return html
}

/** 标题/摘要渲染：[[标题]] 输出为可点击链接样式，其余片段做关键词高亮 */
function renderRich(text) {
  const parts = String(text ?? '').split(/(\[\[[^\]]+\]\])/g)
  return parts.map(p => {
    const m = p.match(/^\[\[([^\]]+)\]\]$/)
    if (m) {
      const t = escapeHtml(m[1].trim())
      return `<span class="note-link" data-link-title="${t}">[[${t}]]</span>`
    }
    return highlightSegment(p)
  }).join('')
}

function highlightHtml(text) { return renderRich(text) }

/** 列表摘要：取正文前 80 字 */
function summaryHtml(content) {
  const plain = (content || '').replace(/\s+/g, ' ').trim()
  return renderRich(plain.slice(0, 80) || '（无内容）')
}
</script>

<style scoped>
.list-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.search-input { margin-bottom: 8px; }
.list-toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
.filter-bar { margin-bottom: 8px; }
.note-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}
.note-item {
  position: relative;
  padding: 8px 12px;
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.note-item:hover { background: var(--pwb-bg-hover); }
.note-item.active { border-color: var(--pwb-primary); background: var(--pwb-bg-hover); }
.note-title { font-weight: 600; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-summary {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  line-height: 1.5;
  max-height: 36px;
  overflow: hidden;
  margin-bottom: 4px;
  word-break: break-all;
}
.note-meta { display: flex; gap: 12px; font-size: 12px; color: var(--pwb-text-secondary); }
.meta-folder { margin-left: auto; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 列表项 hover 操作按钮（右上角） */
.note-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: none;
  gap: 2px;
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: 6px;
  padding: 0 2px;
  box-shadow: var(--pwb-shadow);
}
.note-item:hover .note-actions { display: inline-flex; }
.empty-list { flex: 1; display: flex; align-items: center; justify-content: center; }

/* 双链样式（v-html 注入，需 :deep） */
.note-summary :deep(.note-link),
.note-title :deep(.note-link) {
  color: var(--pwb-primary);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
