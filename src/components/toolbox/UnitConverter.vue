<template>
  <div class="converter">
    <el-segmented v-model="categoryKey" :options="categoryOptions" class="category-tabs desktop-categories" />
    <el-select v-model="categoryKey" class="mobile-categories" aria-label="换算类别">
      <el-option v-for="option in categoryOptions" :key="option.value" :label="option.label" :value="option.value" />
    </el-select>

    <div class="amount-field">
      <span>数值</span>
      <el-input-number v-model="amount" :controls="false" :precision="8" placeholder="输入数值" />
    </div>

    <div class="unit-row">
      <el-select v-model="fromUnit" filterable aria-label="原单位">
        <el-option v-for="unit in currentUnits" :key="unit.key" :label="unit.label" :value="unit.key" />
      </el-select>
      <el-button circle plain aria-label="交换单位" @click="swapUnits"><el-icon><Switch /></el-icon></el-button>
      <el-select v-model="toUnit" filterable aria-label="目标单位">
        <el-option v-for="unit in currentUnits" :key="unit.key" :label="unit.label" :value="unit.key" />
      </el-select>
    </div>

    <div class="conversion-result" aria-live="polite">
      <span class="result-caption">换算结果</span>
      <strong>{{ formattedResult }}</strong>
      <span>{{ toUnitLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { UNIT_CATEGORIES, convertUnit, formatConvertedNumber } from '@/utils/unitConversion'

const categoryKey = ref('length')
const amount = ref(1)
const fromUnit = ref('m')
const toUnit = ref('km')

const categoryOptions = UNIT_CATEGORIES.map(category => ({ label: category.label, value: category.key }))
const currentCategory = computed(() => UNIT_CATEGORIES.find(category => category.key === categoryKey.value))
const currentUnits = computed(() => currentCategory.value?.units || [])
const result = computed(() => convertUnit(amount.value, categoryKey.value, fromUnit.value, toUnit.value))
const formattedResult = computed(() => formatConvertedNumber(result.value))
const toUnitLabel = computed(() => currentUnits.value.find(unit => unit.key === toUnit.value)?.label || '')

watch(categoryKey, () => {
  const units = currentUnits.value
  fromUnit.value = units[0]?.key || ''
  toUnit.value = units[1]?.key || units[0]?.key || ''
})

function swapUnits() {
  ;[fromUnit.value, toUnit.value] = [toUnit.value, fromUnit.value]
}
</script>

<style scoped>
.converter { display: flex; flex-direction: column; gap: 16px; }
.category-tabs { width: 100%; overflow-x: auto; justify-content: flex-start; }
.mobile-categories { display: none; }
.amount-field { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 10px; color: var(--pwb-text-secondary); font-size: 13px; }
.amount-field :deep(.el-input-number) { width: 100%; }
.amount-field :deep(.el-input__inner) { text-align: left; }
.unit-row { display: grid; grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr); gap: 8px; align-items: center; }
.conversion-result { min-height: 92px; padding: 14px 16px; border-radius: var(--pwb-radius); background: var(--pwb-bg-hover); display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.conversion-result .result-caption { width: 100%; color: var(--pwb-text-secondary); font-size: 12px; }
.conversion-result strong { color: var(--pwb-primary); font-size: 26px; line-height: 1.2; word-break: break-all; }
.conversion-result > span:last-child { color: var(--pwb-text-secondary); font-size: 13px; }
@media (max-width: 640px) {
  .desktop-categories { display: none; }
  .mobile-categories { display: block; width: 100%; }
  .unit-row { grid-template-columns: minmax(0, 1fr) 42px minmax(0, 1fr); }
}
</style>
