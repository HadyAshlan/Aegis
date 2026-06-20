// Reminders — kelola list jadwal di 07-SYSTEM/reminders.json

import { randomUUID } from "node:crypto";
import { readJSON, writeJSON } from "./store.js";
import { nowJakarta, isDue, formatFriendly } from "./time.js";

const PATH = "07-SYSTEM/reminders.json";

const load = () => readJSON(PATH, { reminders: [] });
const save = (data, msg) => writeJSON(PATH, data, msg);

export const addReminder = async ({ datetime_iso, event, source }) => {
  const data = await load();
  const id = randomUUID().slice(0, 8);
  data.reminders.push({
    id, datetime_iso, event, source,
    created: nowJakarta().iso,
    notified: false,
  });
  await save(data, `reminder: add ${id} — ${event}`);
  return { id, friendly: formatFriendly(datetime_iso) };
};

export const dueReminders = async () => {
  const data = await load();
  return data.reminders.filter(r => !r.notified && isDue(r.datetime_iso));
};

export const markNotified = async (ids) => {
  const data = await load();
  let changed = 0;
  for (const r of data.reminders) {
    if (ids.includes(r.id) && !r.notified) { r.notified = true; changed++; }
  }
  if (changed > 0) await save(data, `reminder: mark notified (${changed})`);
};
