<template>
  <span class="quadrant-tag" :style="{ background: q.color }" :title="q.hint">{{ q.label }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { getQuadrant } from '@/stores/task'

const props = defineProps({
  task: { type: Object, default: null },
  important: { type: Boolean, default: undefined },
  urgent: { type: Boolean, default: undefined }
})

const q = computed(() => {
  if (props.task) return getQuadrant(props.task)
  return getQuadrant({ important: !!props.important, urgent: !!props.urgent })
})
</script>

<style scoped>
.quadrant-tag {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
  padding: 1px 6px;
  color: #fff;
  white-space: nowrap;
  line-height: 1.5;
}
</style>
