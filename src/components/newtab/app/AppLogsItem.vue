<template>
  <div v-if="currentLog.id">
    <div class="flex items-center">
      <button
        v-tooltip:bottom="t('workflow.blocks.go-back.name')"
        role="button"
        class="bg-input mr-2 h-12 rounded-lg px-1 text-gray-600 transition dark:text-gray-300"
        @click="$emit('close')"
      >
        <v-remixicon name="riArrowLeftSLine" />
      </button>
      <div>
        <h1 class="text-overflow max-w-md text-2xl font-semibold">
          {{ currentLog.name }}
        </h1>
        <p class="text-gray-600 dark:text-gray-200">
          {{
            t(`log.description.text`, {
              status: t(
                `log.description.status.${currentLog.status || 'success'}`
              ),
              date: dayjs(currentLog.startedAt).format('DD MMM'),
              duration: countDuration(currentLog.startedAt, currentLog.endedAt),
            })
          }}
        </p>
      </div>
      <div class="grow"></div>
      <ui-button
        v-if="state.workflowExists"
        v-tooltip="t('log.goWorkflow')"
        icon
        class="mr-4"
        @click="goToWorkflow"
      >
        <v-remixicon name="riExternalLinkLine" />
      </ui-button>
      <ui-button
        v-tooltip="t('log.compare.title')"
        icon
        :class="{ 'text-primary': compareMode }"
        class="mr-4"
        @click="toggleCompare"
      >
        <v-remixicon name="riArrowLeftRightLine" />
      </ui-button>
      <ui-button class="text-red-500 dark:text-red-400" @click="deleteLog">
        {{ t('common.delete') }}
      </ui-button>
    </div>
    <div
      v-if="compareMode"
      class="mt-2 flex items-center rounded-lg bg-gray-100 p-2 dark:bg-gray-800"
    >
      <v-remixicon
        name="riArrowLeftRightLine"
        size="18"
        class="mr-2 shrink-0 text-gray-400"
      />
      <span class="shrink-0 text-sm text-gray-600 dark:text-gray-300">
        {{ t('log.compare.selectRun') }}
      </span>
      <ui-select v-model="compareLogId" class="ml-3 flex-1">
        <option value="" disabled>
          {{ t('log.compare.selectRun') }}
        </option>
        <option
          v-for="log in sameWorkflowLogs"
          :key="log.id"
          :value="log.id"
        >
          {{ dayjs(log.startedAt).format('DD MMM, HH:mm') }} —
          {{ t(`log.description.status.${log.status || 'success'}`) }}
        </option>
      </ui-select>
      <ui-button v-if="compareLogId" icon class="ml-2" @click="exitCompare">
        <v-remixicon name="riCloseLine" size="18" />
      </ui-button>
    </div>
    <ui-tabs v-model="state.activeTab" class="mt-4" @change="onTabChange">
      <ui-tab v-for="tab in tabs" :key="tab.id" class="mr-4" :value="tab.id">
        {{ tab.name }}
      </ui-tab>
    </ui-tabs>
    <ui-tab-panels
      :model-value="state.activeTab"
      class="scroll mt-4 overflow-auto px-2 pb-4"
      style="min-height: 500px; max-height: calc(100vh - 15rem)"
    >
      <ui-tab-panel value="logs">
        <logs-history
          :current-log="currentLog"
          :ctx-data="ctxData"
          :parent-log="parentLog"
          :compare-mode="compareMode && !!compareLog"
          :compare-log="compareLog"
          :compare-ctx-data="compareCtxData"
        />
      </ui-tab-panel>
      <ui-tab-panel value="table">
        <logs-table :current-log="currentLog" :table-data="tableData" />
      </ui-tab-panel>
      <ui-tab-panel value="variables">
        <logs-variables :current-log="currentLog" />
      </ui-tab-panel>
    </ui-tab-panels>
  </div>
