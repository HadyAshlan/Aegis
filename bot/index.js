// Aegis Bot v0.2 — capture + smart reminder
// Env wajib: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
//            GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GROQ_API_KEY

import { Telegraf } from "telegraf";
import { writeFile } from "./lib/store.js";
import { parseSchedule } from "./lib/groq.js";
import { addReminder, dueReminders, markNotified, listActive, removeReminder } from "./lib/reminders.js";
import { nowJakarta, formatFriendly } from "./lib/time.js";

const REQUIRED = [
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
  "GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO", "GROQ_API_KEY",
];
for (const k of REQUIRED) {
  if (!process.env[k]) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const OWNER_ID = String(process.env.TELEGRAM_CHAT_ID);
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const saveToInbox = async (text) => {
  const { date, time, iso } = nowJakarta();
  const path = `00-INBOX/${date}-${time}.md`;
  const body = `---\ncreated: ${iso}\nsource: telegram\n---\n\n${text}\n`;
  await writeFile(path, body, `inbox: ${date}-${time}`);
  return path;
};

// Guard: hanya Hady yang boleh
bot.use(async (ctx, next) => {
  if (String(ctx.from?.id) !== OWNER_ID) {
    console.warn(`Blocked: ${ctx.from?.id} (${ctx.from?.username})`);
    return;
  }
  return next();
});

bot.start((ctx) => ctx.reply(
  "✅ Aegis aktif.\n\n" +
  "Kirim pesan apa pun → saya catat ke vault.\n" +
  "Kalau ada tanggal/waktu → otomatis saya jadwalkan pengingat."
));

bot.command("ping", (ctx) => ctx.reply("pong"));

bot.command("list", async (ctx) => {
  try {
    const items = await listActive();
    if (items.length === 0) return ctx.reply("📭 Tidak ada pengingat aktif.");
    const lines = items.map((r, i) =>
      `${i + 1}. 📝 ${r.event}\n   📅 ${formatFriendly(r.datetime_iso)}\n   🔖 ${r.id}`
    );
    await ctx.reply(`📋 Pengingat aktif (${items.length}):\n\n${lines.join("\n\n")}`);
  } catch (err) {
    await ctx.reply(`❌ Gagal: ${err.message}`);
  }
});

bot.command("hapus", async (ctx) => {
  const id = ctx.message.text.replace(/^\/hapus\s*/i, "").trim();
  if (!id) return ctx.reply("Format: /hapus <id>\nLihat ID di /list");
  try {
    const ok = await removeReminder(id);
    await ctx.reply(ok ? `🗑️ Pengingat ${id} dihapus.` : `❌ ID ${id} tidak ditemukan.`);
  } catch (err) {
    await ctx.reply(`❌ Gagal: ${err.message}`);
  }
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  try {
    // Coba parse jadwal dulu
    const parsed = await parseSchedule(text);

    if (parsed.has_schedule && parsed.datetime_iso && parsed.event) {
      const { id, friendly } = await addReminder({
        datetime_iso: parsed.datetime_iso,
        event: parsed.event,
        source: text,
      });
      await ctx.reply(`⏰ Pengingat dijadwalkan\n📝 ${parsed.event}\n📅 ${friendly}\n🔖 ID: ${id}`);
      return;
    }

    // Bukan jadwal → catat ke inbox biasa
    const path = await saveToInbox(text);
    await ctx.reply(`✅ Tercatat → ${path}`);
  } catch (err) {
    console.error("handle text error:", err);
    await ctx.reply(`❌ Gagal: ${err.message}`);
  }
});

// Scheduler: cek reminders tiap 60 detik
const checkLoop = async () => {
  try {
    const due = await dueReminders();
    if (due.length === 0) return;
    const ids = [];
    for (const r of due) {
      await bot.telegram.sendMessage(
        OWNER_ID,
        `🔔 Pengingat\n📝 ${r.event}\n📅 ${formatFriendly(r.datetime_iso)}\n\n_Pesan asli:_\n${r.source}`,
        { parse_mode: "Markdown" }
      );
      ids.push(r.id);
    }
    await markNotified(ids);
  } catch (err) {
    console.error("checkLoop error:", err.message);
  }
};

setInterval(checkLoop, 60_000);
setTimeout(checkLoop, 5_000); // cek sekali di awal

bot.catch((err) => console.error("Bot error:", err));
bot.launch().then(() => console.log("Aegis bot v0.2 running"));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
