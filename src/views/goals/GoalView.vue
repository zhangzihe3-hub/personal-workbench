<!--
  目标与习惯追踪页（PRD 3.6）
  上半区：目标管理（GoalPanel）；下半区：习惯打卡（HabitPanel）
-->
<template>
  <div class="page-container goal-view">
    <h2 class="page-title">目标与习惯追踪</h2>

    <!-- 上半区：目标管理 -->
    <section class="section pwb-card">
      <div class="section-header">
        <el-icon class="section-icon"><Aim /></el-icon>
        <span class="section-title">目标管理</span>
        <span class="section-hint">按周期设定目标，拆解关键结果并关联任务</span>
      </div>
      <GoalPanel />
    </section>

    <!-- 下半区：习惯打卡 -->
    <section class="section pwb-card">
      <div class="section-header">
        <el-icon class="section-icon"><Calendar /></el-icon>
        <span class="section-title">习惯打卡</span>
        <span class="section-hint">每日打卡积累连续记录，点击热力格可补打</span>
      </div>
      <HabitPanel />
    </section>
  </div>
</template>

<script setup>
import GoalPanel from '@/components/goals/GoalPanel.vue'
import HabitPanel from '@/components/goals/HabitPanel.vue'
</script>

<style scoped>
.goal-view { display: flex; flex-direction: column; gap: 16px; }
.section { display: flex; flex-direction: column; gap: 16px; }
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--pwb-border);
}
.section-icon { color: var(--pwb-primary); font-size: 18px; }
.section-title { font-weight: 600; }
.section-hint { font-size: 12px; color: var(--pwb-text-secondary); }
</style>
