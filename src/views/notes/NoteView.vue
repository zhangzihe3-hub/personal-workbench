<!--
  知识笔记页（PRD 3.3）— 三栏布局
  - 左栏 NoteFolderPanel：文件夹管理（新建/重命名/删除，删除时笔记移入「临时笔记」）+ 标签筛选
  - 中栏 NoteListPanel：全文检索（标题+正文，<mark class="highlight-mark"> 高亮）、创建时间范围筛选、
    笔记列表（更新时间倒序，显示标题/摘要/时间/字数）、新建、批量导出 zip、列表项导出单篇/删除
  - 右栏 Vditor 编辑区（NoteEditor）：mode 'ir'、counter 字数、图片 base64 本地存储、
    30 秒定时自动保存 + 失焦保存、深色主题跟随 html.dark 联动；
    保存时解析 [[标题]] 双链同步 related_task_ids / related_schedule_ids
  - 双链点击：编辑器内点击 [[标题]] → 按标题匹配任务/日程 → uiStore.openDetail 跳转详情
  - 所有增删改均接入全局撤销栈 undoStore（新增/删除/重命名/编辑）
-->
<template>
  <div class="note-view" :class="{ 'has-selection': currentNote }">
    <!-- ============ 左栏：文件夹 + 标签 ============ -->
    <NoteFolderPanel v-model:folder="activeFolder" v-model:tag="activeTag" />

    <!-- ============ 中栏：检索 + 筛选 + 列表 ============ -->
    <NoteListPanel
      v-model:keyword="keyword"
      v-model:range="createRange"
      :notes="filteredNotes"
      :total="noteStore.notes.length"
      :has-filter="hasFilter"
      :selected-id="selectedNoteId"
      @select="selectNote"
      @create="createNote"
      @export-all="exportAll"
      @export-one="exportNote"
      @remove="removeNote"
    />

    <!-- ============ 右栏：编辑区 ============ -->
    <section class="editor-panel pwb-card">
      <template v-if="currentNote">
        <div class="editor-header">
          <el-button class="mobile-back" text circle aria-label="返回笔记列表" @click="selectedNoteId = null">
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          <el-input
            v-model="editTitle" class="title-input" maxlength="200"
            placeholder="笔记标题（留空自动取正文前15字）"
            @focus="titleBaseline = currentNote.title"
            @change="commitTitle"
          />
          <div class="editor-actions">
            <el-button text circle title="导出为 Markdown" @click="exportNote(currentNote)">
              <el-icon><Download /></el-icon>
            </el-button>
            <el-button text circle title="删除笔记" @click="removeNote(currentNote)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
        <div class="editor-body">
          <NoteEditor
            ref="editorRef"
            v-model="editContent"
            @input="onEditorInput"
            @blur="flushSave"
            @link-click="openLinkByTitle"
          />
        </div>
        <div class="editor-footer">
          <span>{{ currentWords }} 字</span>
          <span class="save-status" :class="{ dirty }">
            {{ dirty ? (saving ? '保存中…' : '未保存更改') : `已保存 ${savedAt || fmtTime(currentNote.updated_at)}` }}
          </span>
        </div>
      </template>
      <div v-else class="editor-empty">
        <el-empty :image-size="120" description="选择左侧笔记开始编辑，或新建一篇笔记">
          <el-button type="primary" @click="createNote">
            <el-icon><Plus /></el-icon>新建笔记
          </el-button>
        </el-empty>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNoteStore, countWords } from '@/stores/note'
import { useTaskStore } from '@/stores/task'
import { useScheduleStore } from '@/stores/schedule'
import { useUiStore } from '@/stores/ui'
import { useUndoStore } from '@/stores/undo'
import { fmtTime } from '@/utils/datetime'
import { downloadMarkdown, downloadNotesZip } from '@/utils/exporter'
import NoteFolderPanel from '@/components/notes/NoteFolderPanel.vue'
import NoteListPanel from '@/components/notes/NoteListPanel.vue'
import NoteEditor from '@/components/notes/NoteEditor.vue'

const noteStore = useNoteStore()
const taskStore = useTaskStore()
const scheduleStore = useScheduleStore()
const uiStore = useUiStore()
const undoStore = useUndoStore()

/* ---------------- 筛选状态 ---------------- */
const activeFolder = ref('all')      // 'all' 或文件夹名
const activeTag = ref('all')         // 'all' 或标签名
const keyword = ref('')              // 全文检索关键词
const createRange = ref([])          // 创建时间范围 ['YYYY-MM-DD','YYYY-MM-DD']

const hasFilter = computed(() => activeFolder.value !== 'all' || activeTag.value !== 'all' || createRange.value.length === 2)

