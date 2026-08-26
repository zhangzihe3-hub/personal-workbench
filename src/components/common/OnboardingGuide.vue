<template>
  <el-dialog v-model="visible" width="560px" :show-close="true" class="onboarding-dialog mobile-page-dialog" @closed="finish">
    <div class="onboarding">
      <div class="step-icon">{{ steps[step].icon }}</div>
      <h2>{{ steps[step].title }}</h2>
      <p class="desc">{{ steps[step].desc }}</p>
      <div v-if="steps[step].tips" class="tips">
        <div v-for="(tip, i) in steps[step].tips" :key="i" class="tip-item">
          <kbd v-if="tip.key">{{ tip.key }}</kbd><span>{{ tip.text }}</span>
        </div>
      </div>
      <div class="dots">
        <span v-for="(s, i) in steps" :key="i" class="dot" :class="{ active: i === step }" />
      </div>
      <div class="actions">
        <el-button text @click="visible = false">跳过引导</el-button>
        <el-button v-if="step > 0" @click="step--">上一步</el-button>
        <el-button type="primary" @click="next">{{ step === steps.length - 1 ? '开始使用' : '下一步' }}</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'

const uiStore = useUiStore()
const settingsStore = useSettingsStore()
const step = ref(0)

const visible = computed({
  get: () => uiStore.onboardingVisible,
  set: (v) => { uiStore.onboardingVisible = v }
})

const steps = [
  {
    icon: '👋',
    title: '欢迎使用个人工作台',
    desc: '任务、日程、笔记、数据一体化管理。Web 与 Android 安全连接你的个人 MySQL 服务器。'
  },
  {
    icon: '⚡',
    title: '快速录入',
    desc: '支持自然语言一句话创建任务与日程，自动识别时间、四象限与标签。',
    tips: [
      { text: '「明天18点前 重要紧急 完成需求文档 #工作」' },
      { text: '「下周三下午2点到4点 项目评审会 会议室A」' }
    ]
  },
  {
    icon: '⌨️',
    title: '全局快捷键',
    desc: '高频操作一键直达，无需鼠标。',
    tips: [
      { key: 'Ctrl K', text: '全局搜索' },
      { key: 'Ctrl N', text: '快速新建任务' },
      { key: 'Ctrl Shift N', text: '快速速记' },
      { key: 'Ctrl Z', text: '撤销操作' },
      { key: 'Esc', text: '关闭弹窗/面板' }
    ]
  },
  {
    icon: '🔗',
    title: '数据互通',
    desc: '笔记中输入 [[任务标题]] 或 [[日程标题]] 即可建立双向关联；任务、日程、笔记互相跳转，复盘统计自动生成。'
  },
  {
    icon: '🔒',
    title: '数据安全',
    desc: '建议先在「设置」中导出一次 JSON 备份熟悉流程。你也可以设置解锁密码与自动锁定，保护个人隐私。'
  }
]

function next() {
  if (step.value < steps.length - 1) step.value++
  else visible.value = false
}

function finish() {
  settingsStore.update({ onboarded: true })
  step.value = 0
}
</script>

<style scoped>
.onboarding { text-align: center; padding: 8px 16px 16px; }
.step-icon { font-size: 48px; margin-bottom: 8px; }
h2 { margin: 0 0 8px; }
.desc { color: var(--pwb-text-secondary); margin: 0 0 16px; line-height: 1.7; }
.tips { text-align: left; background: var(--pwb-bg); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
.tip-item { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
.tip-item kbd {
  background: var(--pwb-bg-card);
  border: 1px solid var(--pwb-border);
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
  font-family: inherit;
  white-space: nowrap;
}
.dots { display: flex; justify-content: center; gap: 6px; margin: 8px 0 20px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pwb-border); }
.dot.active { background: var(--pwb-primary); }
.actions { display: flex; justify-content: space-between; }
</style>
