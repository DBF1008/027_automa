<template>
  <router-link
    v-if="parentLog"
    replace
    :to="'/logs/' + currentLog.parentLog?.id || currentLog.collectionLogId"
    class="mb-4 flex"
  >
    <v-remixicon name="riArrowLeftLine" class="mr-2" />
    {{ t('log.goBack', { name: parentLog.name }) }}
  </router-link>
  <div class="flex flex-col-reverse items-start lg:flex-row">
    <div class="w-full lg:w-auto lg:flex-1">
      <div class="dark rounded-lg bg-gray-900 text-gray-100">
        <div class="mb-4 flex items-center border-b p-4 text-gray-200">
          <div v-if="currentLog.status === 'error' && errorBlock">
            <p class="line-clamp leading-tight">
              {{ errorBlock.message }}
              <a
                v-if="errorBlock.messageId"
                :href="`https://docs.extension.automa.site/reference/workflow-common-errors.html#${errorBlock.messageId}`"
                target="_blank"
                title="About the error"
                @click.stop
              >
                <v-remixicon
                  name="riArrowLeftLine"
                  size="20"
                  class="inline-block text-gray-300"
                  rotate="135"
                />
              </a>
            </p>
            <p class="cursor-pointer" title="Jump to item" @click="jumpToError">
              On the {{ errorBlock.name }} block
              <v-remixicon
                name="riArrowLeftLine"
                class="-ml-1 inline-block"
                size="18"
                rotate="135"
              />
            </p>
          </div>
          <slot name="header-prepend" />
          <div class="grow" />
          <ui-popover v-if="!isRunning" trigger-width class="mr-4">
            <template #trigger>
              <ui-button>
                <span>
                  Export <span class="hidden lg:inline-block">logs</span>
                </span>
                <v-remixicon name="riArrowDropDownLine" class="ml-2 -mr-1" />
              </ui-button>
            </template>
            <ui-list class="space-y-1">
              <ui-list-item
                v-for="type in dataExportTypes"
                :key="type.id"
                v-close-popover
                class="cursor-pointer"
                @click="exportLogs(type.id)"
              >
                {{ t(`log.exportData.types.${type.id}`) }}
              </ui-list-item>
            </ui-list>
          </ui-popover>
          <ui-input
            v-if="!isRunning"
            v-model="state.search"
            :placeholder="t('common.search')"
            prepend-icon="riSearch2Line"
          />
        </div>
        <div
          id="log-history"
          style="max-height: 500px"
          class="scroll overflow-auto p-4"
        >
          <slot name="prepend" />
          <p
            v-if="currentLog.history.length === 0"
            class="text-center text-gray-300"
          >
            The workflow log is not saved
          </p>
          <div v-if="!compareMode" class="w-full space-y-1 overflow-auto font-mono text-sm">
            <div
              v-for="(item, index) in displayHistory"
              :key="item.id || index"
              :disabled="!ctxData[item.id]"
              :class="{ 'bg-box-transparent': item.id === state.itemId }"
              hide-header-icon
              class="hoverable group flex w-full cursor-default items-start rounded-md px-2 py-1 text-left focus:ring-0"
              @click="setActiveLog(item)"
            >
              <div
                style="min-width: 54px"
                class="text-overflow mr-4 shrink-0 text-gray-400"
              >
                <span
                  v-if="item.timestamp"
                  :title="
                    dayjs(item.timestamp).format('YYYY-MM-DDTHH:mm:ss.SSS')
                  "
                >
                  {{ dayjs(item.timestamp).format('HH:mm:ss') }}
                  {{ `(${countDuration(0, item.duration || 0).trim()})` }}
                </span>
                <span v-else :title="`${Math.round(item.duration / 1000)}s`">
                  {{ countDuration(0, item.duration || 0) }}
                </span>
              </div>
              <span
                :class="logsType[item.type]?.color"
                :title="item.type"
                class="text-overflow w-2/12 shrink-0"
              >
                <v-remixicon
                  :name="logsType[item.type]?.icon"
                  size="18"
                  class="-mr-1 inline-block align-text-top"
                />
                {{ item.name }}
              </span>
              <span
                :title="`${t('common.description')} (${item.description})`"
                class="text-overflow ml-2 w-2/12 shrink-0"
              >
                {{ item.description }}
              </span>
              <p
                :title="item.message"
                class="line-clamp ml-2 flex-1 text-sm leading-tight text-gray-600 dark:text-gray-200"
              >
                {{ item.message }}
                <a
                  v-if="item.messageId"
                  :href="`https://docs.extension.automa.site/reference/workflow-common-errors.html#${item.messageId}`"
                  target="_blank"
                  title="About the error"
                  @click.stop
                >
                  <v-remixicon
                    name="riArrowLeftLine"
                    size="20"
                    class="inline-block text-gray-300"
                    rotate="135"
                  />
                </a>
              </p>
              <router-link
                v-if="item.logId"
                v-slot="{ navigate }"
                :to="{ name: 'logs-details', params: { id: item.logId } }"
                custom
              >
                <v-remixicon
                  title="Open log detail"
                  class="ml-2 cursor-pointer text-gray-300"
                  size="20"
                  name="riFileTextLine"
                  @click.stop="navigate"
                />
              </router-link>
              <router-link
                v-if="!isRunning && getBlockPath(item.blockId)"
                v-show="currentLog.workflowId && item.blockId"
                :to="getBlockPath(item.blockId)"
              >
                <v-remixicon
                  name="riExternalLinkLine"
                  size="20"
                  title="Go to block"
                  class="invisible ml-2 cursor-pointer text-gray-300 group-hover:visible"
                />
              </router-link>
            </div>
            <slot name="append-items" />
          </div>
          <div v-else class="w-full space-y-1 overflow-auto font-mono text-sm">
            <div
              v-for="(entry, index) in displayHistory"
              :key="index"
              :class="[
                {
                  'bg-box-transparent':
                    (entry.a || entry.b).id === state.itemId,
                },
                entry.diffStatus === 'diff'
                  ? 'bg-yellow-900/20'
                  : entry.diffStatus === 'only-a'
                    ? 'bg-blue-900/15'
                    : entry.diffStatus === 'only-b'
                      ? 'bg-purple-900/15'
                      : '',
              ]"
              class="hoverable group flex w-full cursor-default items-start rounded-md px-2 py-1 text-left focus:ring-0"
              @click="setActiveLog(entry)"
            >
              <span
                class="mr-2 flex shrink-0 items-center justify-center"
                style="min-width: 22px"
              >
                <v-remixicon
                  v-if="entry.diffStatus === 'match'"
                  name="riCheckLine"
                  size="16"
                  class="text-green-400/50"
                />
                <v-remixicon
                  v-else-if="entry.diffStatus === 'diff'"
                  name="riErrorWarningLine"
                  size="16"
                  class="text-yellow-400"
                />
                <span
                  v-else-if="entry.diffStatus === 'only-a'"
                  class="text-xs font-bold text-blue-400"
                >
                  A
                </span>
                <span
                  v-else
                  class="text-xs font-bold text-purple-400"
                >
                  B
                </span>
              </span>
              <div
                style="min-width: 54px"
                class="text-overflow mr-4 shrink-0 text-gray-400"
              >
                <template v-if="entry.a && entry.b && entry.diffFields?.duration">
                  <span :title="dayjs(entry.a.timestamp).format('YYYY-MM-DDTHH:mm:ss.SSS')">
                    {{ dayjs(entry.a.timestamp).format('HH:mm:ss') }}
                  </span>
                  <span class="block text-xs">
                    A: {{ countDuration(0, entry.a.duration || 0).trim() }}
                    / B: {{ countDuration(0, entry.b.duration || 0).trim() }}
                  </span>
                </template>
                <template v-else>
                  <span
                    v-if="(entry.a || entry.b).timestamp"
                    :title="dayjs((entry.a || entry.b).timestamp).format('YYYY-MM-DDTHH:mm:ss.SSS')"
                  >
                    {{ dayjs((entry.a || entry.b).timestamp).format('HH:mm:ss') }}
                    {{ `(${countDuration(0, (entry.a || entry.b).duration || 0).trim()})` }}
                  </span>
                  <span v-else>
                    {{ countDuration(0, (entry.a || entry.b).duration || 0) }}
                  </span>
                </template>
              </div>
              <span
                :class="logsType[(entry.a || entry.b).type]?.color"
                :title="(entry.a || entry.b).type"
                class="text-overflow w-2/12 shrink-0"
              >
                <v-remixicon
                  :name="logsType[(entry.a || entry.b).type]?.icon"
                  size="18"
                  class="-mr-1 inline-block align-text-top"
                />
                {{ (entry.a || entry.b).name }}
              </span>
              <span
                :title="`${t('common.description')} (${(entry.a || entry.b).description})`"
                class="text-overflow ml-2 w-2/12 shrink-0"
              >
                {{ (entry.a || entry.b).description }}
                <span
                  v-if="entry.diffFields?.description"
                  class="block text-xs text-yellow-300/70"
                >
                  B: {{ entry.b?.description }}
                </span>
              </span>
              <div class="ml-2 flex-1 text-sm leading-tight">
                <p
                  v-if="!entry.diffFields?.message"
                  class="line-clamp text-gray-600 dark:text-gray-200"
                >
                  {{ (entry.a || entry.b).message }}
                </p>
                <template v-else>
                  <p class="line-clamp text-gray-200">
                    <span class="mr-1 text-xs text-blue-400">A:</span>
                    {{ entry.a?.message }}
                  </p>
                  <p class="line-clamp text-yellow-300/80">
                    <span class="mr-1 text-xs text-purple-400">B:</span>
                    {{ entry.b?.message }}
                  </p>
                </template>
              </div>
              <router-link
                v-if="!isRunning && getBlockPath((entry.a || entry.b).blockId)"
                v-show="currentLog.workflowId && (entry.a || entry.b).blockId"
                :to="getBlockPath((entry.a || entry.b).blockId)"
              >
                <v-remixicon
                  name="riExternalLinkLine"
                  size="20"
                  title="Go to block"
                  class="invisible ml-2 cursor-pointer text-gray-300 group-hover:visible"
                />
              </router-link>
            </div>
            <slot name="append-items" />
          </div>
        </div>
      </div>
      <div
        v-if="(compareMode ? displayRecordCount : currentLog.history.length) >= 25"
        class="mt-4 lg:flex lg:items-center lg:justify-between"
      >
        <div class="mb-4 lg:mb-0">
          {{ t('components.pagination.text1') }}
          <select v-model="pagination.perPage" class="bg-input rounded-md p-1">
            <option
              v-for="num in [25, 50, 75, 100, 150, 200]"
              :key="num"
              :value="num"
            >
              {{ num }}
            </option>
          </select>
          {{
            t('components.pagination.text2', {
              count: displayRecordCount,
            })
          }}
        </div>
        <ui-pagination
          v-model="pagination.currentPage"
          :per-page="pagination.perPage"
          :records="displayRecordCount"
        />
      </div>
    </div>
    <div
      v-if="state.itemId && activeLog"
      class="dark mb-4 w-full rounded-lg bg-gray-900 text-gray-100 lg:ml-8 lg:mb-0 lg:w-4/12"
    >
      <div class="relative p-4">
        <v-remixicon
          name="riCloseLine"
          class="absolute top-2 right-2 cursor-pointer text-gray-500"
          @click="clearActiveItem"
        />
        <table class="ctx-data-table w-full">
          <thead>
            <tr>
              <td class="w-5/12"></td>
              <td></td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-gray-300">Name</td>
              <td>{{ activeLog.name }}</td>
            </tr>
            <tr>
              <td class="text-gray-300">Description</td>
              <td>
                <p class="line-clamp leading-tight">
                  {{ activeLog.description }}
                </p>
              </td>
            </tr>
            <tr>
              <td class="text-gray-300">Status</td>
              <td class="capitalize">{{ activeLog.type }}</td>
            </tr>
            <tr>
              <td class="text-gray-300">Timestamp/Duration</td>
              <td>
                <span v-if="activeLog.timestamp">
                  {{ dayjs(activeLog.timestamp).format('DD MMM, HH:mm:ss') }}
                  /
                </span>
                {{ countDuration(0, activeLog.duration || 0).trim() }}
              </td>
            </tr>
            <tr v-if="activeLog.message">
              <td class="text-gray-300">Message</td>
              <td>
                <p class="line-clamp leading-tight">
                  {{ activeLog.message }}
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="compareMode" class="flex items-center px-4 pb-2">
        <ui-select v-model="state.activeCompareRun" class="w-full">
          <option value="a">{{ t('log.compare.runA') }}</option>
          <option value="b">{{ t('log.compare.runB') }}</option>
        </ui-select>
      </div>
      <div class="flex items-center px-4 pb-4">
        <p>Log data</p>
        <div class="grow" />
        <ui-select v-model="state.activeTab">
          <option v-for="option in tabs" :key="option.id" :value="option.id">
            {{ option.name }}
          </option>
        </ui-select>
      </div>
      <div class="log-data-prev px-2 pb-4">
        <shared-codemirror
          :model-value="logCtxData"
          readonly
          hide-lang
          lang="json"
          style="max-height: 460px"
          class="scroll"
        />
      </div>
    </div>
  </div>
