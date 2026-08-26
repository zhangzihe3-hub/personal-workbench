<template>
  <el-dialog
    v-model="visible"
    title="快速新建任务"
    width="560px"
    class="mobile-sheet-dialog quick-task-dialog"
    :close-on-click-modal="true"
    @closed="reset"
  >
    <el-input
      v-model="input"
      size="large"
      placeholder="一句话创建任务，如：明天18点前 重要紧急 完成需求文档 #工作"
      autofocus
      @keyup.enter="save"
    >
      <template #prefix><el-icon><MagicStick /></el-icon></template>
    </el-input>
    <!-- 解析预览 -->
    <div v-if="parsed.title" class="parse-preview">
      <span class="preview-title">{{ parsed.title }}</span>
      <el-tag v-if="parsed.deadline" size="small" type="warning">截止 {{ fmtDateTime(parsed.deadline) }}</el-tag>
      <QuadrantTag v-if="parsed.important || parsed.urgent" :important="parsed.important" :urgent="parsed.urgent" />
      <el-tag v-if="parsed.repeat_type !== 'none'" size="small" effect="plain">重复</el-tag>
      <el-tag v-for="t in parsed.tags" :key="t" size="small" effect="plain">#{{ t }}</el-tag>
    </div>
    <el-collapse class="full-form-toggle">
      <el-collapse-item title="完整表单（可选）" name="form">
        <el-form label-width="80px" size="default">
          <el-form-item label="截止时间">
            <el-date-picker v-model="form.deadline" type="datetime" placeholder="选择截止时间" style="width:100%" value-format="YYYY-MM-DDTHH:mm:ss" />
          </el-form-item>
          <el-form-item label="四象限">
            <el-checkbox v-model="form.important" label="重要" border size="small" />
            <el-checkbox v-model="form.urgent" label="紧急" border size="small" />
          </el-form-item>
          <el-form-item label="分类">
            <el-select v-model="form.category" filterable allow-create style="width:100%">
              <el-option v-for="c in metaStore.taskCategories" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
          <el-form-item label="描述">
            <el-input v-model="form.description" type="textarea" :rows="3" placeholder="支持 Markdown" />
          </el-form-item>
        </el-form>
      </el-collapse-item>
    </el-collapse>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!parsed.title" @click="save">创建任务</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useUiStore } from '@/stores/ui'
import { useTaskStore } from '@/stores/task'
import { useMetaStore } from '@/stores/meta'
import { useUndoStore } from '@/stores/undo'
import { parseTaskInput } from '@/utils/nlp'
import { fmtDateTime, dayjs } from '@/utils/datetime'
import QuadrantTag from '@/components/tasks/QuadrantTag.vue'

const uiStore = useUiStore()
const taskStore = useTaskStore()
const metaStore = useMetaStore()
const undoStore = useUndoStore()

const input = ref('')
const form = reactive({ deadline: null, important: false, urgent: false, category: null, description: '' })

const visible = computed({
  get: () => uiStore.quickTaskVisible,
  set: (v) => { uiStore.quickTaskVisible = v }
})

const parsed = computed(() => parseTaskInput(input.value))

async function save() {
  const p = parsed.value
  if (!p.title) return
  const task = await taskStore.addTask({
    title: p.title,
    deadline: form.deadline ? dayjs(form.deadline).toISOString() : p.deadline,
    important: form.important || p.important,
    urgent: form.urgent || p.urgent,
    repeat_type: p.repeat_type,
    category: form.category || undefined,
    tags: p.tags,
    description: form.description || p.description
  })
  visible.value = false
  ElMessage.success('任务已创建')
  undoStore.push({
    label: `新建任务「${task.title}」`,
    undo: async () => taskStore.deleteTask(task.task_id),
    redo: async () => taskStore.restoreTask(task)
  })
}

function reset() {
  input.value = ''
  Object.assign(form, { deadline: null, important: false, urgent: false, category: null, description: '' })
}
</script>

<style scoped>
.parse-preview {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: var(--pwb-bg);
  border-radius: 8px;
}
.preview-title { font-weight: 600; margin-right: 4px; }
.full-form-toggle { margin-top: 12px; --el-collapse-header-height: 36px; }
</style>
