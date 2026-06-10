import { computed, reactive } from 'vue';
import {
  computeMigrationPreview,
  safeConvertData,
  applyFallback,
  getDefaultForType,
} from '@/utils/tableMigration';

/**
 * Composable for computing migration preview and building the migration plan.
 *
 * @param {Object} options
 * @param {import('vue').Ref<Object[]>} options.currentColumns - Original column defs
 * @param {Object} options.changes - Structured changes from StorageEditTable
 * @param {import('vue').Ref<Object|null>} options.tableData - Current tablesData record
 * @returns {{ preview, fallbacks, hasUnresolvedFailures, buildMigrationPlan }}
 */
export function useTableMigration({ currentColumns, changes, tableData }) {
  const fallbacks = reactive({});

  const preview = computed(() => {
    const rows = tableData?.value?.items || [];
    return computeMigrationPreview({
      currentColumns: currentColumns?.value || [],
      changes: changes,
      rows,
      fallbacks,
    });
  });

  const hasUnresolvedFailures = computed(() => {
    if (preview.value.failedConversionCount === 0) return false;

    // Check each typeChanged operation with failures
    for (const op of preview.value.operations) {
      if (op.type === 'typeChanged' && op.failures.length > 0) {
        const fb = fallbacks[op.columnId];
        if (!fb || !fb.strategy) {
          return true;
        }
      }
    }
    return false;
  });

  /**
   * Build the serializable migration plan that Tables.vue will execute.
   *
   * @param {Array} editedColumns - The new column definitions from the editor
   * @param {string} tableName - The new table name
   * @returns {Object} migrationPlan
   */
  function buildMigrationPlan(editedColumns, tableName) {
    const rows = tableData?.value?.items || [];

    return {
      tableName,
      editedColumns: editedColumns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      })),
      changes: { ...changes },
      fallbacks: { ...fallbacks },
      rowsToDelete: preview.value.rowsToDelete,
    };
  }

  /**
   * Set a fallback strategy for a column.
   *
   * @param {string} columnId
   * @param {string} strategy - 'null' | 'keepOriginal' | 'custom' | 'deleteRow'
   * @param {*} [customValue] - Required when strategy is 'custom'
   */
  function setFallback(columnId, strategy, customValue) {
    fallbacks[columnId] = {
      strategy,
      value: customValue !== undefined ? customValue : null,
    };
  }

  /**
   * Clear fallback for a column.
   *
   * @param {string} columnId
   */
  function clearFallback(columnId) {
    delete fallbacks[columnId];
  }

  return {
    preview,
    fallbacks,
    hasUnresolvedFailures,
    buildMigrationPlan,
    setFallback,
    clearFallback,
  };
}
