# 07-SYSTEM/memory — Structured Memory Layer

Memori Aegis yang **terstruktur** (bukan teks mentah).
Diisi otomatis oleh skill **Capture Processor** (jalan tiap malam jam 23:00 WIB).
Aegis baca dari sini saat menjawab pertanyaan Bapak.

---

## 📋 5 File Memory

### `people.json` — Orang yang Bapak kenal
Setiap orang yang muncul di catatan akan dimasukkan ke sini.

**Schema satu entri:**
```json
{
  "id": "person_001",
  "name": "Nama lengkap",
  "aliases": ["nickname", "panggilan"],
  "role": "Manajer / supir / partner / dll",
  "context": "Apa hubungannya dengan Bapak",
  "first_seen": "2026-06-21",
  "last_mentioned": "2026-06-22",
  "notes": ["catatan singkat tentang dia"]
}
```

### `projects.json` — Project / bisnis / unit
Topik besar yang Bapak kerjakan (bisa bisnis, side project, hobi).

**Schema:**
```json
{
  "id": "proj_001",
  "name": "Nama project",
  "status": "aktif | jeda | selesai",
  "goal": "Tujuan",
  "first_seen": "2026-06-21",
  "last_mentioned": "2026-06-22",
  "notes": ["catatan progress"]
}
```

### `events.json` — Event terstruktur (jadwal + yang sudah lewat)
Beda dengan `reminders.json` yang cuma jadwal aktif — `events.json` simpan SEMUA (termasuk yang sudah lewat) buat history.

**Schema:**
```json
{
  "id": "ev_001",
  "datetime_iso": "2026-06-22T09:00:00+07:00",
  "event": "Rapat anggota tahunan kojang",
  "involves": ["person_001"],
  "project": "proj_001",
  "status": "scheduled | done | cancelled",
  "outcome": "Hasil event (diisi setelah event terjadi)"
}
```

### `decisions.json` — Keputusan Bapak + alasan
Setiap kali Bapak memutuskan sesuatu di catatan.

**Schema:**
```json
{
  "id": "dec_001",
  "date": "2026-06-21",
  "decision": "Apa yang diputuskan",
  "reason": "Kenapa",
  "alternatives": ["pilihan lain yang ditolak"],
  "outcome": "Hasil (diisi nanti saat review)"
}
```

### `beliefs.json` — Prinsip / belief Bapak
Hal yang Bapak yakini, yang membentuk cara Bapak ambil keputusan.

**Schema:**
```json
{
  "id": "bel_001",
  "belief": "Pernyataan singkat",
  "evidence": ["catatan yang dukung"],
  "first_seen": "2026-06-21",
  "status": "aktif | berubah | ditinggalkan"
}
```

---

## 🔁 Alur Distill

```
INBOX (catatan mentah)
   ↓ (tiap malam 23:00, Capture Processor)
   ↓ Groq baca semua → ekstrak per kategori
   ↓
5 file JSON (memory terstruktur)
   ↓ + file inbox pindah ke 06-ARCHIVE/inbox/YYYY-MM/
   ↓
Inbox bersih, memory makin kaya.
```

---

## 🧠 Yang BELUM connect ke project lain
Memory ini **murni dari catatan Bapak via Telegram bot**. Belum baca data reguler-fleet, bajaj-fleet, 3sSmartSystem, Capital Sentinel. Itu Layer berikutnya.