</template>
<script setup>
/* eslint-disable no-use-before-define */
import dayjs from '@/lib/dayjs';
import { getBlocks } from '@/utils/getSharedData';
import { countDuration, fileSaver } from '@/utils/helper';
import { dataExportTypes, messageHasReferences } from '@/utils/shared';
import {
  alignHistories,
  buildComparisonExportData,
} from '@/utils/logCompare';
import objectPath from 'object-path';
import Papa from 'papaparse';
import {
  computed,
  defineAsyncComponent,
  shallowReactive,
  shallowRef,
  watch,
} from 'vue';
import { useI18n } from 'vue-i18n';

const SharedCodemirror = defineAsyncComponent(() =>
  import('@/components/newtab/shared/SharedCodemirror.vue')
);
const blocks = getBlocks();

const props = defineProps({
  currentLog: {
    type: Object,
    default: () => ({}),
  },
  ctxData: {
    type: Object,
    default: () => ({}),
  },
  parentLog: {
    type: Object,
    default: null,
  },
  isRunning: Boolean,
  compareMode: {
    type: Boolean,
    default: false,
  },
  compareLog: {
    type: Object,
    default: null,
  },
  compareCtxData: {
    type: Object,
    default: () => ({}),
  },
});

const files = {
  'plain-text': {
    mime: 'text/plain',
    ext: '.txt',
  },
  json: {
    mime: 'application/json',
    ext: '.json',
  },
  csv: {
    mime: 'text/csv',
    ext: '.csv',
  },
};
const logsType = {
  success: {
    color: 'text-green-400',
    icon: 'riCheckLine',
  },
  stop: {
    color: 'text-yellow-400',
    icon: 'riStopLine',
  },
  stopped: {
    color: 'text-yellow-400',
    icon: 'riStopLine',
  },
  error: {
    color: 'text-red-400',
    icon: 'riErrorWarningLine',
  },
  finish: {
    color: 'text-blue-300',
    icon: 'riFlagLine',
  },
};
const tabs = [
  { id: 'all', name: 'All' },
  { id: 'referenceData.loopData', name: 'Loop data' },
  { id: 'referenceData.variables', name: 'Variables' },
  { id: 'referenceData.prevBlockData', name: 'Previous block data' },
  { id: 'replacedValue', name: 'Replaced value' },
];

