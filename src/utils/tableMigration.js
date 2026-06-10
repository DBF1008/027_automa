/**
 * Table schema migration helpers.
 *
 * Pure functions for safely converting cell values between column types,
 * computing migration previews, and applying fallback strategies.
 */

/**
 * Safely convert a value to a target column type.
 * Unlike convertData (workflowEngine/helper.js), this never throws and
 * returns a structured result so callers can distinguish success from failure.
 *
 * @param {*} value - The cell value to convert
 * @param {string} targetType - One of: 'any', 'string', 'integer', 'boolean', 'array'
 * @returns {{ success: boolean, value: *, error?: string }}
 */
export function safeConvertData(value, targetType) {
  if (targetType === 'any') {
    return { success: true, value };
  }

  try {
    // Handle null / undefined early
    if (value === null || value === undefined) {
      switch (targetType) {
        case 'string':
          return { success: true, value: '' };
        case 'integer':
          return { success: true, value: 0 };
        case 'boolean':
          return { success: true, value: false };
        case 'array':
          return { success: false, value: null, error: 'Cannot convert null/undefined to array' };
        default:
          return { success: false, value: null, error: `Unknown type: ${targetType}` };
      }
    }

    switch (targetType) {
      case 'string': {
        if (typeof value === 'object') {
          return { success: true, value: JSON.stringify(value) };
        }
        return { success: true, value: String(value) };
      }

      case 'integer': {
        if (typeof value === 'number') {
          if (Number.isNaN(value)) {
            return { success: false, value: null, error: 'NaN cannot be stored as integer' };
          }
          return { success: true, value: Math.trunc(value) };
        }
        // Strip non-numeric characters (keep digits, minus, dot)
        const cleaned = String(value).replace(/[^0-9.\-]/g, '');
        if (!cleaned || cleaned === '-' || cleaned === '.') {
          return {
            success: false,
            value: null,
            error: `Cannot parse "${value}" as integer`,
          };
        }
        const num = Number(cleaned);
        if (Number.isNaN(num)) {
          return {
            success: false,
            value: null,
            error: `Cannot parse "${value}" as integer`,
          };
        }
        return { success: true, value: Math.trunc(num) };
      }

      case 'boolean': {
        return { success: true, value: Boolean(value) };
      }

      case 'array': {
        if (Array.isArray(value)) {
          return { success: true, value };
        }
        if (typeof value === 'string') {
          // Try JSON parse first (handles "[1,2,3]")
          const trimmed = value.trim();
          if (trimmed.startsWith('[')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                return { success: true, value: parsed };
              }
            } catch {
              // Fall through to wrapping
            }
          }
          // Wrap single value in array
          return { success: true, value: [value] };
        }
        if (typeof value === 'object') {
          // Convert object values to array
          return { success: true, value: Object.values(value) };
        }
        // Primitives → single-element array
        return { success: true, value: [value] };
      }

      default:
        return { success: false, value: null, error: `Unknown type: ${targetType}` };
    }
  } catch (e) {
    return { success: false, value: null, error: e.message };
  }
}

/**
 * Get the sensible default value for a given column type.
 * Used to backfill newly added columns in existing rows.
 *
 * @param {string} type
 * @returns {*}
 */
export function getDefaultForType(type) {
  switch (type) {
    case 'string':
      return '';
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'any':
    default:
      return null;
  }
}

/**
 * Apply a fallback strategy to resolve a failed conversion.
 *
 * @param {{ strategy: string, value?: * } | null} fallback
 * @param {*} originalValue - The original cell value before conversion attempt
 * @returns {*} The resolved value to write into the cell
 */
export function applyFallback(fallback, originalValue) {
  if (!fallback || !fallback.strategy) {
    return null;
  }

  switch (fallback.strategy) {
    case 'keepOriginal':
      // Keep the original value as-is (will be stored as string in typed column)
      return originalValue !== null && originalValue !== undefined
        ? String(originalValue)
        : null;
    case 'custom':
      return fallback.value ?? null;
    case 'deleteRow':
      // This is handled at the row level, not cell level.
      // Return null as placeholder; the row will be removed later.
      return null;
    case 'null':
    default:
      return null;
  }
}

/**
 * Count how many rows have a non-empty value for a given column name.
 *
 * @param {Array<Object>} rows - Array of row objects
 * @param {string} columnName - The column key to check
 * @returns {number}
 */
export function countNonEmptyCells(rows, columnName) {
  let count = 0;
  for (const row of rows) {
    const val = row[columnName];
    if (val !== null && val !== undefined && val !== '') {
      count++;
    }
  }
  return count;
}

/**
 * Collect sample values from a column (up to maxSamples unique values).
 * Useful for showing users what data will be lost on column delete.
 *
 * @param {Array<Object>} rows
 * @param {string} columnName
 * @param {number} maxSamples
 * @returns {string[]}
 */
