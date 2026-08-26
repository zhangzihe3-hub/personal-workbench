<template>
  <el-dialog
    v-model="visible"
    title="快速速记"
    width="480px"
    class="mobile-sheet-dialog quick-note-dialog"
    :close-on-click-modal="true"
    @closed="text = ''"
  >
    <el-input
      v-model="text"
      type="textarea"
      :rows="4"
      placeholder="记录此刻的想法…（Ctrl+Enter 保存为临时笔记）"
      autofocus
      @keydown.ctrl.enter="save"
    />
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="save" :disabled="!text.trim()">保存速记</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useUiStore } from '@/stores/ui'
import { useNoteStore } from '@/stores/note'
import { useUndoStore } from '@/stores/undo'

const uiStore = useUiStore()
const noteStore = useNoteStore()
const undoStore = useUndoStore()
const text = ref('')

const visible = computed({
  get: () => uiStore.quickNoteVisible,
  set: (v) => { uiStore.quickNoteVisible = v }
})

async function save() {
  const content = text.value.trim()
  if (!content) return
  const note = await noteStore.quickCapture(content)
  visible.value = false
  ElMessage.success('已保存到临时笔记')
  undoStore.push({
    label: '新增速记',
    undo: async () => noteStore.deleteNote(note.note_id),
    redo: async () => noteStore.restoreNote(note)
  })
}
</script>