const { t, te } = useI18n();

const state = shallowReactive({
  itemId: '',
  search: '',
  activeTab: 'all',
  activeCompareRun: 'a',
});
const pagination = shallowReactive({
  perPage: 25,
  currentPage: 1,
});
const activeLog = shallowRef(null);
const activeAlignedEntry = shallowRef(null);

const translatedLog = computed(() =>
  props.currentLog.history.map(translateLog)
);
const filteredLog = computed(() => {
  const query = state.search.toLocaleLowerCase();

  return translatedLog.value.filter(
    (log) =>
      log.name.toLocaleLowerCase().includes(query) ||
      log.description?.toLocaleLowerCase().includes(query)
  );
});
const history = computed(() =>
  filteredLog.value.slice(
    (pagination.currentPage - 1) * pagination.perPage,
    pagination.currentPage * pagination.perPage
  )
);
const translatedCompareLog = computed(() =>
  props.compareMode && props.compareLog
    ? props.compareLog.history.map(translateLog)
    : []
);
const alignedEntries = computed(() =>
  props.compareMode
    ? alignHistories(translatedLog.value, translatedCompareLog.value)
    : []
);
const filteredAligned = computed(() => {
  if (!props.compareMode) return [];
  const query = state.search.toLocaleLowerCase();
  return alignedEntries.value.filter((entry) => {
    const item = entry.a || entry.b;
    return (
      item.name.toLocaleLowerCase().includes(query) ||
      item.description?.toLocaleLowerCase().includes(query)
    );
  });
});
const displayHistory = computed(() => {
  const source = props.compareMode ? filteredAligned.value : filteredLog.value;
  return source.slice(
    (pagination.currentPage - 1) * pagination.perPage,
    pagination.currentPage * pagination.perPage
  );
});
const displayRecordCount = computed(() =>
  props.compareMode ? filteredAligned.value.length : filteredLog.value.length
);
const errorBlock = computed(() => {
  if (props.currentLog.status !== 'error') return null;

  let block = props.currentLog.history.at(-1);
  if (!block || block.type !== 'error' || block.id < 25) return null;

  block = translateLog(block);

  let { name } = block;
  if (block.description) name += ` (${block.description})`;

  return {
    name,
    id: block.id,
    message: block.message,
    messageId: block.messageId,
  };
});
const logCtxData = computed(() => {
  const sourceCtx =
    props.compareMode && state.activeCompareRun === 'b'
      ? props.compareCtxData
      : props.ctxData;
  let logData = sourceCtx;
  if (logData.ctxData) logData = logData.ctxData;

  if (!state.itemId || !logData[state.itemId]) return '';

  const data = logData[state.itemId];
  /* eslint-disable-next-line */
  if (data?.referenceData) getDataSnapshot(data.referenceData, sourceCtx);
  const itemLogData =
    state.activeTab === 'all' ? data : objectPath.get(data, state.activeTab);

  return JSON.stringify(itemLogData, null, 2);
});

