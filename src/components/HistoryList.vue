<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { historyStore, type HistoryEntry, type HistoryKind } from '@/lib/history/historyStore'

const props = defineProps<{
  kind: HistoryKind
  title: string
  sourceLabel: string
}>()

const entries = ref<HistoryEntry[]>([])
const formatter = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })

async function refresh(): Promise<void> {
  entries.value = await historyStore.list(props.kind)
}

async function clearAll(): Promise<void> {
  if (!window.confirm('کل تاریخچه پاک شود؟')) return
  await historyStore.clear(props.kind)
}

onMounted(refresh)
watch(() => historyStore.version.value, refresh)
</script>

<template>
  <section class="mx-auto mt-6 w-full max-w-3xl space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="font-semibold">{{ title }}</h2>
      <button
        v-if="entries.length > 0"
        type="button"
        class="rounded-lg border border-red-400 px-3 py-1 text-xs text-red-600"
        @click="clearAll"
      >
        پاک‌کردن همه
      </button>
    </div>

    <p v-if="entries.length === 0" class="text-sm text-slate-500">هنوز چیزی ثبت نشده است.</p>

    <ul v-else class="divide-y divide-slate-200 dark:divide-slate-800">
      <li v-for="entry in entries" :key="entry.id" class="space-y-1 py-3 text-sm">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <p class="break-all">
            <span class="text-slate-500">{{ sourceLabel }}:</span>
            <span dir="auto"> {{ entry.sourceName }}</span>
          </p>
          <button type="button" class="text-xs text-red-600" @click="historyStore.remove(entry.id)">حذف</button>
        </div>
        <ul class="space-y-0.5 text-slate-600 dark:text-slate-400">
          <li v-for="output in entry.outputs" :key="output" dir="ltr" class="break-all text-start">{{ output }}</li>
        </ul>
        <p class="text-xs text-slate-500">{{ formatter.format(entry.createdAt) }}</p>
      </li>
    </ul>
  </section>
</template>