</template>
<script setup>
import { shallowReactive, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import dbLogs from '@/db/logs';
import dayjs from '@/lib/dayjs';
import { useWorkflowStore } from '@/stores/workflow';
import { countDuration, convertArrObjTo2DArr } from '@/utils/helper';
import LogsTable from '@/components/newtab/logs/LogsTable.vue';
import LogsHistory from '@/components/newtab/logs/LogsHistory.vue';
import LogsVariables from '@/components/newtab/logs/LogsVariables.vue';

const props = defineProps({
  logId: {
    type: String,
    default: '',
  },
});
const emit = defineEmits(['close']);

const { t } = useI18n();
const router = useRouter();
const workflowStore = useWorkflowStore();

const ctxData = shallowRef({});
const parentLog = shallowRef(null);
const compareMode = shallowRef(false);
const compareLogId = shallowRef('');
const compareLog = shallowRef(null);
const compareCtxData = shallowRef({});
const sameWorkflowLogs = shallowRef([]);

const tabs = [
  { id: 'logs', name: t('common.log', 2) },
  { id: 'table', name: t('workflow.table.title') },
  { id: 'variables', name: t('workflow.variables.title', 2) },
];

const state = shallowReactive({
  activeTab: 'logs',
  workflowExists: false,
});
const tableData = shallowReactive({
  converted: false,
  body: [],
  header: [],
});
const currentLog = shallowRef({
  history: [],
  data: {
    table: [],
    variables: {},
  },
});

function deleteLog() {
  dbLogs.items
    .where('id')
    .equals(props.logId)
    .delete()
    .then(() => {
      emit('close');
    });
}
function goToWorkflow() {
  const path = `/workflows/${currentLog.value.workflowId}`;

  router.push(path);
  emit('close', true);
}
function convertToTableData() {
  const data = currentLog.value.data?.table;
  if (!data) return;

  const [header] = convertArrObjTo2DArr(data);

  tableData.converted = true;
  tableData.body = data.map((item, index) => ({ ...item, id: index + 1 }));
  tableData.header = header.map((name) => ({
    text: name,
    value: name,
    filterable: true,
  }));
  tableData.header.unshift({ value: 'id', text: '', sortable: false });
}
function onTabChange(value) {
  if (value === 'table' && !tableData.converted) {
    convertToTableData();
  }
}
async function fetchLog() {
  if (!props.logId) return;

  const logDetail = await dbLogs.items.where('id').equals(props.logId).last();
  if (!logDetail) return;

  tableData.body = [];
  tableData.header = [];
  parentLog.value = null;
  tableData.converted = false;

  const [logCtxData, logHistory, logsData] = await Promise.all(
    ['ctxData', 'histories', 'logsData'].map((key) =>
      dbLogs[key].where('logId').equals(props.logId).last()
    )
  );

  ctxData.value = logCtxData?.data || {};
  currentLog.value = {
    history: logHistory?.data || [],
    data: logsData?.data || {},
    ...logDetail,
  };

  state.workflowExists = Boolean(workflowStore.getById(logDetail.workflowId));

  const parentLogId = logDetail.collectionLogId || logDetail.parentLog?.id;
  if (parentLogId) {
    parentLog.value =
      (await dbLogs.items.where('id').equals(parentLogId).last()) || null;
  }
}
async function toggleCompare() {
  compareMode.value = !compareMode.value;
  if (compareMode.value) {
    const logs = await dbLogs.items
      .where('workflowId')
      .equals(currentLog.value.workflowId)
      .toArray();
    sameWorkflowLogs.value = logs
      .filter((l) => l.id !== props.logId)
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  } else {
    exitCompare();
  }
}
function exitCompare() {
  compareMode.value = false;
  compareLogId.value = '';
  compareLog.value = null;
  compareCtxData.value = {};
  sameWorkflowLogs.value = [];
}
async function fetchCompareLog() {
  const id = compareLogId.value;
  if (!id) {
    compareLog.value = null;
    compareCtxData.value = {};
    return;
  }
  const logDetail = await dbLogs.items.where('id').equals(id).last();
  if (!logDetail) return;

  const [logCtxData, logHistory] = await Promise.all([
    dbLogs.ctxData.where('logId').equals(id).last(),
    dbLogs.histories.where('logId').equals(id).last(),
  ]);

  compareCtxData.value = logCtxData?.data || {};
  compareLog.value = {
    history: logHistory?.data || [],
    ...logDetail,
  };
}

watch(() => props.logId, fetchLog, { immediate: true });
watch(compareLogId, fetchCompareLog);
</script>
<style>
.logs-details .cm-editor {
  max-height: calc(100vh - 15rem);
}
</style>
