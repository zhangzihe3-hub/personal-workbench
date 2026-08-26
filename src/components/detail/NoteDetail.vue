<!--
  笔记详情面板（PRD 3.3，挂载于 DetailPanel，props: noteId）
  - 展示与编辑：标题/文件夹/标签（编辑接入全局撤销栈）
  - 元信息：创建时间、更新时间、字数
  - 正文只读渲染：Vditor.preview 静态渲染 Markdown；[[标题]] 预处理为锚点链接，
    点击代理按标题跳转对应任务/日程详情；深色模式切换时自动重渲染
  - 关联任务/日程列表：点击 openDetail 跳转对应详情
  - 删除：二次确认 + 快照撤销恢复（undo=restoreNote）
-->
<template>
  <div v-if="note" class="note-detail">
    <el-form label-position="top" size="default" @submit.prevent>
      <el-form-item label="标题">
        <el-input v-model="form.title" maxlength="200" placeholder="笔记标题" @change="commitField('title', form.title)" />
      </el-form-item>

      <el-form-item label="文件夹">
        <el-select v-model="form.folder" style="width: 100%" @change="commitField('folder', form.folder)">
          <el-option v-for="f in noteStore.folders" :key="f.name" :label="f.name" :value="f.name" />
        </el-select>
      </el-form-item>

      <el-form-item label="标签">
        <el-select
          v-model="form.tags" multiple filterable allow-create default-first-option
          placeholder="选择或输入标签后回车" style="width: 100%"
          @change="onTagsChange"
        >
          <el-option v-for="t in metaStore.allTags" :key="t" :label="`#${t}`" :value="t" />
        </el-select>
      </el-form-item>
    </el-form>

    <!-- 元信息：创建/更新时间、字数 -->
    <div class="meta-grid">
      <div class="meta-item">
        <span class="meta-label">创建时间</span>
        <span>{{ fmtDateTime(note.created_at) }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">更新时间</span>
        <span>{{ fmtDateTime(note.updated_at) }}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">字数</span>
        <span>{{ note.word_count }} 字</span>
      </div>
    </div>

    <!-- 正文静态渲染（只读） -->
    <div class="block-label">正文</div>
    <div
      v-if="note.content" ref="previewRef" class="preview-body vditor-reset"
      @click="onPreviewClick"
    ></div>
    <div v-else class="empty-hint">（暂无正文，去笔记页编辑）</div>

    <!-- 关联任务 -->
    <div class="block-label">关联任务（{{ relatedTasks.length }}）</div>
    <div v-if="relatedTasks.length" class="rel-list">
      <div
        v-for="t in relatedTasks" :key="t.task_id" class="rel-item"
        @click="uiStore.openDetail('task', t.task_id)"
      >
        <QuadrantTag :task="t" />
        <span class="rel-title">{{ t.title }}</span>
        <el-icon class="rel-arrow"><ArrowRight /></el-icon>
      </div>
    </div>
    <div v-else class="empty-hint">正文中使用 [[任务标题]] 可自动关联</div>

    <!-- 关联日程 -->
    <div class="block-label">关联日程（{{ relatedSchedules.length }}）</div>
    <div v-if="relatedSchedules.length" class="rel-list">
      <div
        v-for="s in relatedSchedules" :key="s.schedule_id" class="rel-item"
        @click="uiStore.openDetail('schedule', s.schedule_id)"
      >
        <el-icon><Calendar /></el-icon>
        <span class="rel-title">{{ s.title }}</span>
        <span class="rel-time">{{ fmtDateTime(s.start_time) }}</span>
        <el-icon class="rel-arrow"><ArrowRight /></el-icon>
      </div>
    </div>
    <div v-else class="empty-hint">正文中使用 [[日程标题]] 可自动关联</div>

    <!-- 删除 -->
    <el-button type="danger" plain class="delete-btn" @click="removeNote">
      <el-icon><Delete /></el-icon>删除笔记
    </el-button>
  </div>
  <el-empty v-else description="笔记不存在或已删除" :image-size="80" />
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import { useNoteStore } from '@/stores/note'
import { useMetaStore } from '@/stores/meta'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore } from '@/stores/schedule'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { fmtDateTime } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const props = defineProps({ noteId: String })

const noteStore = useNoteStore()
const metaStore = useMetaStore()
const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()

const note = computed(() => noteStore.byId(props.noteId))

const form = reactive({ title: '', folder: '', tags: [] })

/** 同步 store 数据到表单 */
function syncForm() {
  if (!note.value) return
  form.title = note.value.title
  form.folder = note.value.folder
  form.tags = [...(note.value.tags || [])]
}

/** 字段提交：入库 + 撤销 */
async function commitField(field, value) {
  if (!note.value) return
  const oldValue = field === 'tags' ? [...(note.value.tags || [])] : note.value[field]
  const newValue = field === 'tags' ? [...value] : value
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) return
  const patch = { [field]: newValue }
  await noteStore.updateNote(props.noteId, patch)
  undoStore.push({
    label: '修改笔记',
    undo: async () => { await noteStore.updateNote(props.noteId, { [field]: oldValue }) },
    redo: async () => { await noteStore.updateNote(props.noteId, patch) }
  })
  ElMessage.success('已保存')
}

