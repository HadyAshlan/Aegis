// Token usage tracker — log per role/model, agregat harian. Alert kalau mendekati limit.

import { readJSON, writeJSON } from "./store.js";
import { nowJakarta } from "./time.js";

const PATH = "07-SYSTEM/usage.json";

let memCache = null;
let lastFlushTs = 0;

const ensure = async () => {
  if (!memCache) memCache = await readJSON(PATH, { daily: {} });
  return memCache;
};

export const trackUsage = async ({ role, model, prompt_tokens = 0, completion_tokens = 0 }) => {
  try {
    const data = await ensure();
    const today = nowJakarta().date;
    data.daily[today] ||= {};
    data.daily[today][role] ||= { calls: 0, prompt: 0, completion: 0, by_model: {} };
    const slot = data.daily[today][role];
    slot.calls++;
    slot.prompt += prompt_tokens;
    slot.completion += completion_tokens;
    slot.by_model[model] = (slot.by_model[model] || 0) + 1;

    // Flush max 1x per 60s biar tidak boros commit
    const now = Date.now();
    if (now - lastFlushTs > 60_000) {
      lastFlushTs = now;
      await writeJSON(PATH, data, `usage: ${today}`);
    }
  } catch (err) {
    console.warn("[usage] track fail:", err.message);
  }
};

export const getUsageToday = async () => {
  const data = await ensure();
  const today = nowJakarta().date;
  return data.daily[today] || {};
};

export const getUsageLast7Days = async () => {
  const data = await ensure();
  const today = new Date(nowJakarta().date + "T00:00:00+07:00");
  const result = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    if (data.daily[key]) result[key] = data.daily[key];
  }
  return result;
};
