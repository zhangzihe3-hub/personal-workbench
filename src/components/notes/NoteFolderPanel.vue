<!--
  笔记页左栏（PRD 3.3）：文件夹管理 + 标签筛选
  - 文件夹：新建/重命名/删除（删除时文件夹下笔记自动移入「临时笔记」），显示各文件夹笔记数
  - 标签：全局标签（metaStore.allTags）∪ 笔记中出现的标签去重，单击切换筛选
  - 全部文件夹/标签操作均接入全局撤销栈（undoStore.push）
  筛选状态由父组件 NoteView 持有，通过 v-model:folder / v-model:tag 双向同步
-->
<template>
  <aside class="side-panel pwb-card">
    <!-- ============ 文件夹 ============ -->
    <div class="panel-block">
      <div class="block-header">
        <span class="block-title">文件夹</span>
        <el-button text circle size="small" title="新建文件夹" @click="createFolder">
          <el-icon><FolderAdd /></el-icon>
        </el-button>
      </div>
      <div class="folder-list">
        <div
          class="folder-item" :class="{ active: activeFolder === 'all' }"
          @click="emit('update:folder', 'all')"
        >
          <el-icon><Files /></el-icon>
          <span class="folder-name">全部笔记</span>
          <span class="folder-count">{{ noteStore.notes.length }}</span>
        </div>
        <div
          v-for="f in noteStore.folders" :key="f.name"
          class="folder-item" :class="{ active: activeFolder === f.name }"
          @click="emit('update:folder', f.name)"
        >
          <el-icon><Folder /></el-icon>
          <span class="folder-name" :title="f.name">{{ f.name }}</span>
          <span class="folder-count">{{ noteStore.byFolder(f.name).length }}</span>
          <span class="folder-actions" @click.stop>
            <el-button text circle size="small" title="重命名" @click="renameFolder(f)">
              <el-icon><EditPen /></el-icon>
            </el-button>
            <el-button
              v-if="f.name !== '临时笔记'"
              text circle size="small" title="删除文件夹" @click="removeFolder(f)"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </span>
        </div>
      </div>
    </div>

    <!-- ============ 标签筛选 ============ -->
    <div class="panel-block">
      <div class="block-header">
        <span class="block-title">标签筛选</span>
        <el-button v-if="activeTag !== 'all'" text size="small" @click="emit('update:tag', 'all')">
          清除
        </el-button>
      </div>
      <div v-if="tagOptions.length" class="tag-list">
        <span
          v-for="t in tagOptions" :key="t"
          class="tag-chip" :class="{ active: activeTag === t }"
          @click="toggleTag(t)"
        >#{{ t }}</span>
      </div>
      <div v-else class="empty-hint">暂无标签，可在笔记详情中添加</div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useNoteStore } from '@/stores/note'
import { useMetaStore } from '@/stores/meta'
import { useUndoStore } from '@/stores/undo'

const props = defineProps({
  activeFolder: { type: String, default: 'all' }, // 'all' 或文件夹名
  activeTag: { type: String, default: 'all' }     // 'all' 或标签名
})
const emit = defineEmits(['update:folder', 'update:tag'])

const noteStore = useNoteStore()
const metaStore = useMetaStore()
const undoStore = useUndoStore()

/** 标签选项：全局标签 ∪ 笔记中出现的标签（去重），保证已使用的标签一定可选 */
const tagOptions = computed(() => {
  const fromNotes = noteStore.notes.flatMap(n => n.tags || [])
  return [...new Set([...metaStore.allTags, ...fromNotes])]
})

/** 单击切换标签，再次点击取消 */
function toggleTag(t) {
  emit('update:tag', props.activeTag === t ? 'all' : t)
}

/* ---------------- 文件夹操作（全部接入撤销栈） ---------------- */

