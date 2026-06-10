import cronParser from 'cron-parser';
import dayjs from 'dayjs';
import { isObject } from './helper';

const EVENT_DRIVEN_TYPES = [
  'visit-web',
  'on-startup',
  'context-menu',
  'keyboard-shortcut',
];

function cronJobNextRuns(data, count, fromDate) {
  try {
    if (!data.expression || !data.expression.trim()) return [];
    const expr = cronParser.parseExpression(data.expression, {
      currentDate: fromDate,
    });
    const runs = [];
    for (let i = 0; i < count; i++) {
      runs.push(expr.next().toDate());
    }
    return runs;
  } catch {
    return [];
  }
}

function specificDayNextRuns(data, count, fromDate) {
  if (!data.days || data.days.length === 0) return [];

  const now = dayjs(fromDate);
  const candidates = [];

  for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
    for (const item of data.days) {
      const dayId = isObject(item) ? item.id : item;
      const times = isObject(item) ? item.times : [data.time || '00:00'];

      if (!times || times.length === 0) continue;

      for (const time of times) {
        const [hour, minute, seconds] = (time || '00:00').split(':');
        let date = now
          .day(dayId)
          .hour(parseInt(hour, 10))
          .minute(parseInt(minute, 10))
          .second(parseInt(seconds, 10) || 0);

        date = date.add(weekOffset * 7, 'day');

        if (date.isAfter(now)) {
          candidates.push(date.valueOf());
        }
      }
    }
  }

  candidates.sort((a, b) => a - b);
  const unique = [...new Set(candidates)];
  return unique.slice(0, count).map((t) => new Date(t));
}

function intervalNextRuns(data, count, fromDate) {
  if (!data.interval || data.interval <= 0 || data.interval > 360) return [];

  const intervalMs = data.interval * 60 * 1000;
  const start = fromDate.getTime();
  const delayMs =
    data.delay > 0 && !data.fixedDelay ? data.delay * 60 * 1000 : 0;
  const runs = [];

  for (let i = 0; i < count; i++) {
    const time =
      i === 0
        ? start + (delayMs || intervalMs)
        : runs[i - 1].getTime() + intervalMs;
    runs.push(new Date(time));
  }

  return runs;
}

function dateNextRuns(data, _count, fromDate) {
  if (!data.date) return [];

  const [hour, minute, seconds] = (data.time || '00:00').split(':');
  const date = dayjs(data.date)
    .hour(parseInt(hour, 10))
    .minute(parseInt(minute, 10))
    .second(parseInt(seconds, 10) || 0);

  if (date.isBefore(dayjs(fromDate))) return [];

  return [date.toDate()];
}

const nextRunsMap = {
  'cron-job': cronJobNextRuns,
  'specific-day': specificDayNextRuns,
  interval: intervalNextRuns,
  date: dateNextRuns,
};

function triggerDescription(trigger) {
  const { type, data } = trigger;
  switch (type) {
    case 'cron-job':
      return data.expression || '';
    case 'interval':
      return `${data.interval || 0} min`;
    case 'specific-day': {
      const dayCount = data.days?.length || 0;
      return `${dayCount} day(s)`;
    }
    case 'date':
      return data.date || '';
    case 'visit-web':
      return data.url || '';
    case 'keyboard-shortcut':
      return data.shortcut || '';
    case 'context-menu':
      return data.contextMenuName || '';
    case 'on-startup':
      return '';
    default:
      return '';
  }
}

export function computeNextRuns(trigger, count = 5, fromDate = new Date()) {
  const { type, data } = trigger;

  if (EVENT_DRIVEN_TYPES.includes(type)) {
    return [{ time: null, eventDriven: true }];
  }

  const handler = nextRunsMap[type];
  if (!handler) return [];

  const times = handler(data, count, fromDate);
  return times.map((time) => ({ time, eventDriven: false }));
}

export function computeUnifiedTimeline(triggers, count = 5) {
  if (!triggers || triggers.length === 0) return [];

  const fromDate = new Date();
  const allEntries = [];

  for (const trigger of triggers) {
    const runs = computeNextRuns(trigger, count, fromDate);
    for (const run of runs) {
      allEntries.push({
        ...run,
        triggerType: trigger.type,
        triggerId: trigger.id,
        description: triggerDescription(trigger),
      });
    }
  }

  allEntries.sort((a, b) => {
    if (a.eventDriven && b.eventDriven) return 0;
    if (a.eventDriven) return 1;
    if (b.eventDriven) return -1;
    return a.time.getTime() - b.time.getTime();
  });

  return allEntries.slice(0, count);
}

