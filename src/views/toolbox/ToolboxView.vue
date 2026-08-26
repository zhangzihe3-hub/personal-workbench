<!--
  快捷工具箱页（PRD 3.5）
  五个工具卡片：番茄钟 / 日期计算器 / 汇率换算 / 单位换算 / 常用收藏夹
  收藏夹卡片内容较多，跨整行展示（grid-column: 1 / -1）
-->
<template>
  <div class="page-container toolbox-view">
    <h2 class="page-title">快捷工具箱</h2>
    <div class="toolbox-grid">
      <div class="pwb-card tool-card">
        <div class="card-header">
          <el-icon class="card-icon"><Timer /></el-icon>
          <span class="card-title">番茄钟</span>
        </div>
        <PomodoroTimer />
      </div>

      <div class="pwb-card tool-card">
        <div class="card-header">
          <el-icon class="card-icon"><Calendar /></el-icon>
          <span class="card-title">日期计算器</span>
        </div>
        <DateCalculator />
      </div>

      <div class="pwb-card tool-card">
        <div class="card-header">
          <el-icon class="card-icon"><Money /></el-icon>
          <span class="card-title">汇率计算器</span>
        </div>
        <CurrencyConverter />
      </div>

      <div class="pwb-card tool-card">
        <div class="card-header">
          <el-icon class="card-icon"><Operation /></el-icon>
          <span class="card-title">单位换算计算器</span>
        </div>
        <UnitConverter />
      </div>

      <div class="pwb-card tool-card fav-card">
        <div class="card-header">
          <el-icon class="card-icon"><Star /></el-icon>
          <span class="card-title">常用收藏夹</span>
        </div>
        <FavoriteList />
      </div>
    </div>
  </div>
</template>

<script setup>
import PomodoroTimer from '@/components/toolbox/PomodoroTimer.vue'
import DateCalculator from '@/components/toolbox/DateCalculator.vue'
import FavoriteList from '@/components/toolbox/FavoriteList.vue'
import CurrencyConverter from '@/components/toolbox/CurrencyConverter.vue'
import UnitConverter from '@/components/toolbox/UnitConverter.vue'
</script>

<style scoped>
.toolbox-view { display: flex; flex-direction: column; }
/* 8px 栅格：卡片间距 16px，最小宽度 360px */
.toolbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
  align-items: start;
}
.tool-card { display: flex; flex-direction: column; gap: 16px; }
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--pwb-border);
}
.card-icon { color: var(--pwb-primary); font-size: 18px; }
.card-title { font-weight: 600; }
/* 收藏夹内容较长，占满整行 */
.fav-card { grid-column: 1 / -1; }
@media (max-width: 640px) {
  .toolbox-view { padding-top: 10px; }
  .tool-card { padding: 16px 0; border-width: 0 0 1px; border-radius: 0; }
}
</style>
