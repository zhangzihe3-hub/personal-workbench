<!--
  常用收藏夹（PRD 3.5.3）
  - 以 tab 分组展示三类收藏：网址(url) / 本地文件路径(file) / 常用话术(text)
  - 添加走对话框（type / title / content）
  - url 一键新窗口打开；file / text 一键复制到剪贴板并 toast
  - 删除二次确认 + 撤销：撤销恢复直接写库（db.favorites.put）并 push 到 store，
    保留原 fav_id，保证撤销/重做 id 稳定（store.addFavorite 会重新生成 fav_id，故不走它）
-->
<template>
  <div class="favorites">
    <div class="fav-toolbar">
      <el-button type="primary" size="small" @click="openAddDialog">
        <el-icon><Plus /></el-icon>添加收藏
      </el-button>
    </div>

    <!-- 三类 tab 分组 -->
    <el-tabs v-model="activeTab" class="fav-tabs">
      <el-tab-pane v-for="t in TABS" :key="t.value" :name="t.value">
        <template #label>
          {{ t.label }}<span class="tab-count">({{ countByType(t.value) }})</span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- 收藏列表 -->
    <div v-if="filteredFavorites.length" class="fav-list">
      <div v-for="f in filteredFavorites" :key="f.fav_id" class="fav-item">
        <el-tag :type="tagTypeByType[f.type]" size="small" effect="plain" class="fav-type">
          {{ typeLabel[f.type] }}
        </el-tag>
        <div class="fav-main">
          <div class="fav-title" :title="f.title">{{ f.title }}</div>
          <div class="fav-content" :title="f.content">{{ f.content }}</div>
        </div>
        <div class="fav-actions">
          <el-button v-if="f.type === 'url'" text size="small" type="primary" @click="openUrl(f)">
            <el-icon><Link /></el-icon>打开
          </el-button>
          <el-button v-else text size="small" type="primary" @click="copyContent(f)">
            <el-icon><CopyDocument /></el-icon>复制
          </el-button>
          <el-button text size="small" type="danger" @click="removeFav(f)">
            <el-icon><Delete /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
    <div v-else class="empty-hint">{{ emptyTextByTab }}</div>

    <!-- 添加对话框 -->
    <el-dialog v-model="dialogVisible" title="添加收藏" width="480px" class="mobile-page-dialog" destroy-on-close>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="类型">
          <el-radio-group v-model="form.type">
            <el-radio-button value="url">网址</el-radio-button>
            <el-radio-button value="file">文件路径</el-radio-button>
            <el-radio-button value="text">常用话术</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="100" placeholder="如：公司 Wiki" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input
            v-model="form.content" type="textarea" :rows="3"
            :placeholder="placeholderByType[form.type]"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAdd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useToolboxStore } from '@/stores/toolbox'
import { useUndoStore } from '@/stores/undo'
import { db } from '@/db'

const toolboxStore = useToolboxStore()
const undoStore = useUndoStore()

/* ---------------- 类型元数据 ---------------- */
const TABS = [
  { value: 'all', label: '全部' },
  { value: 'url', label: '网址' },
  { value: 'file', label: '文件路径' },
  { value: 'text', label: '常用话术' }
]
const typeLabel = { url: '网址', file: '文件', text: '话术' }
const tagTypeByType = { url: 'primary', file: 'warning', text: 'success' }
const placeholderByType = {
  url: 'https://example.com',
  file: 'D:\\Documents\\报告.docx',
  text: '输入常用话术内容'
}

const activeTab = ref('all')

const filteredFavorites = computed(() => {
  if (activeTab.value === 'all') return toolboxStore.favorites
  return toolboxStore.favorites.filter(f => f.type === activeTab.value)
})
function countByType(type) {
  if (type === 'all') return toolboxStore.favorites.length
  return toolboxStore.favorites.filter(f => f.type === type).length
}
const emptyTextByTab = computed(() => {
  const map = {
    all: '暂无收藏，点击「添加收藏」添加常用网址、文件路径或话术',
    url: '暂无网址收藏',
    file: '暂无文件路径收藏',
    text: '暂无常用话术收藏'
  }
  return map[activeTab.value] || map.all
})

/* ---------------- 添加（对话框） ---------------- */
const dialogVisible = ref(false)
const form = reactive({ type: 'url', title: '', content: '' })

function openAddDialog() {
  form.type = 'url'
  form.title = ''
  form.content = ''
  dialogVisible.value = true
}

async function confirmAdd() {
  const title = form.title.trim()
  const content = form.content.trim()
  if (!title || !content) { ElMessage.warning('请填写标题和内容'); return }
  const fav = await toolboxStore.addFavorite({ type: form.type, title, content })
  // 撤销 = 删除；重做 = 按原 fav_id 恢复（restoreFavorite 保留 id）
  undoStore.push({
    label: '添加收藏',
    undo: async () => { await toolboxStore.deleteFavorite(fav.fav_id) },
    redo: async () => { await restoreFavorite(fav) }
  })
  dialogVisible.value = false
  ElMessage.success('已添加收藏')
}

/* ---------------- 打开 / 复制 ---------------- */
function openUrl(fav) {
  const url = /^https?:\/\//i.test(fav.content) ? fav.content : `https://${fav.content}`
  window.open(url, '_blank', 'noopener')
}

async function copyContent(fav) {
  try {
    await navigator.clipboard.writeText(fav.content)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请检查浏览器剪贴板权限')
  }
}

/* ---------------- 删除（确认 + 撤销） ---------------- */
async function removeFav(fav) {
  try {
    await ElMessageBox.confirm(
      `确定删除收藏「${fav.title}」吗？删除后可通过 Ctrl+Z 撤销恢复。`,
      '删除收藏',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }
  const snapshot = JSON.parse(JSON.stringify(fav))
  await toolboxStore.deleteFavorite(fav.fav_id)
  // 撤销恢复：db 直写保留原 fav_id，重做仍按原 id 删除（store 无 updateFavorite 恢复方法，属组件内直用 db，不改 store）
  undoStore.push({
    label: '删除收藏',
    undo: async () => { await restoreFavorite(snapshot) },
    redo: async () => { await toolboxStore.deleteFavorite(fav.fav_id) }
  })
  ElMessage.success('已删除，可通过 Ctrl+Z 撤销')
}

/** 按原 fav_id 恢复收藏：db.favorites.put 写库 + 追加到 store.favorites（若不存在） */
async function restoreFavorite(fav) {
  await db.favorites.put(JSON.parse(JSON.stringify(fav)))
  if (!toolboxStore.favorites.some(f => f.fav_id === fav.fav_id)) {
    toolboxStore.favorites.push(fav)
  }
}
</script>

<style scoped>
.favorites { display: flex; flex-direction: column; gap: 8px; }
.fav-toolbar { display: flex; justify-content: flex-end; }
.fav-tabs :deep(.el-tabs__header) { margin-bottom: 8px; }
.tab-count { font-size: 12px; color: var(--pwb-text-secondary); margin-left: 4px; }
.fav-list { display: flex; flex-direction: column; gap: 8px; max-height: 360px; overflow-y: auto; }
.fav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
}
.fav-item:hover { background: var(--pwb-bg-hover); }
.fav-type { flex-shrink: 0; }
.fav-main { flex: 1; min-width: 0; }
.fav-title { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fav-content {
  font-size: 12px;
  color: var(--pwb-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fav-actions { display: flex; gap: 4px; flex-shrink: 0; }
.empty-hint { font-size: 12px; color: var(--pwb-text-secondary); padding: 8px 0; }
</style>