export function detectNeverFire(trigger) {
  const { type, data } = trigger;

  switch (type) {
    case 'cron-job': {
      if (!data.expression || !data.expression.trim()) {
        return { willNeverFire: true, reason: 'invalidCron' };
      }
      try {
        cronParser.parseExpression(data.expression).next();
      } catch {
        return { willNeverFire: true, reason: 'invalidCron' };
      }
      return { willNeverFire: false };
    }

    case 'date': {
      if (!data.date) {
        return { willNeverFire: true, reason: 'emptyDate' };
      }
      const [hour, minute, seconds] = (data.time || '00:00').split(':');
      const date = dayjs(data.date)
        .hour(parseInt(hour, 10))
        .minute(parseInt(minute, 10))
        .second(parseInt(seconds, 10) || 0);
      if (date.isBefore(dayjs())) {
        return { willNeverFire: true, reason: 'dateInPast' };
      }
      return { willNeverFire: false };
    }

    case 'specific-day': {
      if (!data.days || data.days.length === 0) {
        return { willNeverFire: true, reason: 'noDays' };
      }
      const hasAnyTime = data.days.some((item) => {
        if (isObject(item)) {
          return item.times && item.times.length > 0;
        }
        return true;
      });
      if (!hasAnyTime) {
        return { willNeverFire: true, reason: 'noTimes' };
      }
      return { willNeverFire: false };
    }

    case 'interval': {
      if (!data.interval || data.interval <= 0 || data.interval > 360) {
        return { willNeverFire: true, reason: 'invalidInterval' };
      }
      return { willNeverFire: false };
    }

    case 'visit-web': {
      if (!data.url || data.url.trim() === '') {
        return { willNeverFire: true, reason: 'emptyUrl' };
      }
      return { willNeverFire: false };
    }

    default:
      return { willNeverFire: false };
  }
}

export function detectDuplicates(triggers, windowMs = 60000) {
  if (!triggers || triggers.length < 2) return [];

  const results = [];
  const fromDate = new Date();
  const CHECK_COUNT = 20;

  const runsCache = new Map();
  for (const trigger of triggers) {
    if (EVENT_DRIVEN_TYPES.includes(trigger.type)) {
      runsCache.set(trigger.id, { type: trigger.type, times: [] });
      continue;
    }
    const handler = nextRunsMap[trigger.type];
    if (!handler) continue;

    const times = handler(trigger.data, CHECK_COUNT, fromDate);
    runsCache.set(trigger.id, {
      type: trigger.type,
      times: times.map((t) => t.getTime()),
    });
  }

  const visitWebTriggers = triggers.filter((t) => t.type === 'visit-web');
  for (let i = 0; i < visitWebTriggers.length; i++) {
    for (let j = i + 1; j < visitWebTriggers.length; j++) {
      const a = visitWebTriggers[i];
      const b = visitWebTriggers[j];
      const urlA = a.data.url || '';
      const urlB = b.data.url || '';

      if (
        urlA &&
        urlB &&
        (urlA === urlB || urlA.includes(urlB) || urlB.includes(urlA))
      ) {
        results.push({
          triggerIds: [a.id, b.id],
          reason: 'overlappingUrl',
        });
      }
    }
  }

  const scheduledTriggers = triggers.filter(
    (t) => !EVENT_DRIVEN_TYPES.includes(t.type)
  );

  for (let i = 0; i < scheduledTriggers.length; i++) {
    for (let j = i + 1; j < scheduledTriggers.length; j++) {
      const a = scheduledTriggers[i];
      const b = scheduledTriggers[j];
      const runsA = runsCache.get(a.id);
      const runsB = runsCache.get(b.id);

      if (!runsA || !runsB || runsA.times.length === 0 || runsB.times.length === 0)
        continue;

      if (
        a.type === 'cron-job' &&
        b.type === 'cron-job' &&
        runsA.times.length === CHECK_COUNT &&
        runsB.times.length === CHECK_COUNT
      ) {
        const allMatch = runsA.times.every(
          (t, idx) => Math.abs(t - runsB.times[idx]) < windowMs
        );
        if (allMatch) {
          results.push({
            triggerIds: [a.id, b.id],
            reason: 'identicalCron',
          });
          continue;
        }
      }

      let hasOverlap = false;
      for (const tA of runsA.times) {
        if (hasOverlap) break;
        for (const tB of runsB.times) {
          if (Math.abs(tA - tB) < windowMs) {
            hasOverlap = true;
            break;
          }
        }
      }

      if (hasOverlap) {
        results.push({
          triggerIds: [a.id, b.id],
          reason: 'sameTime',
        });
      }
    }
  }

  return results;
}