function getDataSnapshot(refData, sourceCtxData) {
  const snapshot = sourceCtxData || props.ctxData;
  if (!snapshot?.dataSnapshot) return;

  const data = snapshot.dataSnapshot;
  const getData = (key) => {
    const currentData = refData[key];
    if (typeof currentData !== 'string') return currentData;

    return data[currentData] ?? {};
  };

  refData.loopData = getData('loopData');
  refData.variables = getData('variables');
}
function exportLogs(type) {
  if (props.compareMode) {
    exportComparisonLogs(type);
    return;
  }
  let data = type === 'plain-text' ? '' : [];
  const getItemData = {
    'plain-text': ([
      timestamp,
      status,
      name,
      description,
      message,
      ctxData,
    ]) => {
      data += `${timestamp} - ${status} - ${name} - ${description} - ${message} - ${JSON.stringify(
        ctxData
      )} \n`;
    },
    json: ([timestamp, status, name, description, message, ctxData]) => {
      data.push({
        timestamp,
        status,
        name,
        description,
        message,
        data: ctxData,
      });
    },
    csv: (item, index) => {
      if (index === 0) {
        data.unshift([
          'timestamp',
          'status',
          'name',
          'description',
          'message',
          'data',
        ]);
      }

      item[item.length - 1] = JSON.stringify(item[item.length - 1]);

      data.push(item);
    },
  };
  translatedLog.value.forEach((item, index) => {
    let logData = props.ctxData;
    if (logData.ctxData) logData = logData.ctxData;

    const itemData = logData[item.id] || null;
    if (itemData) getDataSnapshot(itemData.referenceData);

    getItemData[type](
      [
        dayjs(item.timestamp || Date.now()).format('DD-MM-YYYY, hh:mm:ss'),
        item.type.toUpperCase(),
        item.name,
        item.description || 'NULL',
        item.message || 'NULL',
        itemData,
      ],
      index
    );
  });

  switch (type) {
    case 'plain-text':
      data = [data];
      break;
    case 'csv':
      data = [Papa.unparse(data)];
      data.unshift(new Uint8Array([0xef, 0xbb, 0xbf]));
      break;
    case 'json':
      data = [JSON.stringify(data, null, 2)];
      break;
    default:
  }

  const { mime, ext } = files[type];
  const blobUrl = URL.createObjectURL(new Blob(data, { type: mime }));
  const filename = `[${dayjs().format('DD-MM-YYYY, HH:mm:ss')}] ${
    props.currentLog.name
  } - logs`;

  fileSaver(`${filename}${ext}`, blobUrl);

  URL.revokeObjectURL(blobUrl);
}
function exportComparisonLogs(type) {
  const fmtTs = (ts) => dayjs(ts || Date.now()).format('DD-MM-YYYY, hh:mm:ss');
  const rows = buildComparisonExportData(
    alignedEntries.value,
    props.ctxData,
    props.compareCtxData,
    fmtTs
  );

  let data;
  const csvCols = [
    'blockId',
    'name',
    'diff_status',
    'status_a',
    'status_b',
    'message_a',
    'message_b',
    'description_a',
    'description_b',
    'duration_a',
    'duration_b',
    'timestamp_a',
    'timestamp_b',
  ];

  switch (type) {
    case 'plain-text': {
      let text = '';
      rows.forEach((r) => {
        const tag = `[${r.diff_status.toUpperCase()}]`;
        text += `${tag} ${r.name} | A: ${r.status_a} "${r.message_a}" (${r.duration_a}ms) | B: ${r.status_b} "${r.message_b}" (${r.duration_b}ms)\n`;
      });
      data = [text];
      break;
    }
    case 'json':
      data = [JSON.stringify(rows, null, 2)];
      break;
    case 'csv': {
      const csvRows = [csvCols];
      rows.forEach((r) => {
        csvRows.push(csvCols.map((col) => String(r[col] ?? '')));
      });
      data = [Papa.unparse(csvRows)];
      data.unshift(new Uint8Array([0xef, 0xbb, 0xbf]));
      break;
    }
    default:
      return;
  }

  const { mime, ext } = files[type];
  const blobUrl = URL.createObjectURL(new Blob(data, { type: mime }));
  const compareName = props.compareLog?.name || 'compare';
  const filename = `[${dayjs().format('DD-MM-YYYY, HH:mm:ss')}] ${
    props.currentLog.name
  } vs ${compareName} - compare`;

  fileSaver(`${filename}${ext}`, blobUrl);
  URL.revokeObjectURL(blobUrl);
}
function clearActiveItem() {
  state.itemId = '';
  activeLog.value = null;
}
function translateLog(log) {
  const copyLog = { ...log };
  const getTranslatation = (path, def) => {
    const params = typeof path === 'string' ? { path } : path;

    return te(params.path) ? t(params.path, params.params) : def;
  };

  if (['finish', 'stop'].includes(log.type)) {
    copyLog.name = t(`log.types.${log.type}`);
  } else {
    copyLog.name = getTranslatation(
      `workflow.blocks.${log.name}.name`,
      blocks[log.name].name
    );
  }

  if (copyLog.message && messageHasReferences.includes(copyLog.message)) {
    copyLog.messageId = `${copyLog.message}`;
  }

  copyLog.message = getTranslatation(
    { path: `log.messages.${log.message}`, params: log },
    log.message
  );

  return copyLog;
}
function setActiveLog(item) {
  if (props.compareMode) {
    activeAlignedEntry.value = item;
    const entry = item.a || item.b;
    state.itemId = entry.id;
    activeLog.value = entry;
    state.activeCompareRun = item.a ? 'a' : 'b';
  } else {
    state.itemId = item.id;
    activeLog.value = item;
  }
}
function getBlockPath(blockId) {
  const { workflowId, teamId } = props.currentLog;
  let path = `/workflows/${workflowId}`;

  if (workflowId.startsWith('team') && teamId) {
    path = `/teams/${teamId}/workflows/${workflowId}`;
  }

  return `${path}?blockId=${blockId}`;
}
function jumpToError() {
  if (props.compareMode) {
    const idx = filteredAligned.value.findIndex(
      (e) => e.a?.type === 'error' || e.b?.type === 'error'
    );
    if (idx === -1) return;
    pagination.currentPage = Math.ceil((idx + 1) / pagination.perPage);
  } else {
    pagination.currentPage = Math.ceil(
      errorBlock.value.id / pagination.perPage
    );
  }

  const element = document.querySelector('#log-history');
  if (!element) return;

  element.scrollTo(0, element.scrollHeight);
  document.documentElement.scrollTo(0, document.documentElement.scrollHeight);
}

watch(
  () => state.activeCompareRun,
  (run) => {
    if (!props.compareMode || !activeAlignedEntry.value) return;
    const entry =
      run === 'a' ? activeAlignedEntry.value.a : activeAlignedEntry.value.b;
    if (entry) {
      state.itemId = entry.id;
      activeLog.value = entry;
    }
  }
);
</script>
<style>
.ctx-data-table {
  thead td {
    padding: 0;
  }
  td {
    @apply p-1;
  }
  tr {
    vertical-align: baseline;
  }
}
.log-data-prev .cm-editor {
  background-color: transparent;
  .cm-activeLine.cm-line {
    background-color: rgb(255 255 255 / 0.05) !important;
  }
  .cm-gutters,
  .cm-activeLineGutter,
  .cm-gutterElement {
    background-color: transparent !important;
  }
}
</style>