/** 组合筛选：文件夹 + 标签 + 创建时间范围 + 全文检索（标题与正文） */
const filteredNotes = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const [rs, re] = createRange.value.length === 2 ? createRange.value : [null, null]
  return noteStore.recentNotes.filter(n => {
    if (activeFolder.value !== 'all' && n.folder !== activeFolder.value) return false
    if (activeTag.value !== 'all' && !(n.tags || []).includes(activeTag.value)) return false
    if (rs && re) {
      const d = (n.created_at || '').slice(0, 10) // YYYY-MM-DD
      if (d < rs || d > re) return false
    }
    if (kw && !((n.title || '').toLowerCase().includes(kw) || (n.content || '').toLowerCase().includes(kw))) return false
    return true
  })
})

/* ---------------- 编辑区状态 ---------------- */
const selectedNoteId = ref(null)
const editorRef = ref(null)
const editContent = ref('')
const editTitle = ref('')
const dirty = ref(false)
const saving = ref(false)
const savedAt = ref('')
const titleBaseline = ref('')

const currentNote = computed(() => selectedNoteId.value ? noteStore.byId(selectedNoteId.value) : null)
const currentWords = computed(() => countWords(editContent.value))

/** 选中笔记：先保存上一篇，再载入新内容 */
async function selectNote(note) {
  if (selectedNoteId.value === note.note_id) return
  await flushSave()
  selectedNoteId.value = note.note_id
  editTitle.value = note.title
  titleBaseline.value = note.title
  dirty.value = false
  savedAt.value = ''
  undoPushed = false
  editHolder = null
  baseline = JSON.parse(JSON.stringify(note))
  editContent.value = note.content
  await nextTick()
  editorRef.value?.setValue(note.content)
}

/* ---------------- 自动保存（30s 定时 + 失焦） ---------------- */
let baseline = null       // 本次编辑会话起始快照（用于撤销）
let undoPushed = false    // 每个编辑会话只 push 一次撤销项
let editHolder = null     // 当前编辑会话的最新内容引用（撤销/重做闭包使用）

function onEditorInput() {
  // setValue 触发的 input 与库内内容一致时忽略，避免打开笔记即产生撤销项与多余的 updated_at 刷新
  if (currentNote.value && editContent.value === currentNote.value.content) {
    dirty.value = false
    return
  }
  dirty.value = true
  if (!undoPushed && currentNote.value && baseline) {
    undoPushed = true
    const noteId = currentNote.value.note_id
    const before = { content: baseline.content, title: baseline.title }
    editHolder = { content: editContent.value }
    const holder = editHolder
    undoStore.push({
      label: '编辑笔记',
      undo: async () => {
        await noteStore.updateNote(noteId, before)
        if (selectedNoteId.value === noteId) editorRef.value?.setValue(before.content)
      },
      redo: async () => {
        await noteStore.updateNote(noteId, { content: holder.content })
        if (selectedNoteId.value === noteId) editorRef.value?.setValue(holder.content)
      }
    })
  } else if (editHolder) {
    editHolder.content = editContent.value
  }
}

/** 保存当前笔记：内容入库（自动计算 word_count/标题）+ 解析 [[标题]] 同步关联任务/日程 */
async function flushSave() {
  if (!dirty.value || !currentNote.value) return
  saving.value = true
  try {
    const note = currentNote.value
    const content = editorRef.value?.getValue() ?? editContent.value
    // 解析双链：按标题匹配任务与日程（日程排除重复例外实例）
    const titles = noteStore.parseLinks(content)
    const taskIds = taskStore.tasks.filter(t => titles.includes(t.title)).map(t => t.task_id)
    const scheduleIds = scheduleStore.schedules
      .filter(s => s.repeat_type !== 'exception' && titles.includes(s.title))
      .map(s => s.schedule_id)
    await noteStore.updateNote(note.note_id, {
      content,
      related_task_ids: taskIds,
      related_schedule_ids: scheduleIds
    })
    dirty.value = false
    savedAt.value = fmtTime(new Date())
    // 标题可能被 store 自动更新（正文前15字），回填输入框
    editTitle.value = noteStore.byId(note.note_id)?.title || editTitle.value
  } finally {
    saving.value = false
  }
}

