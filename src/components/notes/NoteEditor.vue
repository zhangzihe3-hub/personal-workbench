<!--
  笔记 Markdown 编辑器（Vditor 封装，PRD 3.3）
  - mode: 'ir'（即打即得），cache 关闭，避免多实例缓存串数据
  - toolbar：标题/加粗/斜体/删除线/链接/列表/任务/引用/代码/表格/图片/预览/全屏/撤销重做
  - 图片以 base64 形式本地存储（自定义 upload.handler 转 data URL，不依赖任何服务端）
  - counter 开启：编辑器底部实时显示字数
  - 深色模式：初始化按当前 html.dark 设置主题，并通过 MutationObserver 监听
    document.documentElement.classList 变化（settings.applyTheme 切换）调用 vditor.setTheme 联动
  - 双链：编辑区（IR 块）/ 预览区点击 [[标题]] 文本时，通过 caretRangeFromPoint 计算点击偏移，
    命中 [[…]] 区间则 emit('link-click', title)，由父组件跳转任务/日程详情（不破坏 contenteditable）
  - 通过 v-model 向外同步内容（input 事件）；切换笔记时由父组件调用 setValue() 整体替换
  - 失焦（blur）时 emit('blur')，由父组件触发保存
  - 组件卸载时 vditor.destroy()，防止内存泄漏
-->
<template>
  <div ref="editorRef" class="note-vditor"></div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

const props = defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue', 'input', 'blur', 'link-click'])

const editorRef = ref(null)
let vditor = null
let ready = false
let themeObserver = null

/** 当前是否为深色模式（跟随全局 html.dark class） */
function isDark() {
  return document.documentElement.classList.contains('dark')
}

/** 同步 Vditor 主题到当前深色状态 */
function applyTheme() {
  if (!vditor || !ready) return
  try {
    vditor.setTheme(isDark() ? 'dark' : 'classic')
  } catch (e) {
    // 主题切换失败不影响编辑，静默忽略
  }
}

/** 监听根节点 class 变化，深色模式切换时联动 Vditor 主题 */
function watchTheme() {
  themeObserver = new MutationObserver(() => applyTheme())
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}

/**
 * 获取鼠标坐标对应的文本 Range（兼容 Chrome/Edge 的 caretRangeFromPoint 与 Firefox 的 caretPositionFromPoint）
 */
function rangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y)
    if (pos) {
      const r = document.createRange()
      r.setStart(pos.offsetNode, pos.offset)
      return r
    }
  }
  return null
}

/** 计算文本节点在其祖先容器内从头开始的文本偏移（TreeWalker 顺序与 textContent 一致） */
function offsetInContainer(container, node) {
  let offset = 0
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let cur = walker.nextNode()
  while (cur) {
    if (cur === node) return offset
    offset += (cur.textContent || '').length
    cur = walker.nextNode()
  }
  return -1
}

/**
 * 点击事件委托：IR 编辑区或预览区点击 [[标题]] 文本 → 抛给父组件跳转
 * 通过坐标定位文本节点与偏移，不修改编辑区 DOM，不影响输入体验
 */
function handleClick(e) {
  // 普通 markdown 链接由浏览器默认行为处理，不拦截
  if (e.target.closest?.('a')) return
  // IR 编辑块 或 预览容器
  const block = e.target.closest?.('.vditor-ir__block') || e.target.closest?.('.vditor-reset')
  if (!block) return
  const range = rangeFromPoint(e.clientX, e.clientY)
  if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return
  const node = range.startContainer
  const base = offsetInContainer(block, node)
  if (base < 0) return
  const absOffset = base + range.startOffset
  const text = block.textContent || ''
  // 匹配块内所有 [[标题]] 双链
  const re = /\[\[([^\]]+)\]\]/g
  let m
  while ((m = re.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (absOffset >= start && absOffset <= end) {
      emit('link-click', m[1].trim())
      return
    }
  }
}

onMounted(() => {
  vditor = new Vditor(editorRef.value, {
    mode: 'ir',
    cache: { enable: false },          // 关闭本地缓存，避免多笔记实例串数据
    value: props.modelValue,
    height: '100%',
    theme: isDark() ? 'dark' : 'classic',
    placeholder: '开始记录…支持 Markdown，正文中使用 [[标题]] 可关联任务/日程',
    counter: { enable: true, type: 'text' }, // 底部实时字数统计
    toolbar: [
      'headings', 'bold', 'italic', 'strike', 'link', '|',
      'list', 'ordered-list', 'check', 'quote', '|',
      'code', 'inline-code', 'table', 'image', '|',
      'undo', 'redo', '|', 'preview', 'fullscreen'
    ],
    upload: {
      // 图片本地 base64 存储：选择图片后转 data URL 插入正文，无需服务端
      accept: 'image/*',
      multiple: false,
      handler(files, callback) {
        const file = files && files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          // succMap 的 value 即图片 URL（base64 data URL），Vditor 会自动插入 ![文件名](url)
          callback({ msg: '', code: 0, data: { errFiles: [], succMap: { [file.name]: reader.result } } })
        }
        reader.onerror = () => {
          callback({ msg: '图片读取失败', code: 1, data: { errFiles: [file.name], succMap: {} } })
        }
        reader.readAsDataURL(file)
      }
    },
    after() {
      ready = true
      // after 回调中重新写入一次，确保初始值生效
      vditor.setValue(props.modelValue || '')
      applyTheme()
      watchTheme()
      // 双链点击跳转：事件委托劫持 IR 编辑区 / 预览区点击
      editorRef.value?.addEventListener('click', handleClick)
    },
    input(val) {
      emit('update:modelValue', val)
      emit('input', val)
    },
    blur() {
      emit('blur')
    }
  })
})

/** 切换笔记时由父组件调用：整体替换编辑区内容 */
function setValue(val) {
  if (vditor && ready) vditor.setValue(val || '')
}

/** 读取当前编辑区内容（保存前兜底） */
function getValue() {
  return vditor && ready ? vditor.getValue() : props.modelValue
}

defineExpose({ setValue, getValue })

onBeforeUnmount(() => {
  try { themeObserver && themeObserver.disconnect() } catch (e) { /* 忽略 */ }
  try { vditor && vditor.destroy() } catch (e) { /* Vditor 销毁异常可忽略 */ }
  vditor = null
  ready = false
})
</script>

<style scoped>
.note-vditor {
  height: 100%;
  border: 1px solid var(--pwb-border);
  border-radius: var(--pwb-radius);
  overflow: hidden;
}
/* 适配全局变量的基础配色，深色模式下由 Vditor 自身 dark 主题接管 */
.note-vditor :deep(.vditor) {
  border: none;
}
</style>
