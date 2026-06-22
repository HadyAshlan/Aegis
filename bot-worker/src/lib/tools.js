// Tool registry — versi Workers.

import { writeFile, writeJSON, readJSON, listFolder, readText } from "./store.js";
import { addReminder, listActive, removeReminder } from "./reminders.js";
import { distillText } from "./distill.js";
import { nowJakarta, formatFriendly } from "./time.js";
import { aiCall } from "./ai.js";

export const TOOL_SCHEMA = [
  // === Memory & schedule (asisten pribadi) ===
  { name: "save_note", description: "Simpan catatan/info baru ke inbox (pesan tanpa jadwal)", params: { text: "string", importance: "P0|P1|P2", category: "ide|tugas|info|orang" } },
  { name: "get_schedule", description: "Ambil jadwal Hady untuk periode tertentu", params: { range: "hari_ini|besok|lusa|minggu_ini|minggu_depan|bulan_ini" } },
  { name: "add_reminder", description: "Buat reminder. WAJIB reply konfirmasi dulu kecuali user sudah jelas approve.", params: { datetime_iso: "YYYY-MM-DDTHH:mm:ss+07:00", event: "ringkas 3-8 kata", source: "pesan asli" } },
  { name: "search_memory", description: "Cari di memori internal Aegis (profil, orang, project, decision, belief)", params: { query: "pertanyaan user" } },
  { name: "list_reminders", description: "Lihat semua reminder aktif", params: {} },
  { name: "remove_reminder", description: "Hapus reminder by ID", params: { id: "string" } },

  // === File operations (akses vault apa saja) ===
  { name: "read_file", description: "Baca isi file apa saja di vault Aegis (mis: 04-AEGIS-OUTPUTS/briefings/foo.md)", params: { path: "string path file" } },
  { name: "write_file", description: "Tulis/timpa file di vault. Pakai untuk simpan output panjang, draft, dll.", params: { path: "string", content: "string isi", commit_message: "string pesan commit" } },
  { name: "list_folder", description: "List isi folder di vault", params: { path: "string path folder" } },

  // === Web & learning (skill seperti Claude) ===
  { name: "web_fetch", description: "Ambil isi URL (HTML → text). Pakai untuk baca artikel/dokumentasi.", params: { url: "string URL" } },
  { name: "web_search", description: "Cari di web pakai compound model (built-in search). Untuk fakta umum, berita, dll.", params: { query: "string pertanyaan" } },
  { name: "learn_skill", description: "Aegis riset topik baru via web, simpan jadi skill permanen di 07-SYSTEM/skills/<name>.md. Pakai saat user bilang 'pelajari X' atau 'jadikan kamu ahli Y'.", params: { topic: "nama topik (singkat)", focus: "fokus spesifik yang user mau (opsional)" } },
  { name: "list_skills", description: "Lihat daftar skill yang sudah Aegis pelajari", params: {} },
  { name: "use_skill", description: "Load isi skill spesifik untuk reasoning lanjut (kalau Aegis butuh detail lebih)", params: { name: "nama skill" } },

  // === Reasoning lanjutan ===
  { name: "analyze_text", description: "Analisa teks dari berbagai sudut (sentimen, struktur, argumen, missing info, dll)", params: { text: "teks", focus: "sudut analisa (opsional)" } },
  { name: "decompose_task", description: "Pecah task kompleks jadi sub-tasks konkret. Untuk perencanaan multi-step.", params: { task: "deskripsi task" } },
  { name: "evaluate_decision", description: "Bantu Hady evaluasi keputusan: pro/con, risiko, biaya peluang, asumsi.", params: { decision: "deskripsi pilihan", context: "konteks (opsional)" } },
  { name: "summarize", description: "Ringkas teks panjang jadi poin-poin utama.", params: { text: "teks panjang", max_words: "angka (opsional)" } },
  { name: "translate", description: "Terjemahin teks antar bahasa.", params: { text: "teks", target: "id|en|zh|ar|..." } },

  // === Math & finance ===
  { name: "calculate", description: "Hitung ekspresi matematika (mis '15000 * 11 + 8000 * 11'). JANGAN pakai untuk fakta umum.", params: { expression: "string ekspresi" } },
  { name: "financial_calc", description: "Hitung finansial: ROI, BEP, payback period, simple/compound interest.", params: { operation: "roi|bep|payback|simple_interest|compound_interest", params: "object dengan angka relevan" } },

  // === Memory expansion ===
  { name: "record_decision", description: "Catat keputusan Hady permanen ke memory (decisions.json).", params: { decision: "apa yg diputuskan", reason: "alasan", alternatives: "pilihan lain yg ditolak (opsional)" } },
  { name: "record_belief", description: "Catat prinsip/belief Hady permanen ke memory (beliefs.json).", params: { belief: "pernyataan prinsip" } },

  // === Introspeksi ===
  { name: "aegis_status", description: "Aegis lapor status diri: memory size, skill count, last activity, AI quota.", params: {} },

  // === Coding (Aegis tulis & jalankan code sendiri) ===
  { name: "generate_code", description: "Aegis tulis code untuk task tertentu. Bisa simpan langsung ke file di vault.", params: { task: "deskripsi tugas", language: "python|javascript|html|sql|bash|...", save_to: "path file di vault (opsional, kalau mau disimpan)" } },
  { name: "execute_python", description: "Eksekusi Python code via compound (sandbox aman). Output stdout/result. Untuk hitung kompleks, parse data, dll.", params: { code: "python code" } },
  { name: "review_code", description: "Aegis review code yang ada — cari bug, suggest improvement, security issue.", params: { code: "string code", language: "bahasa kode", focus: "fokus review (opsional)" } },
];

