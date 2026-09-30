<script setup lang="ts">
import HistoryList from '@/components/HistoryList.vue'
import SplitterPanel from '@/components/SplitterPanel.vue'
</script>

<template>
  <SplitterPanel />
  <HistoryList kind="splitter" title="تاریخچهٔ جداسازی" source-label="فایل اصلی" />
</template>