export function collectSampleValues(rows, columnName, maxSamples = 5) {
  const seen = new Set();
  const samples = [];

  for (const row of rows) {
    const val = row[columnName];
    if (val === null || val === undefined || val === '') continue;

    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (!seen.has(str)) {
      seen.add(str);
      samples.push(str);
      if (samples.length >= maxSamples) break;
    }
  }

  return samples;
}

/**
 * Compute the full migration preview for a set of schema changes.
 *
 * @param {Object} params
 * @param {Array} params.currentColumns - Original column definitions
 * @param {Object} params.changes - Keyed by column id: { type, id, ... }
 * @param {Array<Object>} params.rows - Current table rows (items array)
 * @param {Object} params.fallbacks - Per-column fallback config: { [colId]: { strategy, value } }
 * @returns {Object} preview result
 */
export function computeMigrationPreview({
  currentColumns,
  changes,
  rows,
  fallbacks = {},
}) {
  const operations = [];
  const rowsToDelete = new Set();
  let affectedRowCount = 0;
  let failedConversionCount = 0;

  const changesList = Object.values(changes);

  for (const change of changesList) {
    switch (change.type) {
      case 'rename': {
        operations.push({
          type: 'rename',
          columnId: change.id,
          oldName: change.oldValue,
          newName: change.newValue,
          affectedRows: rows.length,
        });
        affectedRowCount = rows.length;
        break;
      }

      case 'delete': {
        const nonEmptyCount = countNonEmptyCells(rows, change.name);
        const sampleValues = collectSampleValues(rows, change.name);
        operations.push({
          type: 'delete',
          columnId: change.id,
          columnName: change.name,
          nonEmptyCount,
          sampleValues,
        });
        if (nonEmptyCount > 0) {
          affectedRowCount = Math.max(affectedRowCount, rows.length);
        }
        break;
      }

      case 'typeChanged': {
        const successes = [];
        const failures = [];
        const fallback = fallbacks[change.id] || null;
        const PREVIEW_LIMIT = 50;
        const isLargeTable = rows.length > 100;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const oldValue = row[change.name];
          const conversion = safeConvertData(oldValue, change.newType);

          // Only keep detailed results for preview rows (or all for small tables)
          if (!isLargeTable || i < PREVIEW_LIMIT) {
            const entry = {
              rowIndex: i,
              oldValue: formatValueForDisplay(oldValue),
              newValue: conversion.success
                ? formatValueForDisplay(conversion.value)
                : formatValueForDisplay(applyFallback(fallback, oldValue)),
              ok: conversion.success,
            };

            if (!conversion.success) {
              entry.error = conversion.error;
              if (fallback?.strategy === 'deleteRow') {
                entry.action = 'deleteRow';
              } else if (fallback?.strategy === 'keepOriginal') {
                entry.action = 'keep';
              } else if (fallback?.strategy === 'custom') {
                entry.action = 'custom';
              } else {
                entry.action = 'null';
              }
            }

            if (conversion.success) {
              successes.push(entry);
            } else {
              failures.push(entry);
            }
          }

          // Always count for stats
          if (!conversion.success) {
            failedConversionCount++;
            if (fallback?.strategy === 'deleteRow') {
              rowsToDelete.add(i);
            }
          }
        }

        operations.push({
          type: 'typeChanged',
          columnId: change.id,
          columnName: change.name,
          oldType: change.oldType,
          newType: change.newType,
          successes,
          failures,
          totalSuccesses: isLargeTable ? rows.length - failedConversionCount : successes.length,
          totalFailures: isLargeTable ? failedConversionCount : failures.length,
          isLargeTable,
        });
        affectedRowCount = Math.max(affectedRowCount, rows.length);
        break;
      }

      case 'add': {
        const backfillValue = getDefaultForType(
          // Find the column definition to get the type
          // change only has { type:'add', id, name } — look up in currentColumns or rely on caller
          'string' // default; caller will provide the type
        );
        operations.push({
          type: 'add',
          columnId: change.id,
          columnName: change.name,
          columnType: change.columnType || 'string',
          backfillValue,
          affectedRows: rows.length,
        });
        if (rows.length > 0) {
          affectedRowCount = Math.max(affectedRowCount, rows.length);
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    operations,
    totalRows: rows.length,
    affectedRowCount,
    failedConversionCount,
    rowsToDelete: [...rowsToDelete],
    hasChanges: operations.length > 0,
  };
}

/**
 * Format a value for display in the preview table.
 * Truncates long strings, stringifies objects.
 */
function formatValueForDisplay(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > 50 ? `${str.slice(0, 47)}...` : str;
  }
  const str = String(value);
  return str.length > 50 ? `${str.slice(0, 47)}...` : str;
}