/** 标题修改：防抖提交 + 撤销（捕获 noteId，防止防抖期间切换笔记） */
let titleTimer = null
function commitTitle() {
  clearTimeout(titleTimer)
  const noteId = currentNote.value?.note_id
  titleTimer = setTimeout(async () => {
    const note = noteId ? noteStore.byId(noteId) : null
    if (!note || editTitle.value === note.title) return
    const oldTitle = titleBaseline.value
    const newTitle = editTitle.value
    await noteStore.updateNote(note.note_id, { title: newTitle })
    undoStore.push({
      label: '修改笔记标题',
      undo: async () => { await noteStore.updateNote(note.note_id, { title: oldTitle }) },
      redo: async () => { await noteStore.updateNote(note.note_id, { title: newTitle }) }
    })
  }, 500)
}

let intervalTimer = null
onMounted(() => { intervalTimer = setInterval(flushSave, 30000) })
onBeforeUnmount(async () => {
  clearInterval(intervalTimer)
  clearTimeout(titleTimer)
  await flushSave()
})

/* ---------------- 双链跳转 ---------------- */
/** 编辑器内点击 [[标题]] → 按标题查找任务/日程并打开详情面板 */
function openLinkByTitle(title) {
  const task = taskStore.tasks.find(t => t.title === title)
  if (task) { uiStore.openDetail('task', task.task_id); return }
  const sch = scheduleStore.schedules.find(s => s.repeat_type !== 'exception' && s.title === title)
  if (sch) { uiStore.openDetail('schedule', sch.schedule_id); return }
  ElMessage.info(`未找到标题为「${title}」的任务或日程`)
}

/* ---------------- 笔记操作 ---------------- */
/** 新建笔记：undo=删除笔记，redo=恢复笔记 */
async function createNote() {
  const folder = activeFolder.value === 'all' ? '临时笔记' : activeFolder.value
  const note = await noteStore.addNote({ folder, content: '' })
  undoStore.push({
    label: '新建笔记',
    undo: async () => {
      await noteStore.deleteNote(note.note_id)
      if (selectedNoteId.value === note.note_id) selectedNoteId.value = null
    },
    redo: async () => { await noteStore.restoreNote(note) }
  })
  ElMessage.success('已创建笔记')
  await selectNote(note)
}

/** 删除笔记（二次确认 + 撤销）：undo=恢复笔记，redo=删除笔记 */
async function removeNote(note) {
  try {
    await ElMessageBox.confirm(`确定删除笔记「${note.title || '未命名'}」吗？删除后可通过撤销恢复。`, '删除笔记', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
    })
  } catch { return }
  const snapshot = JSON.parse(JSON.stringify(note))
  await noteStore.deleteNote(note.note_id)
  if (selectedNoteId.value === note.note_id) selectedNoteId.value = null
  undoStore.push({
    label: '删除笔记',
    undo: async () => { await noteStore.restoreNote(snapshot) },
    redo: async () => { await noteStore.deleteNote(snapshot.note_id) }
  })
  ElMessage.success('已删除，可通过 Ctrl+Z 撤销')
}

/** 导出单篇笔记为 Markdown 文件 */
function exportNote(note) {
  const name = (note.title || '未命名').replace(/[\\/:*?"<>|]/g, '_')
  downloadMarkdown(note.content || '', `${name}.md`)
  ElMessage.success('已导出 Markdown 文件')
}

/** 批量导出全部笔记为 zip（按文件夹分目录） */
async function exportAll() {
  if (!noteStore.notes.length) { ElMessage.info('暂无笔记可导出'); return }
  await downloadNotesZip(noteStore.notes)
  ElMessage.success(`已导出 ${noteStore.notes.length} 篇笔记`)
}
</script>

<style scoped>
.note-view {
  display: flex;
  gap: 16px;
  height: 100%;
  padding: 16px 24px;
  overflow: hidden;
}

/* 右栏 */
.editor-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.editor-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.title-input { flex: 1; font-weight: 600; }
.editor-actions { display: flex; gap: 4px; }
.editor-body { flex: 1; min-height: 0; }
.editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  font-size: 12px;
  color: var(--pwb-text-secondary);
}
.save-status.dirty { color: var(--pwb-p1); }
.editor-empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.mobile-back { display: none; }

@media (min-width: 641px) and (max-width: 900px) {
  .note-view { padding: 14px; gap: 12px; }
  .note-view :deep(.side-panel) { display: none; }
  .note-view :deep(.list-panel) { width: 270px; flex: 0 0 270px; }
}

@media (max-width: 640px) {
  .note-view { padding: 10px; gap: 0; }
  .note-view :deep(.side-panel) { display: none; }
  .note-view :deep(.list-panel) { width: 100%; flex: 1; }
  .editor-panel { display: none; border-radius: 0; }
  .note-view.has-selection :deep(.list-panel) { display: none; }
  .note-view.has-selection .editor-panel { display: flex; }
  .mobile-back { display: inline-flex; flex-shrink: 0; }
}
</style>
