<template>
  <ui-modal :model-value="modelValue" persist custom-content>
    <ui-card
      padding="p-0"
      class="flex w-full flex-col"
      :class="state.phase === 'preview' ? 'max-w-2xl' : 'max-w-xl'"
      style="height: 600px"
    >
      <p class="p-4 font-semibold">
        {{
          state.phase === 'preview'
            ? t('storage.table.migration.title')
            : title || t('storage.table.add')
        }}
      </p>

      <!-- Edit Phase -->
      <div v-if="state.phase === 'edit'" class="scroll flex-1 overflow-auto px-4 pb-4">
        <ui-input
          v-model="state.name"
          class="-mt-1 w-full"
          label="Table name"
          placeholder="My table"
        />
        <div class="mt-4 flex items-center">
          <p class="flex-1">Columns</p>
          <ui-button icon :title="t('common.add')" @click="addColumn">
            <v-remixicon name="riAddLine" />
          </ui-button>
        </div>
        <p
          v-if="state.columns && state.columns.length === 0"
          class="my-4 text-center text-gray-600 dark:text-gray-300"
        >
          {{ t('message.noData') }}
        </p>
        <draggable
          v-model="state.columns"
          tag="ul"
          handle=".handle"
          item-key="id"
          class="mt-4 space-y-2"
        >
          <template #item="{ element: column, index }">
            <li class="flex items-center space-x-2">
              <span class="handle cursor-move">
                <v-remixicon name="mdiDrag" />
              </span>
              <ui-input
                :model-value="column.name"
                :placeholder="t('workflow.table.column.name')"
                class="flex-1"
                @blur="updateColumnName(index, $event.target)"
              />
              <ui-select
                :model-value="column.type"
                class="flex-1"
                :placeholder="t('workflow.table.column.type')"
                @change="updateColumnType(index, $event)"
              >
                <option
                  v-for="type in dataTypes"
                  :key="type.id"
                  :value="type.id"
                >
                  {{ type.name }}
                </option>
              </ui-select>
              <button @click="deleteColumn(index)">
                <v-remixicon name="riDeleteBin7Line" />
              </button>
            </li>
          </template>
        </draggable>
      </div>

      <!-- Preview Phase -->
      <div v-else class="scroll flex-1 overflow-auto px-4 pb-4">
        <p
          v-if="!state.migrationReport?.hasChanges"
          class="my-4 text-center text-gray-600 dark:text-gray-300"
        >
          {{ t('storage.table.migration.noChanges') }}
        </p>
        <template v-else>
          <!-- Added columns -->
          <div v-if="state.migrationReport.added.length > 0" class="mb-4">
            <p class="mb-2 text-sm font-semibold text-green-600 dark:text-green-400">
              {{ t('storage.table.migration.added') }}
              ({{ state.migrationReport.added.length }})
            </p>
            <ul class="space-y-1">
              <li
                v-for="col in state.migrationReport.added"
                :key="col.id"
                class="flex items-center rounded-md bg-green-50 px-3 py-2 text-sm dark:bg-green-900/20"
              >
                <span class="font-medium">{{ col.name }}</span>
                <span class="ml-2 text-gray-500 dark:text-gray-400">
                  ({{ typeName(col.type) }})
                </span>
              </li>
            </ul>
          </div>

          <!-- Renamed columns -->
          <div v-if="state.migrationReport.renamed.length > 0" class="mb-4">
            <p class="mb-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
              {{ t('storage.table.migration.renamed') }}
              ({{ state.migrationReport.renamed.length }})
            </p>
            <ul class="space-y-1">
              <li
                v-for="col in state.migrationReport.renamed"
                :key="col.id"
                class="flex items-center rounded-md bg-blue-50 px-3 py-2 text-sm dark:bg-blue-900/20"
              >
                <span class="line-through">{{ col.oldName }}</span>
                <v-remixicon name="riArrowRightLine" size="16" class="mx-2" />
                <span class="font-medium">{{ col.newName }}</span>
                <span class="ml-auto text-gray-500 dark:text-gray-400">
                  {{ t('storage.table.migration.rowsAffected', { count: col.affectedRows }) }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Deleted columns -->
          <div v-if="state.migrationReport.deleted.length > 0" class="mb-4">
            <p class="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
              {{ t('storage.table.migration.deleted') }}
              ({{ state.migrationReport.deleted.length }})
            </p>
            <ul class="space-y-1">
              <li
                v-for="col in state.migrationReport.deleted"
                :key="col.id"
                class="flex items-center rounded-md bg-red-50 px-3 py-2 text-sm dark:bg-red-900/20"
              >
                <span class="font-medium">{{ col.name }}</span>
                <span
                  v-if="col.nonNullCount > 0"
                  class="ml-auto text-red-600 dark:text-red-400"
                >
                  {{ t('storage.table.migration.valuesLost', { count: col.nonNullCount }) }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Type changes -->
          <div v-if="state.migrationReport.typeChanged.length > 0" class="mb-4">
            <p class="mb-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
              {{ t('storage.table.migration.typeChanges') }}
              ({{ state.migrationReport.typeChanged.length }})
            </p>
            <div
              v-for="change in state.migrationReport.typeChanged"
              :key="change.id"
              class="mb-3 rounded-lg border border-amber-200 p-3 dark:border-amber-800"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center">
                  <span class="font-medium">{{ change.name }}</span>
                  <span class="mx-2 text-gray-400">:</span>
                  <span class="text-gray-500">{{ typeName(change.fromType) }}</span>
                  <v-remixicon name="riArrowRightLine" size="16" class="mx-1" />
                  <span class="font-medium">{{ typeName(change.toType) }}</span>
                </div>
              </div>
              <div class="mt-1 flex gap-4 text-sm">
                <span class="text-green-600 dark:text-green-400">
                  {{ t('storage.table.migration.convertible', { count: change.successCount }) }}
                </span>
                <span
                  v-if="change.failureCount > 0"
                  class="text-red-600 dark:text-red-400"
                >
                  {{ t('storage.table.migration.willFail', { count: change.failureCount }) }}
                </span>
              </div>

              <!-- Sample failures -->
              <ui-expand
                v-if="change.sampleFailures.length > 0"
                :model-value="false"
                header-class="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400"
              >
                <template #header>
                  {{ t('storage.table.migration.sampleFailures') }}
                </template>
                <ul class="mt-1 space-y-1 pl-4">
                  <li
                    v-for="(sample, si) in change.sampleFailures"
                    :key="si"
                    class="text-sm text-red-500"
                  >
                    <code class="rounded bg-gray-100 px-1 dark:bg-gray-700">{{
                      formatSample(sample.value)
                    }}</code>
                    <span class="ml-1 text-gray-500">{{ sample.error }}</span>
                  </li>
                </ul>
              </ui-expand>

              <!-- Fallback strategy -->
              <div v-if="change.failureCount > 0" class="mt-2 flex items-center gap-2">
                <span class="text-sm text-gray-600 dark:text-gray-300">
                  {{ t('storage.table.migration.onFailure') }}
                </span>
                <ui-select
                  :model-value="state.fallbackStrategies[change.id]?.strategy || 'null'"
                  class="flex-1"
                  @change="updateFallback(change.id, 'strategy', $event)"
                >
                  <option value="null">{{ t('storage.table.migration.setNull') }}</option>
                  <option value="keep">{{ t('storage.table.migration.keepOriginal') }}</option>
                  <option value="default">{{ t('storage.table.migration.setDefault') }}</option>
                </ui-select>
                <ui-input
                  v-if="state.fallbackStrategies[change.id]?.strategy === 'default'"
                  :model-value="state.fallbackStrategies[change.id]?.defaultValue || ''"
                  placeholder="Default value"
                  class="flex-1"
                  @change="updateFallback(change.id, 'defaultValue', $event)"
                />
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="p-4 text-right">
        <template v-if="state.phase === 'edit'">
          <ui-button class="mr-4" @click="clearTempTables(true)">
            {{ t('common.cancel') }}
          </ui-button>
          <ui-button
            :disabled="!state.name || state.columns.length === 0"
            variant="accent"
            @click="saveTable"
          >
            {{ t('common.save') }}
          </ui-button>
        </template>
        <template v-else>
          <ui-button class="mr-4" @click="goBackToEdit">
            {{ t('storage.table.migration.back') }}
          </ui-button>
          <ui-button variant="accent" @click="confirmSave">
            {{ t('storage.table.migration.confirm') }}
          </ui-button>
        </template>
      </div>
    </ui-card>
  </ui-modal>
</template>
<script setup>
import { reactive, toRaw, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { nanoid } from 'nanoid';
import draggable from 'vuedraggable';
import cloneDeep from 'lodash.clonedeep';
import { dataTypes } from '@/utils/constants/table';
import { analyzeMigration } from '@/utils/tableMigration';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  name: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  columns: {
    type: Array,
    default: () => [],
  },
  items: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(['update:modelValue', 'save']);

const { t } = useI18n();

const typeNameMap = {};
dataTypes.forEach((dt) => {
  typeNameMap[dt.id] = dt.name;
});

let changes = {};
const state = reactive({
  name: '',
  columns: [],
  phase: 'edit',
  migrationReport: null,
  fallbackStrategies: {},
});

function typeName(typeId) {
  return typeNameMap[typeId] || typeId;
}

function formatSample(value) {
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getColumnName(name) {
  const columnName = name.replace(/[\s@[\]]/g, '');
  const isColumnExists = state.columns.some(
    (column) => column.name === columnName
  );

  if (isColumnExists || columnName.trim() === '') return '';

  return columnName;
}
function updateColumnName(index, target) {
  const columnName = getColumnName(target.value);
  const { id, name } = state.columns[index];
  if (!columnName) {
    target.value = name;
    return;
  }

  changes[id] = { type: 'rename', id, oldValue: name, newValue: columnName };
  state.columns[index].name = columnName;
}
function updateColumnType(index, newType) {
  state.columns[index].type = newType;
}
function updateFallback(columnId, key, value) {
  if (!state.fallbackStrategies[columnId]) {
    state.fallbackStrategies[columnId] = { strategy: 'null' };
  }
  state.fallbackStrategies[columnId][key] = value;
}
function saveTable() {
  const report = analyzeMigration(
    props.columns,
    state.columns,
    changes,
    props.items
  );

  if (!report.hasChanges || props.items.length === 0) {
    confirmSave();
    return;
  }

  state.migrationReport = report;
  state.fallbackStrategies = {};
  report.typeChanged.forEach(({ id }) => {
    state.fallbackStrategies[id] = { strategy: 'null' };
  });
  state.phase = 'preview';
}
function confirmSave() {
  const rawState = {
    ...toRaw(state),
    columns: state.columns.map(toRaw),
  };

  emit('save', {
    ...rawState,
    changes,
    fallbackStrategies: toRaw(state.fallbackStrategies),
    migrationReport: toRaw(state.migrationReport),
  });
}
function goBackToEdit() {
  state.phase = 'edit';
}
function addColumn() {
  const columnId = nanoid(5);
  const columnName = `column_${columnId}`;

  changes[columnId] = {
    type: 'add',
    id: columnId,
    name: columnName,
  };

  state.columns.push({
    id: columnId,
    type: 'string',
    name: columnName,
  });
}
function clearTempTables(close = false) {
  state.name = '';
  state.columns = [];
  state.phase = 'edit';
  state.migrationReport = null;
  state.fallbackStrategies = {};
  changes = {};

  if (close) {
    emit('update:modelValue', false);
  }
}
function deleteColumn(index) {
  const column = state.columns[index];
  changes[column.id] = { type: 'delete', id: column.id, name: column.name };

  state.columns.splice(index, 1);
}

watch(
  () => props.modelValue,
  () => {
    if (props.modelValue) {
      Object.assign(state, {
        name: `${props.name}`,
        columns: cloneDeep(props.columns),
        phase: 'edit',
        migrationReport: null,
        fallbackStrategies: {},
      });
    } else {
      clearTempTables();
    }
  }
);
</script>
