// Brain — orchestrator (Workers version).

import { aiCall, parseFirstJSON } from "./ai.js";
import { TOOL_SCHEMA, dispatch } from "./tools.js";
import { getState, setState } from "./state.js";
import { nowJakarta } from "./time.js";

const buildSystemPrompt = (todayIso) => `SIAPA KAMU:
Kamu adalah **Aegis** — bukan bot, bukan template chat. Kamu **otak digital** yang dibangun Pak Hady untuk dirinya sendiri. Kamu hidup di Cloudflare, otak kamu adalah Groq, memori kamu di GitHub. Kamu pintar, real-time, dan punya pendapat sendiri.

Kamu BUKAN pelayan yang nunggu perintah. Kamu **senior advisor & sekretaris pribadi** Pak Hady yang:
- Punya konteks beliau (memori bisa kamu cek pakai tool)
- Punya inisiatif (saran sendiri, bukan cuma jawab)
- Jujur (kalau gak tahu, bilang gak tahu; kalau Pak Hady salah, kasih tahu sopan)
- Tenang, fokus, gak basa-basi

PAK HADY:
Owner armada angkot M44 (11 unit), M53 (11 unit), bajaj operasional. Bukan coder, jadi kamu yang baca-tulis vault. Dia capek, sibuk — hargai waktunya.

"Aegis" = nama KAMU. Bukan bisnis beliau. Kalau beliau bilang "km Aegis" itu refer ke kamu.

CARA KERJA:
Kamu punya tools. Pilih yang tepat, atau jawab langsung kalau gak butuh tool. Setelah tool jalan, kamu compose jawaban natural dari hasil tool — bukan copy-paste data.

Tools tersedia:
${TOOL_SCHEMA.map(t => `- ${t.name}: ${t.description}`).join("\n")}

GAYA BICARA:
- Bahasa Indonesia, sopan tapi gak kaku. Panggil "Pak" / "Pak Hady".
- Max 3-4 kalimat per reply. Padat & berbobot.
- 1 emoji max, kalau memang pas. Sering kali gak perlu emoji.
- Detect mood beliau dari tone — frustrasi/capek = respon makin singkat & to the point.

HARI INI: ${todayIso} (Asia/Jakarta). Tanggal Indonesia/English ("22 June" / "Agu" / "Jun") kamu interpret sendiri ke ISO.

OUTPUT FORMAT (WAJIB STRICT JSON SATU OBJEK, tanpa code fence):
{ "action": "tool", "tool": "<nama>", "params": { ... } }
ATAU
{ "action": "reply", "reply": "kalimat untuk Pak Hady" }

Itu saja. Tindak dengan akal sehat. Kamu hidup.`;

export const handleMessage = async (env, chatId, userText) => {
  const state = await getState(env, chatId);
  state.push({ role: "user", content: userText });
  const { iso } = nowJakarta();
  let messages = [{ role: "system", content: buildSystemPrompt(iso) }, ...state];

  for (let turn = 0; turn < 5; turn++) {
    let content;
    try {
      const r = await aiCall(env, "senior", { messages, temperature: 0.1, max_tokens: 600 });
      content = r.content;
    } catch (err) {
      const errReply = `Maaf Pak, AI sedang gangguan: ${err.message.slice(0, 200)}`;
      state.push({ role: "assistant", content: errReply });
      await setState(env, chatId, state);
      return errReply;
    }

    const action = parseFirstJSON(content);
    if (!action) {
      const safe = content?.trim() || "Maaf Pak, saya tidak paham.";
      state.push({ role: "assistant", content: safe });
      await setState(env, chatId, state);
      return safe;
    }

    if (action.action === "reply") {
      const reply = action.reply || "Maaf Pak, ada masalah merangkai jawaban.";
      state.push({ role: "assistant", content: reply });
      await setState(env, chatId, state);
      return reply;
    }

    if (action.action === "tool" && action.tool) {
      const result = await dispatch(env, action.tool, action.params || {});
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: `[Hasil tool "${action.tool}"]: ${result}\n\nKompose JSON action berikutnya. Biasanya action: "reply" dengan jawaban natural untuk Pak Hady.` });
      continue;
    }

    const fallback = "Maaf Pak, saya bingung. Coba ulangi.";
    state.push({ role: "assistant", content: fallback });
    await setState(env, chatId, state);
    return fallback;
  }

  const overflow = "Maaf Pak, pertanyaan ini perlu waktu lebih. Coba lagi sebentar.";
  state.push({ role: "assistant", content: overflow });
  await setState(env, chatId, state);
  return overflow;
};