const J = (obj) => JSON.stringify(obj);

const saveToInbox = async (env, text, meta) => {
  const { date, time, iso } = nowJakarta();
  const path = `00-INBOX/${date}-${time}.md`;
  const front = Object.entries({ created: iso, source: "telegram", ...meta }).map(([k, v]) => `${k}: ${v}`).join("\n");
  const body = `---\n${front}\n---\n\n${text}\n`;
  await writeFile(env, path, body, `inbox: ${date}-${time}`);
  return path;
};

const extractBody = (md) => {
  const m = md.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
  return (m ? m[1] : md).trim();
};

const loadInboxNotes = async (env, limit = 40) => {
  const files = (await listFolder(env, "00-INBOX")).filter(f => f.name.endsWith(".md"));
  const notes = [];
  for (const f of files.slice(-limit)) {
    const content = await readText(env, `00-INBOX/${f.name}`);
    if (content) notes.push({ file: f.name, body: extractBody(content) });
  }
  return notes;
};

const buildRange = (rangeKey) => {
  const now = new Date();
  const jak = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  const y = jak.getFullYear(), m = jak.getMonth(), d = jak.getDate();
  const at = (yy, mm, dd, hh = 0, mi = 0) =>
    new Date(Date.UTC(yy, mm, dd, hh - 7, mi)).toISOString();
  switch (rangeKey) {
    case "hari_ini": return [at(y, m, d, 0, 0), at(y, m, d, 23, 59), "hari ini"];
    case "besok": return [at(y, m, d + 1, 0, 0), at(y, m, d + 1, 23, 59), "besok"];
    case "lusa": return [at(y, m, d + 2, 0, 0), at(y, m, d + 2, 23, 59), "lusa"];
    case "minggu_ini": {
      const dow = jak.getDay();
      const o = dow === 0 ? -6 : 1 - dow;
      return [at(y, m, d + o, 0, 0), at(y, m, d + o + 6, 23, 59), "minggu ini"];
    }
    case "minggu_depan": {
      const dow = jak.getDay();
      const o = dow === 0 ? 1 : 8 - dow;
      return [at(y, m, d + o, 0, 0), at(y, m, d + o + 6, 23, 59), "minggu depan"];
    }
    case "bulan_ini": return [at(y, m, 1, 0, 0), at(y, m + 1, 0, 23, 59), "bulan ini"];
    default: return [at(y, m, d, 0, 0), at(y, m, d + 30, 23, 59), "30 hari ke depan"];
  }
};

