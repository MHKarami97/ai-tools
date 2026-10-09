<script setup lang="ts">
import HistoryList from '@/components/HistoryList.vue'
</script>

<template>
  <section class="space-y-2">
    <header>
      <h1 class="text-2xl font-bold">تاریخچه</h1>
      <p class="text-sm text-slate-600 dark:text-slate-400">
        همه کارهای انجام‌شده در یک‌جا. روی «باز کردن / ادامه» بزنید تا برای ویرایش یا ادامه کار باز شود.
      </p>
    </header>
    <HistoryList title="همه ابزارها" source-label="نام" />
  </section>
</template>
