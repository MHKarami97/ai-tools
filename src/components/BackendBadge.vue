<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeInfo } from '@/workers/protocol'

const props = defineProps<{ info: RuntimeInfo }>()

const label = computed(() => (props.info.backend === 'webgpu' ? 'WebGPU' : 'WASM'))
const isSlow = computed(
  () => props.info.backend === 'wasm' && (!props.info.crossOriginIsolated || props.info.hardwareConcurrency < 4),
)
</script>

<template>
  <div class="space-y-2 text-sm">
    <p>
      موتور اجرا:
      <span
        class="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
        :class="info.backend === 'webgpu' ? 'bg-emerald-600' : 'bg-slate-600'"
        dir="ltr"
      >
        {{ label }}
      </span>
    </p>
    <p v-if="isSlow" role="alert" class="rounded-lg bg-amber-100 px-3 py-2 text-amber-900">
      اجرا روی WASM بدون چندرشته‌ای یا با هسته‌های کم انجام می‌شود و ممکن است کند باشد.
    </p>
  </div>
</template>
