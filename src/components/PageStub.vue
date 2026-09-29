<script setup lang="ts">
defineProps<{ title: string; description: string }>()
</script>

<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
    <h1 class="mb-2 text-2xl font-bold">{{ title }}</h1>
    <p class="text-slate-600 dark:text-slate-400">{{ description }}</p>
    <slot />
  </section>
</template>
