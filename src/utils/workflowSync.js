/**
 * Workflow synchronization after table schema changes.
 *
 * When a storage table's columns are renamed or deleted, workflow blocks
 * that reference those columns need to be updated. This module scans all
 * workflows connected to a given table and patches their block configurations.
 *
 * Block reference types:
 *   - sort-data:      references columns by NAME  (data.itemProperties[].name)
 *   - data-mapping:   references columns by NAME  (data.sources[].name, destinations[].name)
 *   - insert-data:    references columns by ID    (data.dataList[].name when type='table')
 *   - delete-data:    references columns by ID    (data.deleteList[].columnId when type='table')
 */

/**
 * Synchronize all workflow blocks that reference columns of the given table.
 *
 * @param {number} tableId - The storage table ID
 * @param {Object} changes - The changes object from StorageEditTable
 * @param {Object} workflowStore - The Pinia workflow store instance
 * @returns {Promise<{ updatedWorkflows: number, updatedBlocks: number, warnings: Array }>}
 */
export async function syncWorkflows(tableId, changes, workflowStore) {
  const result = {
    updatedWorkflows: 0,
    updatedBlocks: 0,
    warnings: [],
  };

  // Build lookup maps from changes
  const changesList = Object.values(changes);

  // Renamed columns: oldName → newName
  const renamedByName = new Map();
  // Deleted column IDs
  const deletedColIds = new Set();
  // Deleted column names (for name-based lookups)
  const deletedByName = new Map();

  for (const change of changesList) {
    if (change.type === 'rename') {
      renamedByName.set(change.oldValue, change.newValue);
    } else if (change.type === 'delete') {
      deletedColIds.add(change.id);
      deletedByName.set(change.name, change.id);
    }
  }

  // If no renames or deletes, nothing to sync
  if (renamedByName.size === 0 && deletedColIds.size === 0) {
    return result;
  }

  // Find all workflows connected to this table
  const connectedWorkflows = Object.values(workflowStore.workflows).filter(
    (wf) => wf.connectedTable === tableId
  );

  if (connectedWorkflows.length === 0) {
    return result;
  }

  for (const workflow of connectedWorkflows) {
    const nodes = workflow.drawflow?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) continue;

    let workflowModified = false;

    for (const node of nodes) {
      const data = node.data;
      if (!data) continue;

      const blocksUpdated = syncBlock(
        node,
        renamedByName,
        deletedColIds,
        deletedByName,
        result.warnings,
        workflow.name
      );

      if (blocksUpdated > 0) {
        workflowModified = true;
        result.updatedBlocks += blocksUpdated;
      }
    }

    if (workflowModified) {
      // Save the updated workflow
      await workflowStore.update({
        id: workflow.id,
        data: {
          drawflow: workflow.drawflow,
          updatedAt: Date.now(),
        },
      });
      result.updatedWorkflows++;
    }
  }

  return result;
}

/**
 * Sync a single block's column references.
 *
 * @returns {number} Number of references updated
 */
function syncBlock(
  node,
  renamedByName,
  deletedColIds,
  deletedByName,
  warnings,
  workflowName
) {
  let updated = 0;
  const { label, data } = node;

  switch (label) {
    case 'sort-data': {
      // data.itemProperties[].name — column NAME based
      if (data.sortByProperty && Array.isArray(data.itemProperties)) {
        const newProperties = [];
        for (const prop of data.itemProperties) {
          if (renamedByName.has(prop.name)) {
            prop.name = renamedByName.get(prop.name);
            updated++;
          } else if (deletedByName.has(prop.name)) {
            warnings.push({
              workflowName,
              blockLabel: label,
              blockId: node.id,
              action: 'removedDeletedRef',
              detail: `Sort property "${prop.name}" references a deleted column`,
            });
            // Skip this property (don't add to newProperties)
            updated++;
            continue;
          }
          newProperties.push(prop);
        }
        data.itemProperties = newProperties;
      }
      break;
    }

    case 'data-mapping': {
      // data.sources[].name and data.sources[].destinations[].name — column NAME based
      if (Array.isArray(data.sources)) {
        const newSources = [];
        for (const source of data.sources) {
          let sourceDeleted = false;

          if (renamedByName.has(source.name)) {
            source.name = renamedByName.get(source.name);
            updated++;
          } else if (deletedByName.has(source.name)) {
            warnings.push({
              workflowName,
              blockLabel: label,
              blockId: node.id,
              action: 'removedDeletedRef',
              detail: `Mapping source "${source.name}" references a deleted column`,
            });
            sourceDeleted = true;
            updated++;
          }

          // Also check destinations
          if (Array.isArray(source.destinations)) {
            const newDests = [];
            for (const dest of source.destinations) {
              if (renamedByName.has(dest.name)) {
                dest.name = renamedByName.get(dest.name);
                updated++;
              } else if (deletedByName.has(dest.name)) {
                warnings.push({
                  workflowName,
                  blockLabel: label,
                  blockId: node.id,
                  action: 'removedDeletedRef',
                  detail: `Mapping destination "${dest.name}" references a deleted column`,
                });
                updated++;
                continue;
              }
              newDests.push(dest);
            }
            source.destinations = newDests;
          }

          if (!sourceDeleted) {
            newSources.push(source);
          }
        }
        data.sources = newSources;
      }
      break;
    }

    case 'insert-data': {
      // data.dataList[].name — column ID based (when type='table')
      if (Array.isArray(data.dataList)) {
        const newList = [];
        for (const item of data.dataList) {
          if (item.type === 'table' && deletedColIds.has(item.name)) {
            warnings.push({
              workflowName,
              blockLabel: label,
              blockId: node.id,
              action: 'removedDeletedRef',
              detail: `Insert data item references deleted column (ID: ${item.name})`,
            });
            updated++;
            continue;
          }
          newList.push(item);
        }
        data.dataList = newList;
      }
      break;
    }

    case 'delete-data': {
      // data.deleteList[].columnId — column ID based (when type='table')
      if (Array.isArray(data.deleteList)) {
        const newList = [];
        for (const item of data.deleteList) {
          if (item.type === 'table' && deletedColIds.has(item.columnId)) {
            warnings.push({
              workflowName,
              blockLabel: label,
              blockId: node.id,
              action: 'removedDeletedRef',
              detail: `Delete data item references deleted column (ID: ${item.columnId})`,
            });
            updated++;
            continue;
          }
          newList.push(item);
        }
        data.deleteList = newList;
      }
      break;
    }

    default:
      break;
  }

  return updated;
}
