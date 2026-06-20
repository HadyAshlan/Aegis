// Groq parser — extract jadwal dari teks natural Indonesia.

import Groq from "groq-sdk";
import { nowJakarta } from "./time.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const buildPrompt = (text) => {
  const today = nowJakarta();
  return `Kamu adalah parser jadwal. Hari ini: ${today.iso} (Asia/Jakarta).

Tugas: ekstrak jadwal dari teks user.

Output STRICT JSON, tanpa code fence, tanpa penjelasan. Schema:
{
  "has_schedule": boolean,
  "datetime_iso": "YYYY-MM-DDTHH:mm:ss+07:00" atau null,
  "event": "ringkasan 3-8 kata" atau null
}

Aturan:
- "besok" = hari berikutnya, "lusa" = +2 hari
- Nama hari (Senin, Selasa, dst) = hari terdekat ke depan
- "pagi"=08:00, "siang"=12:00, "sore"=15:00, "malam"=19:00
- "jam 10" tanpa AM/PM, kalau konteks pagi atau tidak jelas → 10:00
- Tanpa waktu spesifik → default 09:00
- Tanpa tanggal sama sekali → has_schedule: false

Teks user:
"""${text}"""`;
};

export const parseSchedule = async (text) => {
  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: buildPrompt(text) }],
    temperature: 0.1,
    max_tokens: 200,
    response_format: { type: "json_object" },
  });
  const raw = res.choices[0]?.message?.content?.trim() || "{}";
  try { return JSON.parse(raw); }
  catch { return { has_schedule: false }; }
};
