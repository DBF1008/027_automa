<template>
  <ui-modal :model-value="modelValue" persist custom-content>
    <ui-card
      padding="p-0"
      :class="[
        'flex w-full flex-col',
        step === 'preview' ? 'max-w-4xl' : 'max-w-xl',
      ]"
      style="height: 600px"
    >
      <!-- Header with step indicator -->
      <div class="flex items-center p-4">
        <p class="font-semibold">
          {{ title || t('storage.table.add') }}
        </p>
        <template v-if="hasExistingData">
          <span class="mx-3 text-gray-400 dark:text-gray-500">|</span>
          <span
            :class="[
              'text-xs font-medium',
              step === 'edit'
                ? 'text-primary dark:text-blue-400'
                : 'text-gray-400 dark:text-gray-500',
            ]"
          >
            1. Edit Schema
          </span>
          <span class="mx-1 text-gray-400 dark:text-gray-500">→</span>
          <span
            :class="[
              'text-xs font-medium',
              step === 'preview'
                ? 'text-primary dark:text-blue-400'
                : 'text-gray-400 dark:text-gray-500',
            ]"
          >
            2. Review & Apply
          </span>
        </template>
      </div>

      <!-- Step 1: Edit Schema -->
      <template v-if="step === 'edit'">
        <div class="scroll flex-1 overflow-auto px-4 pb-4">
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
        <div class="p-4 text-right">
          <ui-button class="mr-4" @click="clearTempTables(true)">
            {{ t('common.cancel') }}
          </ui-button>
          <ui-button
            v-if="hasExistingData && hasMeaningfulChanges"
            :disabled="!state.name || state.columns.length === 0"
            variant="accent"
            @click="goToPreview"
          >
            Next →
          </ui-button>
          <ui-button
            v-else
            :disabled="!state.name || state.columns.length === 0"
            variant="accent"
            @click="saveTable"
          >
            {{ t('common.save') }}
          </ui-button>
        </div>
      </template>

      <!-- Step 2: Preview & Confirm -->
      <template v-if="step === 'preview'">
        <storage-migration-preview
          :changes="changes"
          :edited-columns="state.columns"
          :table-data="tableData"
          class="flex-1 overflow-auto"
          @back="goBackToEdit"
          @confirm="confirmMigration"
        />
      </template>
    </ui-card>
  </ui-modal>
</template>
<script setup>
import { computed, reactive, ref, toRaw, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { nanoid } from 'nanoid';
import draggable from 'vuedraggable';
import cloneDeep from 'lodash.clonedeep';
import { dataTypes } from '@/utils/constants/table';
import StorageMigrationPreview from './StorageMigrationPreview.vue';

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
  tableData: {
    type: Object,
    default: null,
  },
});
const emit = defineEmits(['update:modelValue', 'save']);

const { t } = useI18n();

const step = ref('edit'); // 'edit' | 'preview'
const changes = reactive({});
let originalTypes = {}; // { [columnId]: originalType }
let originalNames = {}; // { [columnId]: originalName }

const state = reactive({
  name: '',
  columns: [],
});

const hasExistingData = computed(() => {
  return props.tableData?.items?.length > 0;
});

const hasMeaningfulChanges = computed(() => {
  return Object.keys(changes).length > 0;
});

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
  const column = state.columns[index];
  column.type = newType;

  const originalType = originalTypes[column.id];

  // If this column was newly added (no original type), skip tracking
  if (!originalType) return;

  // If type changed back to original, remove the typeChanged entry
  if (newType === originalType) {
    const typeKey = `${column.id}__type`;
    if (changes[typeKey]?.type === 'typeChanged') {
      delete changes[typeKey];
    }
    if (changes[column.id]?.type === 'typeChanged') {
      delete changes[column.id];
    }
    return;
  }

  // Use the ORIGINAL column name (as it exists in current row data)
  // so type conversion can look up values correctly before rename is applied
  const dataName = originalNames[column.id] || column.name;

  // Track the type change (preserve other change types like rename)
  const existingChange = changes[column.id];
  if (existingChange && existingChange.type === 'rename') {
    // Column was renamed AND type changed — store type change separately
    // Use a compound key to avoid collision
    const typeKey = `${column.id}__type`;
    changes[typeKey] = {
      type: 'typeChanged',
      id: column.id,
      name: dataName,
      oldType: originalType,
      newType,
    };
  } else {
    changes[column.id] = {
      type: 'typeChanged',
      id: column.id,
      name: dataName,
      oldType: originalType,
      newType,
    };
  }
}

function saveTable() {
  const rawState = {
    ...toRaw(state),
    columns: state.columns.map(toRaw),
  };

  emit('save', { ...rawState, changes });
}

function goToPreview() {
  step.value = 'preview';
}

function goBackToEdit() {
  step.value = 'edit';
}

function confirmMigration(migrationPlan) {
  const rawState = {
    ...toRaw(state),
    columns: state.columns.map(toRaw),
  };

  emit('save', {
    ...rawState,
    changes,
    migrationPlan,
  });
}

function addColumn() {
  const columnId = nanoid(5);
  const columnName = `column_${columnId}`;

  changes[columnId] = {
    type: 'add',
    id: columnId,
    name: columnName,
    columnType: 'string',
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
  // Clear all keys from the reactive changes object
  Object.keys(changes).forEach((key) => delete changes[key]);
  originalTypes = {};
  originalNames = {};
  step.value = 'edit';

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
      const clonedColumns = cloneDeep(props.columns);

      Object.assign(state, {
        name: `${props.name}`,
        columns: clonedColumns,
      });

      // Record original types and names for change detection
      originalTypes = {};
      originalNames = {};
      clonedColumns.forEach((col) => {
        originalTypes[col.id] = col.type;
        originalNames[col.id] = col.name;
      });
    } else {
      clearTempTables();
    }
  }
);
</script>
