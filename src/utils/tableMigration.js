import { convertData } from '@/workflowEngine/helper';

export function tryConvertValue(value, fromType, toType) {
  if (toType === 'any' || fromType === toType) {
    return { success: true, value };
  }

  if (value === null || value === undefined) {
    return { success: true, value: null };
  }

  try {
    const result = convertData(value, toType);

    if (toType === 'integer' && (Number.isNaN(result) || result === undefined)) {
      return { success: false, value, error: `Cannot convert "${value}" to number` };
    }

    return { success: true, value: result };
  } catch (error) {
    return { success: false, value, error: error.message };
  }
}

export function analyzeMigration(originalColumns, newColumns, changes, items) {
  const report = {
    added: [],
    renamed: [],
    deleted: [],
    typeChanged: [],
    hasChanges: false,
  };

  const changesArr = Object.values(changes);
  if (changesArr.length === 0 && originalColumns.length === newColumns.length) {
    const originalMap = {};
    originalColumns.forEach((col) => {
      originalMap[col.id] = col;
    });
    const hasTypeChange = newColumns.some(
      (col) => originalMap[col.id] && originalMap[col.id].type !== col.type
    );
    if (!hasTypeChange) return report;
  }

  report.hasChanges = true;

  const addedIds = new Set();
  const deletedIds = new Set();

  changesArr.forEach((change) => {
    if (change.type === 'add') {
      addedIds.add(change.id);
      const col = newColumns.find((c) => c.id === change.id);
      report.added.push({
        id: change.id,
        name: col?.name || change.name,
        type: col?.type || 'string',
      });
    } else if (change.type === 'delete') {
      deletedIds.add(change.id);
      let nonNullCount = 0;
      items.forEach((item) => {
        if (item[change.name] != null) nonNullCount += 1;
      });
      report.deleted.push({
        id: change.id,
        name: change.name,
        nonNullCount,
      });
    } else if (change.type === 'rename') {
      let affectedRows = 0;
      items.forEach((item) => {
        if (item[change.oldValue] !== undefined) affectedRows += 1;
      });
      report.renamed.push({
        id: change.id,
        oldName: change.oldValue,
        newName: change.newValue,
        affectedRows,
      });
    }
  });

  const originalMap = {};
  originalColumns.forEach((col) => {
    originalMap[col.id] = col;
  });

  newColumns.forEach((col) => {
    if (addedIds.has(col.id) || deletedIds.has(col.id)) return;

    const original = originalMap[col.id];
    if (!original || original.type === col.type) return;

    let successCount = 0;
    let failureCount = 0;
    const sampleFailures = [];

    const colName = original.name;
    items.forEach((item) => {
      const val = item[colName];
      if (val === null || val === undefined) {
        successCount += 1;
        return;
      }
      const result = tryConvertValue(val, original.type, col.type);
      if (result.success) {
        successCount += 1;
      } else {
        failureCount += 1;
        if (sampleFailures.length < 3) {
          sampleFailures.push({ value: val, error: result.error });
        }
      }
    });

    report.typeChanged.push({
      id: col.id,
      name: colName,
      fromType: original.type,
      toType: col.type,
      successCount,
      failureCount,
      sampleFailures,
    });
  });

  if (
    report.added.length === 0 &&
    report.renamed.length === 0 &&
    report.deleted.length === 0 &&
    report.typeChanged.length === 0
  ) {
    report.hasChanges = false;
  }

  return report;
}

export function applyMigration(items, changes, typeChanged, fallbackStrategies) {
  const newItems = items.map((item) => ({ ...item }));

  const renames = changes.filter((c) => c.type === 'rename');
  const deletes = changes.filter((c) => c.type === 'delete');

  newItems.forEach((item) => {
    renames.forEach(({ oldValue, newValue }) => {
      if (oldValue in item) {
        item[newValue] = item[oldValue];
        delete item[oldValue];
      }
    });

    deletes.forEach(({ name }) => {
      delete item[name];
    });

    typeChanged.forEach(({ id, name, fromType, toType }) => {
      if (!(name in item) || item[name] === null || item[name] === undefined) {
        return;
      }

      const result = tryConvertValue(item[name], fromType, toType);
      if (result.success) {
        item[name] = result.value;
      } else {
        const strategy = fallbackStrategies[id]?.strategy || 'null';
        if (strategy === 'null') {
          item[name] = null;
        } else if (strategy === 'default') {
          item[name] = fallbackStrategies[id]?.defaultValue ?? null;
        }
      }
    });
  });

  return newItems;
}
