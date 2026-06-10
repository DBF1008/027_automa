const DURATION_TOLERANCE_MS = 100;

export function diffEntries(a, b) {
  const fields = {
    type: a.type !== b.type,
    message: (a.message || '') !== (b.message || ''),
    description: (a.description || '') !== (b.description || ''),
    duration: Math.abs((a.duration || 0) - (b.duration || 0)) > DURATION_TOLERANCE_MS,
  };
  const hasDiff = Object.values(fields).some(Boolean);
  return { hasDiff, fields };
}

function matchKey(entry) {
  return entry.blockId || `__name__${entry.name}`;
}

export function alignHistories(historyA, historyB) {
  const bMap = new Map();
  for (const entry of historyB) {
    const key = matchKey(entry);
    if (!bMap.has(key)) bMap.set(key, []);
    bMap.get(key).push(entry);
  }

  const result = [];
  const consumed = new Set();

  for (const a of historyA) {
    const key = matchKey(a);
    const bGroup = bMap.get(key);
    if (bGroup && bGroup.length > 0) {
      const b = bGroup.shift();
      consumed.add(b);
      const { hasDiff, fields } = diffEntries(a, b);
      result.push({
        blockId: a.blockId || b.blockId,
        a,
        b,
        diffStatus: hasDiff ? 'diff' : 'match',
        diffFields: fields,
      });
    } else {
      result.push({
        blockId: a.blockId,
        a,
        b: null,
        diffStatus: 'only-a',
        diffFields: null,
      });
    }
  }

  for (const entry of historyB) {
    if (consumed.has(entry)) continue;
    const key = matchKey(entry);
    const bGroup = bMap.get(key);
    if (!bGroup || !bGroup.includes(entry)) continue;
    result.push({
      blockId: entry.blockId,
      a: null,
      b: entry,
      diffStatus: 'only-b',
      diffFields: null,
    });
  }

  return result;
}

function resolveCtxItem(itemId, ctxData) {
  let logData = ctxData;
  if (logData.ctxData) logData = logData.ctxData;
  return logData[itemId] || null;
}

export function buildComparisonExportData(
  alignedEntries,
  ctxDataA,
  ctxDataB,
  formatTimestamp
) {
  return alignedEntries.map((entry) => {
    const a = entry.a;
    const b = entry.b;
    const primary = a || b;
    return {
      blockId: entry.blockId || '',
      name: primary.name || '',
      diff_status: entry.diffStatus,
      status_a: a?.type || '',
      status_b: b?.type || '',
      message_a: a?.message || '',
      message_b: b?.message || '',
      description_a: a?.description || '',
      description_b: b?.description || '',
      duration_a: a?.duration ?? '',
      duration_b: b?.duration ?? '',
      timestamp_a: a?.timestamp ? formatTimestamp(a.timestamp) : '',
      timestamp_b: b?.timestamp ? formatTimestamp(b.timestamp) : '',
      ctxData_a: a ? resolveCtxItem(a.id, ctxDataA) : null,
      ctxData_b: b ? resolveCtxItem(b.id, ctxDataB) : null,
    };
  });
}
