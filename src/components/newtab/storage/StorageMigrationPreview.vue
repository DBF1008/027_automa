<template>
  <div class="flex h-full flex-col">
    <!-- Summary Banner -->
    <div
      class="mx-4 mb-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
    >
      <p class="text-sm font-medium">
        {{ preview.totalRows }} rows total,
        {{ preview.affectedRowCount }} will be affected
      </p>
      <p
        v-if="preview.failedConversionCount > 0"
        class="mt-1 text-sm text-red-500 dark:text-red-400"
      >
        <v-remixicon name="riErrorWarningLine" class="mr-1 -mt-0.5 inline" size="16" />
        {{ preview.failedConversionCount }} cells cannot be converted to the new
        type
      </p>
      <p
        v-if="preview.rowsToDelete.length > 0"
        class="mt-1 text-sm text-orange-500 dark:text-orange-400"
      >
        <v-remixicon name="riDeleteBin7Line" class="mr-1 -mt-0.5 inline" size="16" />
        {{ preview.rowsToDelete.length }} rows will be deleted due to conversion
        failures
      </p>
    </div>

    <!-- Per-Change Sections -->
    <div class="scroll flex-1 overflow-auto px-4 pb-4">
      <div
        v-for="op in preview.operations"
        :key="op.columnId || op.columnName"
        class="mb-4 rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <!-- Rename -->
        <template v-if="op.type === 'rename'">
          <div class="flex items-center p-3">
            <v-remixicon name="riEditLine" class="mr-2 text-blue-500" size="20" />
            <div>
              <p class="text-sm font-medium">
                Rename column
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                "{{ op.oldName }}" → "{{ op.newName }}"
                <span class="ml-1 text-xs">({{ op.affectedRows }} rows updated)</span>
              </p>
            </div>
          </div>
        </template>

        <!-- Delete -->
        <template v-if="op.type === 'delete'">
          <div class="p-3">
            <div class="flex items-center">
              <v-remixicon
                name="riDeleteBin7Line"
                class="mr-2 text-red-500"
                size="20"
              />
              <div>
                <p class="text-sm font-medium">
                  Delete column "{{ op.columnName }}"
                </p>
                <p class="text-sm text-orange-500 dark:text-orange-400">
                  {{ op.nonEmptyCount }} non-empty cells will be permanently
                  deleted
                </p>
              </div>
            </div>
            <div
              v-if="op.sampleValues.length > 0"
              class="mt-2 flex flex-wrap gap-1"
            >
              <span
                v-for="(sample, idx) in op.sampleValues"
                :key="idx"
                class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              >
                {{ sample }}
              </span>
            </div>
          </div>
        </template>

        <!-- Type Changed -->
        <template v-if="op.type === 'typeChanged'">
          <div class="p-3">
            <div class="flex items-center">
              <v-remixicon
                name="riRefreshLine"
                class="mr-2 text-amber-500"
                size="20"
              />
              <div class="flex-1">
                <p class="text-sm font-medium">
                  Type change: "{{ op.columnName }}"
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ getTypeName(op.oldType) }} → {{ getTypeName(op.newType) }}
                  <span class="ml-1 text-xs">
                    ({{ op.totalSuccesses }} ok,
                    {{ op.totalFailures }} failed)
                  </span>
                </p>
              </div>
            </div>

            <!-- Fallback strategy selector (only when there are failures) -->
            <div v-if="op.totalFailures > 0" class="mt-3">
              <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                When conversion fails:
              </label>
              <div class="flex items-center gap-2">
                <ui-select
                  :model-value="getFallbackStrategy(op.columnId)"
                  class="w-48"
                  @change="handleFallbackChange(op.columnId, $event)"
                >
                  <option value="null">Set to empty/null</option>
                  <option value="keepOriginal">Keep original value</option>
                  <option value="custom">Use custom default</option>
                  <option value="deleteRow">Delete entire row</option>
                </ui-select>
                <ui-input
                  v-if="getFallbackStrategy(op.columnId) === 'custom'"
                  :model-value="getFallbackValue(op.columnId)"
                  placeholder="Default value..."
                  class="w-40"
                  @change="handleCustomValueChange(op.columnId, $event)"
                />
              </div>
            </div>

            <!-- Preview table -->
            <div
              v-if="op.successes.length > 0 || op.failures.length > 0"
              class="mt-3 overflow-hidden rounded border border-gray-200 dark:border-gray-600"
            >
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th class="px-3 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400">
                      Row
                    </th>
                    <th class="px-3 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400">
                      Original
                    </th>
                    <th class="px-3 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400">
                      New
                    </th>
                    <th class="px-3 py-1.5 text-center font-medium text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                  <tr
                    v-for="row in [...op.successes.slice(0, 10), ...op.failures.slice(0, 10)]"
                    :key="row.rowIndex"
                    :class="row.ok ? '' : 'bg-red-50/50 dark:bg-red-900/10'"
                  >
                    <td class="px-3 py-1 text-gray-400">
                      {{ row.rowIndex + 1 }}
                    </td>
                    <td class="max-w-[150px] truncate px-3 py-1 font-mono text-xs">
                      {{ row.oldValue }}
                    </td>
                    <td class="max-w-[150px] truncate px-3 py-1 font-mono text-xs">
                      {{ row.newValue }}
                    </td>
                    <td class="px-3 py-1 text-center">
                      <span
                        v-if="row.ok"
                        class="text-green-500"
                      >✓</span>
                      <span
                        v-else
                        v-tooltip="row.error || 'Conversion failed'"
                        class="text-red-500"
                      >
                        ✗
                        <span
                          v-if="row.action"
                          class="ml-0.5 text-xs text-gray-400"
                        >
                          → {{ getActionLabel(row.action) }}
                        </span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p
                v-if="op.isLargeTable"
                class="border-t border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-400 dark:border-gray-600 dark:bg-gray-800"
              >
                Showing first 20 rows of {{ op.totalSuccesses + op.totalFailures }}
              </p>
            </div>
          </div>
        </template>

        <!-- Add -->
        <template v-if="op.type === 'add'">
          <div class="flex items-center p-3">
            <v-remixicon name="riAddLine" class="mr-2 text-green-500" size="20" />
            <div>
              <p class="text-sm font-medium">
                New column: "{{ op.columnName }}"
              </p>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Type: {{ getTypeName(op.columnType) }}
                <span v-if="op.affectedRows > 0" class="ml-1 text-xs">
                  ({{ op.affectedRows }} existing rows — no data backfill)
                </span>
              </p>
            </div>
          </div>
        </template>
      </div>

      <p
        v-if="preview.operations.length === 0"
        class="py-8 text-center text-sm text-gray-400"
      >
        No schema changes detected
      </p>
    </div>

    <!-- Footer Actions -->
    <div class="border-t border-gray-200 p-4 text-right dark:border-gray-700">
      <ui-button class="mr-4" @click="$emit('back')">
        ← Back to Edit
      </ui-button>
      <ui-button
        :disabled="hasUnresolvedFailures"
        variant="accent"
        @click="handleConfirm"
      >
        Apply Changes
      </ui-button>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import { useTableMigration } from '@/composable/useTableMigration';