/** 新建文件夹：undo=删除文件夹，redo=重新创建 */
async function createFolder() {
  let name
  try {
    const { value } = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
      confirmButtonText: '创建', cancelButtonText: '取消', inputPlaceholder: '如：工作笔记'
    })
    name = (value || '').trim().slice(0, 50)
  } catch { return }
  if (!name) return
  if (noteStore.folders.some(f => f.name === name)) { ElMessage.warning('文件夹已存在'); return }
  await noteStore.addFolder(name)
  undoStore.push({
    label: '新建文件夹',
    undo: async () => { await noteStore.deleteFolder(name) },
    redo: async () => { await noteStore.addFolder(name) }
  })
  ElMessage.success('文件夹已创建')
}

/** 重命名文件夹：撤销/重做对调 renameFolder 参数 */
async function renameFolder(folder) {
  let newName
  try {
    const { value } = await ElMessageBox.prompt('请输入新的文件夹名称', '重命名文件夹', {
      confirmButtonText: '确定', cancelButtonText: '取消', inputValue: folder.name
    })
    newName = (value || '').trim().slice(0, 50)
  } catch { return }
  if (!newName || newName === folder.name) return
  if (noteStore.folders.some(f => f.name === newName)) { ElMessage.warning('文件夹已存在'); return }
  const oldName = folder.name
  await noteStore.renameFolder(oldName, newName)
  // 若当前正按旧文件夹名筛选，切换为筛选新名称
  if (props.activeFolder === oldName) emit('update:folder', newName)
  undoStore.push({
    label: '重命名文件夹',
    undo: async () => { await noteStore.renameFolder(newName, oldName) },
    redo: async () => { await noteStore.renameFolder(oldName, newName) }
  })
  ElMessage.success('已重命名')
}

/** 删除文件夹（笔记自动移入「临时笔记」）：撤销=重建文件夹并恢复笔记归属 */
async function removeFolder(folder) {
  const count = noteStore.byFolder(folder.name).length
  try {
    await ElMessageBox.confirm(
      `文件夹「${folder.name}」下有 ${count} 篇笔记，删除后这些笔记将移入「临时笔记」。确定删除吗？`,
      '删除文件夹',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }
  // 快照受影响笔记 id，用于撤销时恢复其文件夹归属
  const affected = noteStore.byFolder(folder.name).map(n => n.note_id)
  await noteStore.deleteFolder(folder.name)
  if (props.activeFolder === folder.name) emit('update:folder', 'all')
  undoStore.push({
    label: '删除文件夹',
    undo: async () => {
      await noteStore.addFolder(folder.name)
      for (const id of affected) {
        if (noteStore.byId(id)) await noteStore.updateNote(id, { folder: folder.name })
      }
    },
    redo: async () => { await noteStore.deleteFolder(folder.name) }
  })
  ElMessage.success('文件夹已删除，笔记已移入「临时笔记」')
}
</script>

<style scoped>
.side-panel {
  width: 224px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
}
.panel-block { display: flex; flex-direction: column; gap: 8px; }
.block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.block-title { font-weight: 600; font-size: 13px; color: var(--pwb-text-secondary); }
.folder-list { display: flex; flex-direction: column; gap: 2px; }
.folder-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--pwb-text);
}
.folder-item:hover { background: var(--pwb-bg-hover); }
.folder-item.active { background: var(--pwb-bg-hover); color: var(--pwb-primary); font-weight: 600; }
.folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-count { font-size: 12px; color: var(--pwb-text-secondary); }
.folder-actions { display: none; align-items: center; }
.folder-item:hover .folder-actions { display: inline-flex; }
.folder-item:hover .folder-count { display: none; }
.tag-list { display: flex; flex-wrap: wrap; gap: 8px; }
.tag-chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--pwb-bg-hover);
  color: var(--pwb-text-secondary);
  cursor: pointer;
}
.tag-chip:hover { color: var(--pwb-primary); }
.tag-chip.active { background: var(--pwb-primary); color: #fff; }
.empty-hint { font-size: 12px; color: var(--pwb-text-secondary); }
</style>