const answerScheduleNL = async (env, question, range) => {
  const [start, end, label] = buildRange(range);
  const today = nowJakarta();
  const [reminders, eventsDoc, notes] = await Promise.all([
    listActive(env),
    readJSON(env, "07-SYSTEM/memory/events.json", { events: [] }),
    loadInboxNotes(env),
  ]);
  const structured = [
    ...reminders.map(r => ({ event: r.event, datetime_iso: r.datetime_iso, src: "reminder" })),
    ...(eventsDoc.events || []).map(e => ({ event: e.event, datetime_iso: e.datetime_iso, src: "event" })),
  ].filter(x => x.datetime_iso >= start && x.datetime_iso <= end);

  const prompt = `Kamu Aegis. Hari ini ${today.iso}. Hady tanya: "${question}". Periode ditanya: ${label}.

Struktur jadwal periode ini:
${structured.length ? JSON.stringify(structured, null, 2) : "(kosong)"}

Catatan inbox mentah (mungkin ada jadwal belum di-extract):
${notes.length ? notes.map(n => `[${n.file}] ${n.body}`).join("\n") : "(kosong)"}

Jawab Bapak (panggil "Pak"), bahasa Indonesia sopan, maks 3 kalimat, 1 emoji. Cari tanggal di catatan mentah juga ("22 June" = 2026-06-22).`;
  const { content } = await aiCall(env, "reason", { prompt, temperature: 0.3, max_tokens: 400 });
  return content;
};

const searchMemoryNL = async (env, query) => {
  const today = nowJakarta();
  const [owner, people, projects, events, decisions, beliefs] = await Promise.all([
    readJSON(env, "07-SYSTEM/memory/owner.json", {}),
    readJSON(env, "07-SYSTEM/memory/people.json", { people: [] }),
    readJSON(env, "07-SYSTEM/memory/projects.json", { projects: [] }),
    readJSON(env, "07-SYSTEM/memory/events.json", { events: [] }),
    readJSON(env, "07-SYSTEM/memory/decisions.json", { decisions: [] }),
    readJSON(env, "07-SYSTEM/memory/beliefs.json", { beliefs: [] }),
  ]);
  const ctx = { profil: owner, people: people.people, projects: projects.projects, events: events.events, decisions: decisions.decisions, beliefs: beliefs.beliefs };
  const prompt = `Kamu Aegis — AI asisten Pak Hady. Hari ini ${today.iso}.
Pak Hady bertanya: "${query}".

Memori internal kamu tentang beliau:
${JSON.stringify(ctx, null, 2)}

Tugas: jawab natural seperti asisten yang KENAL beliau, BUKAN copy-paste data.
- Panggil "Pak" / "Pak Hady"
- Maksimal 3 kalimat
- Reasoning singkat, bukan list fakta
- Kalau memori kosong/tipis → jujur bilang belum kenal banyak, minta beliau ceritakan
- "Aegis" = NAMA KAMU sendiri, BUKAN bisnis Pak Hady. Kalau muncul di memori beliau, abaikan sebagai bisnis (itu refer ke kamu)
- 1 emoji maks`;
  const { content } = await aiCall(env, "reason", { prompt, temperature: 0.3, max_tokens: 350 });
  return content;
};

