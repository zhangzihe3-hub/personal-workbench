<template>
  <div class="currency-converter">
    <div class="amount-field">
      <span>金额</span>
      <el-input-number v-model="amount" :min="0" :controls="false" :precision="4" placeholder="输入金额" />
    </div>

    <div class="currency-row">
      <el-select v-model="fromCurrency" filterable aria-label="原货币" @change="clearRate">
        <el-option v-for="item in currencies" :key="item.code" :label="`${item.code} · ${item.name}`" :value="item.code" />
      </el-select>
      <el-button circle plain aria-label="交换货币" @click="swapCurrencies"><el-icon><Switch /></el-icon></el-button>
      <el-select v-model="toCurrency" filterable aria-label="目标货币" @change="clearRate">
        <el-option v-for="item in currencies" :key="item.code" :label="`${item.code} · ${item.name}`" :value="item.code" />
      </el-select>
    </div>

    <el-button type="primary" :loading="loading" @click="loadRate">获取最新汇率</el-button>

    <div v-if="rateInfo" class="currency-result" aria-live="polite">
      <span class="result-caption">{{ amount }} {{ fromCurrency }} 可兑换</span>
      <div><strong>{{ convertedAmount }}</strong><span>{{ toCurrency }}</span></div>
      <small>1 {{ fromCurrency }} = {{ formattedRate }} {{ toCurrency }} · {{ rateInfo.date }}</small>
    </div>
    <div v-else class="empty-hint">参考汇率每日更新，实际成交价以银行或支付机构为准</div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiFetch } from '@/services/api'

const currencies = [
  { code: 'CNY', name: '人民币' }, { code: 'USD', name: '美元' },
  { code: 'EUR', name: '欧元' }, { code: 'GBP', name: '英镑' },
  { code: 'JPY', name: '日元' }, { code: 'HKD', name: '港币' },
  { code: 'AUD', name: '澳元' }, { code: 'CAD', name: '加元' },
  { code: 'CHF', name: '瑞士法郎' }, { code: 'SGD', name: '新加坡元' },
  { code: 'KRW', name: '韩元' }, { code: 'THB', name: '泰铢' },
  { code: 'MYR', name: '马来西亚林吉特' }, { code: 'INR', name: '印度卢比' },
  { code: 'NZD', name: '新西兰元' }
]

const amount = ref(100)
const fromCurrency = ref('CNY')
const toCurrency = ref('USD')
const rateInfo = ref(null)
const loading = ref(false)

const convertedAmount = computed(() => formatMoney(Number(amount.value || 0) * Number(rateInfo.value?.rate || 0)))
const formattedRate = computed(() => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(rateInfo.value?.rate || 0))

function formatMoney(value) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value)
}

function clearRate() {
  rateInfo.value = null
}

async function loadRate() {
  loading.value = true
  try {
    rateInfo.value = await apiFetch(`/tools/exchange-rate?base=${fromCurrency.value}&quote=${toCurrency.value}`)
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    loading.value = false
  }
}

async function swapCurrencies() {
  ;[fromCurrency.value, toCurrency.value] = [toCurrency.value, fromCurrency.value]
  if (rateInfo.value) await loadRate()
}
</script>

<style scoped>
.currency-converter { display: flex; flex-direction: column; gap: 16px; }
.amount-field { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 10px; color: var(--pwb-text-secondary); font-size: 13px; }
.amount-field :deep(.el-input-number) { width: 100%; }
.amount-field :deep(.el-input__inner) { text-align: left; }
.currency-row { display: grid; grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr); gap: 8px; align-items: center; }
.currency-result { min-height: 112px; padding: 14px 16px; border-radius: var(--pwb-radius); background: var(--pwb-bg-hover); display: flex; flex-direction: column; gap: 7px; }
.result-caption, .currency-result small, .empty-hint { color: var(--pwb-text-secondary); font-size: 12px; }
.currency-result > div { display: flex; align-items: baseline; gap: 8px; }
.currency-result strong { color: var(--pwb-primary); font-size: 26px; line-height: 1.2; word-break: break-all; }
.currency-result > div span { color: var(--pwb-text-secondary); font-size: 13px; }
.empty-hint { min-height: 44px; line-height: 1.6; }
@media (max-width: 640px) {
  .currency-row { grid-template-columns: minmax(0, 1fr) 42px minmax(0, 1fr); }
}
</style>