/** 标签变更：新建的标签同时登记到全局标签库 */
async function onTagsChange(tags) {
  for (const t of tags) {
    if (!metaStore.allTags.includes(t)) await metaStore.addTag(t)
  }
  await commitField('tags', tags)
}

/* ---------------- 正文静态渲染（Vditor.preview，只读） ---------------- */
const previewRef = ref(null)
let renderTimer = null
let themeObserver = null

/** 把 [[标题]] 转为特殊锚点链接，渲染后通过点击代理拦截跳转 */
function preprocessLinks(md) {
  return (md || '').replace(/\[\[([^\]]+)\]\]/g, (m, title) => {
    return `[${title}](#pwb-link-${encodeURIComponent(title.trim())})`
  })
}

/** 渲染正文预览（跟随当前深色模式） */
async function renderPreview() {
  if (!previewRef.value || !note.value?.content) return
  const dark = document.documentElement.classList.contains('dark')
  try {
    await Vditor.preview(previewRef.value, preprocessLinks(note.value.content), {
      mode: dark ? 'dark' : 'light',
      anchor: 0,
      hljs: { style: dark ? 'monokai' : 'github', lineNumber: false }
    })
  } catch (e) {
    // 渲染失败兜底：纯文本展示
    previewRef.value.textContent = note.value.content
  }
}

/** 防抖重渲染（内容变化或深色模式切换） */
function scheduleRender() {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(renderPreview, 300)
}

/** 监听 html.dark 切换，深色模式变化时重渲染正文 */
function watchTheme() {
  themeObserver = new MutationObserver(() => scheduleRender())
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

/** 点击代理：拦截 #pwb-link- 开头的双链，按标题打开任务/日程详情 */
function onPreviewClick(e) {
  const a = e.target.closest?.('a')
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (href.startsWith('#pwb-link-')) {
    e.preventDefault()
    const title = decodeURIComponent(href.slice('#pwb-link-'.length))
    const task = taskStore.tasks.find(t => t.title === title)
    if (task) { uiStore.openDetail('task', task.task_id); return }
    const sch = scheduleStore.schedules.find(s => s.repeat_type !== 'exception' && s.title === title)
    if (sch) { uiStore.openDetail('schedule', sch.schedule_id); return }
    ElMessage.info(`未找到标题为「${title}」的任务或日程`)
  } else {
    // 普通外链阻止默认锚点跳转异常
    if (href.startsWith('#')) e.preventDefault()
  }
}

/* ---------------- 关联列表 ---------------- */
const relatedTasks = computed(() =>
  (note.value?.related_task_ids || []).map(id => taskStore.byId(id)).filter(Boolean)
)
const relatedSchedules = computed(() =>
  (note.value?.related_schedule_ids || []).map(id => scheduleStore.byId(id)).filter(Boolean)
)

/* ---------------- 删除 ---------------- */
async function removeNote() {
  if (!note.value) return
  try {
    await ElMessageBox.confirm(`确定删除笔记「${note.value.title || '未命名'}」吗？删除后可通过撤销恢复。`, '删除笔记', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
    })
  } catch { return }
  const snapshot = JSON.parse(JSON.stringify(note.value))
  await noteStore.deleteNote(snapshot.note_id)
  uiStore.closeDetail()
  undoStore.push({
    label: '删除笔记',
    undo: async () => { await noteStore.restoreNote(snapshot) },
    redo: async () => { await noteStore.deleteNote(snapshot.note_id) }
  })
  ElMessage.success('已删除，可通过 Ctrl+Z 撤销')
}

/* ---------------- 生命周期与监听 ---------------- */
watch(() => props.noteId, () => { syncForm(); scheduleRender() })
watch(() => note.value?.content, () => scheduleRender())
watch(() => note.value?.updated_at, () => syncForm())

onMounted(() => { syncForm(); renderPreview(); watchTheme() })
onBeforeUnmount(() => {
  clearTimeout(renderTimer)
  try { themeObserver && themeObserver.disconnect() } catch (e) { /* 忽略 */ }
})
</script>

<style scoped>
.note-detail { display: flex; flex-direction: column; gap: 8px; }

/* 元信息网格 */
.meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 8px;
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
  background: var(--pwb-bg);
  font-size: 12px;
  color: var(--pwb-text);
}
.meta-item { display: flex; flex-direction: column; gap: 2px; }
.meta-label { font-size: 11px; color: var(--pwb-text-secondary); }

.block-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--pwb-text-secondary);
  margin-top: 8px;
  margin-bottom: 4px;
}
.preview-body {
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
  padding: 12px;
  max-height: 320px;
  overflow-y: auto;
  font-size: 13px;
  background: var(--pwb-bg);
}
.preview-body :deep(a[href^="#pwb-link-"]) {
  color: var(--pwb-primary);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.empty-hint { font-size: 12px; color: var(--pwb-text-secondary); }
.rel-list { display: flex; flex-direction: column; gap: 4px; }
.rel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--pwb-text);
}
.rel-item:hover { background: var(--pwb-bg-hover); }
.rel-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rel-time { font-size: 12px; color: var(--pwb-text-secondary); }
.rel-arrow { color: var(--pwb-text-secondary); }
.delete-btn { margin-top: 16px; width: 100%; }
</style>