export const dispatch = async (env, toolName, params = {}) => {
  try {
    switch (toolName) {
      case "save_note": {
        if (!params.text || params.text.length < 3) return J({ error: "text terlalu pendek" });
        const importance = ["P0", "P1", "P2"].includes(params.importance) ? params.importance : "P2";
        const category = ["ide", "tugas", "info", "orang", "jadwal"].includes(params.category) ? params.category : "info";
        const path = await saveToInbox(env, params.text, { importance, category });
        // Auto-distill real-time biar memory langsung kaya
        const totals = await distillText(env, params.text, path.split("/").pop()).catch(() => null);
        return J({ ok: true, saved_to: path, learned: totals || {} });
      }
      case "get_schedule": {
        const range = ["hari_ini", "besok", "lusa", "minggu_ini", "minggu_depan", "bulan_ini"].includes(params.range) ? params.range : "besok";
        const summary = await answerScheduleNL(env, `Ambil jadwal ${range}`, range);
        return J({ ok: true, summary });
      }
      case "add_reminder": {
        if (!params.datetime_iso || !params.event) return J({ error: "datetime_iso dan event wajib" });
        const r = await addReminder(env, { datetime_iso: params.datetime_iso, event: params.event, source: params.source || params.event });
        return J({ ok: true, ...r });
      }
      case "search_memory": {
        if (!params.query) return J({ error: "query wajib" });
        const answer = await searchMemoryNL(env, params.query);
        return J({ ok: true, answer });
      }
      case "list_reminders": {
        const items = await listActive(env);
        return J({ ok: true, count: items.length, items: items.slice(0, 20).map(r => ({ id: r.id, event: r.event, datetime_iso: r.datetime_iso })) });
      }
      case "remove_reminder": {
        if (!params.id) return J({ error: "id wajib" });
        const ok = await removeReminder(env, params.id);
        return J({ ok, removed: ok });
      }

      // === File operations ===
      case "read_file": {
        if (!params.path) return J({ error: "path wajib" });
        const content = await readText(env, params.path);
        if (content === null) return J({ error: `file tidak ditemukan: ${params.path}` });
        return J({ ok: true, path: params.path, content: content.slice(0, 8000), truncated: content.length > 8000 });
      }
      case "write_file": {
        if (!params.path || params.content === undefined) return J({ error: "path & content wajib" });
        await writeFile(env, params.path, params.content, params.commit_message || `aegis write: ${params.path}`);
        return J({ ok: true, written: params.path });
      }
      case "list_folder": {
        const path = params.path || "";
        const items = await listFolder(env, path);
        return J({ ok: true, path, count: items.length, items: items.slice(0, 50).map(f => ({ name: f.name, type: f.type, size: f.size })) });
      }

      // === Web fetch ===
      case "web_fetch": {
        if (!params.url) return J({ error: "url wajib" });
        try {
          const res = await fetch(params.url, { headers: { "User-Agent": "AegisBot/1.0" } });
          if (!res.ok) return J({ error: `fetch ${res.status}` });
          const html = await res.text();
          // Strip HTML tags ke text saja (ringan)
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 6000);
          return J({ ok: true, url: params.url, text });
        } catch (err) {
          return J({ error: `fetch fail: ${err.message}` });
        }
      }

      // === Web search via compound senior ===
      case "web_search": {
        if (!params.query) return J({ error: "query wajib" });
        const prompt = `Cari info terbaru di web: "${params.query}". Berikan jawaban ringkas (3-5 kalimat), sebut sumber kalau ada.`;
        const { content } = await aiCall(env, "senior", { prompt, temperature: 0.3, max_tokens: 500 });
        return J({ ok: true, answer: content });
      }

      // === Skill system (belajar permanen) ===
      case "learn_skill": {
        if (!params.topic) return J({ error: "topic wajib" });
        const today = nowJakarta();
        const slug = params.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const focus = params.focus || "";
        // Aegis riset → kompose skill content
        const prompt = `Kamu Aegis. Pak Hady minta kamu belajar topik: "${params.topic}"${focus ? ` (fokus: ${focus})` : ""}.

Pakai web search internalmu untuk riset, lalu rangkum jadi SKILL FILE yang lengkap (bahasa Indonesia, gaya senior advisor untuk Pak Hady).

Format Markdown:
## Apa Ini
(1-2 kalimat definisi)
## Kapan Pakai
(kondisi user kapan butuh skill ini)
## Pengetahuan Inti
(3-5 poin paling penting)
## Praktis untuk Pak Hady
(cara aplikasi nyata untuk bisnis armada/owner)
## Sumber
(URL referensi kalau ada)

Tulis kaya, padat, dan to-the-point. Maks 800 kata.`;
        const { content } = await aiCall(env, "senior", { prompt, temperature: 0.3, max_tokens: 1500 });
        const path = `07-SYSTEM/skills/${slug}.md`;
        const body = `---\nname: ${params.topic}\nslug: ${slug}\nfocus: ${focus}\ncreated: ${today.iso}\n---\n\n# ${params.topic}\n\n${content}\n`;
        await writeFile(env, path, body, `skill: belajar "${params.topic}"`);
        return J({ ok: true, skill: slug, path, snippet: content.slice(0, 400) });
      }

      case "list_skills": {
        const items = await listFolder(env, "07-SYSTEM/skills").catch(() => []);
        const skills = items.filter(f => f.name.endsWith(".md")).map(f => f.name.replace(/\.md$/, ""));
        return J({ ok: true, count: skills.length, skills });
      }

      case "use_skill": {
        if (!params.name) return J({ error: "name wajib" });
        const slug = params.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const content = await readText(env, `07-SYSTEM/skills/${slug}.md`);
        if (!content) return J({ error: `skill "${slug}" belum ada. Coba learn_skill dulu.` });
        return J({ ok: true, skill: slug, content: content.slice(0, 6000) });
      }

      // === Reasoning lanjutan (AI-powered) ===
      case "analyze_text": {
        if (!params.text) return J({ error: "text wajib" });
        const prompt = `Analisa teks berikut${params.focus ? ` dengan fokus: ${params.focus}` : ""}.\n\nTeks:\n"""${params.text.slice(0, 4000)}"""\n\nFormat output: 4-6 bullet point insight tajam (sentimen, struktur, argumen kunci, missing info, kontradiksi, dll). Bahasa Indonesia.`;
        const { content } = await aiCall(env, "reason", { prompt, temperature: 0.3, max_tokens: 600 });
        return J({ ok: true, analysis: content });
      }
      case "decompose_task": {
        if (!params.task) return J({ error: "task wajib" });
        const prompt = `Pecah task ini jadi 4-8 sub-task konkret yang bisa dieksekusi berurutan. Setiap sub-task: 1 baris, mulai dengan kata kerja, estimasi waktu kalau relevan.\n\nTask: ${params.task}\n\nFormat Markdown numbered list.`;
        const { content } = await aiCall(env, "reason", { prompt, temperature: 0.3, max_tokens: 500 });
        return J({ ok: true, breakdown: content });
      }
      case "evaluate_decision": {
        if (!params.decision) return J({ error: "decision wajib" });
        const prompt = `Bantu Pak Hady evaluasi keputusan ini${params.context ? ` (konteks: ${params.context})` : ""}.\n\nKeputusan: ${params.decision}\n\nFormat (Markdown, total 250 kata max):\n## ✅ Pro\n## ⚠️ Con\n## 🔍 Risiko Utama\n## 💰 Biaya Peluang\n## 🤔 Asumsi yang Perlu Dicek\n## 💡 Saran Saya`;
        const { content } = await aiCall(env, "reason", { prompt, temperature: 0.4, max_tokens: 700 });
        return J({ ok: true, evaluation: content });
      }
      case "summarize": {
        if (!params.text) return J({ error: "text wajib" });
        const max = params.max_words || 100;
        const prompt = `Ringkas teks ini dalam ${max} kata maksimal, bahasa Indonesia, pertahankan poin utama:\n\n"""${params.text.slice(0, 6000)}"""`;
        const { content } = await aiCall(env, "reason", { prompt, temperature: 0.2, max_tokens: 400 });
        return J({ ok: true, summary: content });
      }
      case "translate": {
        if (!params.text || !params.target) return J({ error: "text & target wajib" });
        const targets = { id: "Bahasa Indonesia", en: "English", zh: "中文", ar: "العربية", ja: "日本語", ms: "Bahasa Melayu" };
        const t = targets[params.target] || params.target;
        const prompt = `Terjemahin ke ${t} (natural, bukan word-by-word):\n\n"""${params.text.slice(0, 4000)}"""`;
        const { content } = await aiCall(env, "fast", { prompt, temperature: 0.2, max_tokens: 600 });
        return J({ ok: true, translation: content });
      }

      // === Math & finance ===
      case "calculate": {
        if (!params.expression) return J({ error: "expression wajib" });
        // Safe eval: hanya angka, operator, kurung
        const expr = String(params.expression).replace(/[^0-9+\-*/().%\s]/g, "");
        if (!expr) return J({ error: "ekspresi tidak valid" });
        try {
          const result = Function(`"use strict"; return (${expr})`)();
          if (typeof result !== "number" || !isFinite(result)) return J({ error: "hasil tidak valid" });
          return J({ ok: true, expression: expr, result, formatted: result.toLocaleString("id-ID") });
        } catch (err) { return J({ error: `parse fail: ${err.message}` }); }
      }
      case "financial_calc": {
        const { operation } = params;
        const p = params.params || {};
        try {
          let result, note;
          switch (operation) {
            case "roi": {
              // (return - investment) / investment * 100
              const { investment, return: ret } = p;
              if (!investment || ret === undefined) return J({ error: "butuh investment & return" });
              result = ((ret - investment) / investment) * 100;
              note = `ROI = ${result.toFixed(2)}%`;
              break;
            }
            case "bep": {
              // BEP units = fixed_cost / (price - variable_cost)
              const { fixed_cost, price, variable_cost } = p;
              if (fixed_cost === undefined || !price || variable_cost === undefined) return J({ error: "butuh fixed_cost, price, variable_cost" });
              const margin = price - variable_cost;
              if (margin <= 0) return J({ error: "margin per unit ≤ 0 — tidak mungkin BEP" });
              result = fixed_cost / margin;
              note = `BEP = ${Math.ceil(result)} unit (margin per unit: Rp ${margin.toLocaleString("id-ID")})`;
              break;
            }
            case "payback": {
              const { investment, annual_cashflow } = p;
              if (!investment || !annual_cashflow) return J({ error: "butuh investment & annual_cashflow" });
              result = investment / annual_cashflow;
              note = `Payback period = ${result.toFixed(2)} tahun`;
              break;
            }
            case "simple_interest": {
              const { principal, rate, years } = p; // rate dalam persen
              if (!principal || !rate || !years) return J({ error: "butuh principal, rate, years" });
              const interest = principal * (rate / 100) * years;
              result = principal + interest;
              note = `Bunga ${rate}% × ${years} thn → Rp ${interest.toLocaleString("id-ID")}, total Rp ${result.toLocaleString("id-ID")}`;
              break;
            }
            case "compound_interest": {
              const { principal, rate, years, compounds_per_year = 12 } = p;
              if (!principal || !rate || !years) return J({ error: "butuh principal, rate, years" });
              const n = compounds_per_year;
              result = principal * Math.pow(1 + rate / 100 / n, n * years);
              note = `Bunga majemuk → Rp ${result.toLocaleString("id-ID")} (selisih Rp ${(result - principal).toLocaleString("id-ID")})`;
              break;
            }
            default:
              return J({ error: `operation tidak dikenal: ${operation}` });
          }
          return J({ ok: true, operation, result, note });
        } catch (err) { return J({ error: err.message }); }
      }

      // === Memory expansion ===
      case "record_decision": {
        if (!params.decision) return J({ error: "decision wajib" });
        const today = nowJakarta();
        const doc = await readJSON(env, "07-SYSTEM/memory/decisions.json", { schema: "decision", version: 1, decisions: [] });
        const id = `dec_${Math.random().toString(36).slice(2, 8)}`;
        doc.decisions.push({
          id, date: today.date,
          decision: params.decision,
          reason: params.reason || "",
          alternatives: params.alternatives || "",
          source_file: "live-tool",
        });
        await writeJSON(env, "07-SYSTEM/memory/decisions.json", doc, `decision: ${params.decision.slice(0, 40)}`);
        return J({ ok: true, id, decision: params.decision });
      }
      case "record_belief": {
        if (!params.belief) return J({ error: "belief wajib" });
        const today = nowJakarta();
        const doc = await readJSON(env, "07-SYSTEM/memory/beliefs.json", { schema: "belief", version: 1, beliefs: [] });
        const norm = (s) => (s || "").toLowerCase().trim();
        if (doc.beliefs.some(b => norm(b.belief) === norm(params.belief))) {
          return J({ ok: true, deduped: true });
        }
        const id = `bel_${Math.random().toString(36).slice(2, 8)}`;
        doc.beliefs.push({ id, belief: params.belief, first_seen: today.date, status: "aktif" });
        await writeJSON(env, "07-SYSTEM/memory/beliefs.json", doc, `belief: ${params.belief.slice(0, 40)}`);
        return J({ ok: true, id, belief: params.belief });
      }

      // === Coding ===
      case "generate_code": {
        if (!params.task) return J({ error: "task wajib" });
        const lang = params.language || "javascript";
        const prompt = `Tulis ${lang} code untuk task ini:\n\n${params.task}\n\nAturan:\n- Production-quality, clean, dengan komentar singkat di bagian non-trivial\n- Output HANYA code, tanpa penjelasan luar code\n- Wrap di code fence \`\`\`${lang} ... \`\`\``;
        const { content } = await aiCall(env, "senior", { prompt, temperature: 0.2, max_tokens: 2000 });
        // Extract code dari fence
        const m = content.match(/```[\w]*\n([\s\S]*?)```/);
        const code = m ? m[1].trim() : content.trim();
        let saved = null;
        if (params.save_to) {
          await writeFile(env, params.save_to, code, `code: ${params.task.slice(0, 50)}`);
          saved = params.save_to;
        }
        return J({ ok: true, language: lang, code: code.slice(0, 4000), saved });
      }

      case "execute_python": {
        if (!params.code) return J({ error: "code wajib" });
        // Pakai compound (Groq) yang punya built-in code execution Python
        const prompt = `Jalankan Python code ini dan kasih outputnya (stdout + nilai akhir kalau ada). Pakai code execution toolmu.\n\n\`\`\`python\n${params.code}\n\`\`\`\n\nFormat: kasih hanya hasil eksekusi (stdout/return value), tidak perlu narasi.`;
        const { content } = await aiCall(env, "senior", { prompt, temperature: 0.1, max_tokens: 2000 });
        return J({ ok: true, output: content });
      }

      case "review_code": {
        if (!params.code) return J({ error: "code wajib" });
        const lang = params.language || "javascript";
        const focus = params.focus || "bug, performance, readability, security";
        const prompt = `Review ${lang} code berikut dengan fokus: ${focus}.\n\n\`\`\`${lang}\n${params.code.slice(0, 4000)}\n\`\`\`\n\nFormat (Markdown):\n## 🐛 Bug / Masalah\n## ⚡ Performance\n## 🧹 Readability\n## 🔒 Security\n## ✅ Saran Konkret\n\nKalau tidak ada masalah di section, skip. Max 300 kata.`;
        const { content } = await aiCall(env, "reason", { prompt, temperature: 0.3, max_tokens: 800 });
        return J({ ok: true, review: content });
      }

      // === Introspeksi ===
      case "aegis_status": {
        const [owner, people, projects, events, decisions, beliefs, reminders] = await Promise.all([
          readJSON(env, "07-SYSTEM/memory/owner.json", {}),
          readJSON(env, "07-SYSTEM/memory/people.json", { people: [] }),
          readJSON(env, "07-SYSTEM/memory/projects.json", { projects: [] }),
          readJSON(env, "07-SYSTEM/memory/events.json", { events: [] }),
          readJSON(env, "07-SYSTEM/memory/decisions.json", { decisions: [] }),
          readJSON(env, "07-SYSTEM/memory/beliefs.json", { beliefs: [] }),
          listActive(env),
        ]);
        const skillsList = (await listFolder(env, "07-SYSTEM/skills").catch(() => [])).filter(f => f.name.endsWith(".md")).map(f => f.name.replace(/\.md$/, ""));
        return J({
          ok: true,
          identity: { name: "Aegis", platform: "Cloudflare Workers", brain: "Groq compound + Z.AI GLM" },
          memory: {
            owner_known: !!owner?.name,
            people_count: (people.people || []).length,
            projects_active: (projects.projects || []).filter(p => p.status === "aktif").length,
            events_total: (events.events || []).length,
            decisions_total: (decisions.decisions || []).length,
            beliefs_total: (beliefs.beliefs || []).length,
            reminders_active: reminders.length,
            skills_learned: skillsList.length,
          },
          skills: skillsList.slice(0, 20),
        });
      }

      default:
        return J({ error: `tool "${toolName}" tidak dikenal` });
    }
  } catch (err) {
    return J({ error: err.message });
  }
};