import { dataTypes } from '@/utils/constants/table';

const props = defineProps({
  changes: {
    type: Object,
    required: true,
  },
  editedColumns: {
    type: Array,
    required: true,
  },
  tableData: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['back', 'confirm']);

// We need currentColumns for the composable — derive from tableData or editedColumns
// The currentColumns are the original ones, available via tableData.columnsIndex
// But for the preview computation we mainly need the changes + rows
const currentColumns = computed(() => {
  // We don't actually use currentColumns in computeMigrationPreview beyond type info
  // The changes object already carries oldType/newType for typeChanged
  return [];
});

const tableDataRef = computed(() => props.tableData);

const { preview, fallbacks, hasUnresolvedFailures, buildMigrationPlan, setFallback } =
  useTableMigration({
    currentColumns,
    changes: props.changes,
    tableData: tableDataRef,
  });

const typeNameMap = Object.fromEntries(dataTypes.map((t) => [t.id, t.name]));

function getTypeName(typeId) {
  return typeNameMap[typeId] || typeId;
}

function getFallbackStrategy(columnId) {
  return fallbacks[columnId]?.strategy || 'null';
}

function getFallbackValue(columnId) {
  return fallbacks[columnId]?.value ?? '';
}

function handleFallbackChange(columnId, strategy) {
  setFallback(columnId, strategy);
}

function handleCustomValueChange(columnId, value) {
  setFallback(columnId, 'custom', value);
}

function getActionLabel(action) {
  switch (action) {
    case 'deleteRow':
      return 'delete row';
    case 'keep':
      return 'keep';
    case 'custom':
      return 'custom';
    case 'null':
    default:
      return 'null';
  }
}

function handleConfirm() {
  const plan = buildMigrationPlan(props.editedColumns, '');
  emit('confirm', plan);
}
</script>
