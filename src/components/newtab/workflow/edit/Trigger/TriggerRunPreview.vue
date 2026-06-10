<template>
  <div class="trigger-run-preview">
    <div
      v-if="isDisabled"
      class="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400"
    >
      <v-remixicon name="riInformationLine" size="18" />
      <span>{{ t('triggerPreview.disabled') }}</span>
    </div>

    <template v-else>
      <div v-if="warnings.length > 0" class="mb-3 space-y-1">
        <div
          v-for="(warning, idx) in warnings"
          :key="idx"
          class="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-700 dark:bg-amber-900/20"
        >
          <v-remixicon
            name="riAlertLine"
            size="18"
            class="mt-0.5 shrink-0 text-amber-500"
          />
          <span class="text-amber-700 dark:text-amber-300">
            {{ warning.message }}
          </span>
        </div>
      </div>

      <div v-if="timeline.length > 0">
        <p
          class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300"
        >
          {{ t('triggerPreview.nextRuns') }}
        </p>
        <div class="space-y-1">
          <div
            v-for="entry in timeline"
            :key="entry.key"
            class="flex items-center gap-2 rounded-lg border p-2 text-sm"
            :class="
              entry.isDuplicate
                ? 'border-amber-300 dark:border-amber-700'
                : 'border-gray-200 dark:border-gray-700'
            "
          >
            <span
              v-if="entry.time"
              class="w-44 shrink-0 font-mono text-xs text-gray-700 dark:text-gray-300"
            >
              {{ formatTime(entry.time) }}
            </span>
            <span
              v-else
              class="w-44 shrink-0 text-xs italic text-gray-400 dark:text-gray-500"
            >
              {{ t('triggerPreview.eventDriven') }}
            </span>

            <span
              class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium"
              :class="badgeClass(entry.triggerType)"
            >
              {{ t(`workflow.blocks.trigger.items.${entry.triggerType}`) }}
            </span>

            <span
              class="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400"
            >
              {{ entry.description }}
            </span>

            <v-remixicon
              v-if="entry.isDuplicate"
              v-tooltip="t('triggerPreview.duplicate')"
              name="riAlertLine"
              size="16"
              class="shrink-0 text-amber-500"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="triggers.length === 0"
        class="rounded-lg border border-dashed border-gray-300 p-3 text-center text-sm text-gray-400 dark:border-gray-600 dark:text-gray-500"
      >
        {{ t('triggerPreview.noScheduled') }}
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from '@/lib/dayjs';
import {
  computeUnifiedTimeline,
  detectDuplicates,
  detectNeverFire,
} from '@/utils/triggerNextRun';

const props = defineProps({
  triggers: {
    type: Array,
    default: () => [],
  },
  isDisabled: {
    type: Boolean,
    default: false,
  },
});

const { t } = useI18n();

const BADGE_CLASSES = {
  interval: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'cron-job':
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'specific-day':
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  date: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'visit-web':
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'on-startup':
    'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400',
  'context-menu':
    'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400',
  'keyboard-shortcut':
    'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400',
};

const duplicateTriggerIds = computed(() => {
  if (props.isDisabled || props.triggers.length < 2) return new Set();
  const dups = detectDuplicates(props.triggers);
  return new Set(dups.flatMap((d) => d.triggerIds));
});

const timeline = computed(() => {
  if (props.isDisabled || !props.triggers.length) return [];

  const entries = computeUnifiedTimeline(props.triggers, 5);
  return entries.map((e, i) => ({
    ...e,
    key: `${e.triggerId}-${i}`,
    isDuplicate: duplicateTriggerIds.value.has(e.triggerId),
  }));
});

const warnings = computed(() => {
  if (props.isDisabled || !props.triggers.length) return [];

  const result = [];

  for (const trigger of props.triggers) {
    const nf = detectNeverFire(trigger);
    if (nf.willNeverFire) {
      const typeName = t(`workflow.blocks.trigger.items.${trigger.type}`);
      result.push({
        type: 'never-fire',
        message: t(`triggerPreview.neverFire.${nf.reason}`, {
          type: typeName,
        }),
      });
    }
  }

  const duplicates = detectDuplicates(props.triggers);
  for (const dup of duplicates) {
    result.push({
      type: 'duplicate',
      message: t('triggerPreview.duplicateWarning', {
        reason: t(`triggerPreview.reasons.${dup.reason}`),
      }),
    });
  }

  return result;
});

function badgeClass(type) {
  return BADGE_CLASSES[type] || BADGE_CLASSES['on-startup'];
}

function formatTime(date) {
  return dayjs(date).format('ddd, DD MMM YYYY HH:mm:ss');
}
</script>
