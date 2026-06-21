// Layer 5 — Feedback: simpan reaksi Hady (👍 / 👎) untuk pembelajaran.

import { readJSON, writeJSON } from "./store.js";
import { nowJakarta } from "./time.js";

const PATH = "07-SYSTEM/feedback.json";

const load = () => readJSON(PATH, { items: [] });

export const recordFeedback = async ({ message_id, rating, source, model }) => {
  const data = await load();
  data.items.push({
    ts: nowJakarta().iso,
    message_id,
    rating, // "up" | "down"
    source,  // "recall" | "schedule" | "reflect" | "reminder"
    model: model || null,
  });
  await writeJSON(PATH, data, `feedback: ${rating} on ${source} msg ${message_id}`);
};

export const summary = async () => {
  const data = await load();
  const up = data.items.filter(x => x.rating === "up").length;
  const down = data.items.filter(x => x.rating === "down").length;
  const bySource = {};
  for (const it of data.items) {
    bySource[it.source] = bySource[it.source] || { up: 0, down: 0 };
    bySource[it.source][it.rating]++;
  }
  return { total: data.items.length, up, down, bySource };
};
