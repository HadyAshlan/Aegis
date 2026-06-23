// Privacy layer — filter data sensitif sebelum kirim ke AI provider eksternal.
// Auto-detect angka uang/credential + manual tag `private: true`.

const SENSITIVE_PATTERNS = [
  /\b(rp\.?\s*\d|\d[\d.,]*\s*(juta|jt|ribu|rb|miliar|m\b))/i,  // Rp, juta, ribu
  /\b\d{1,3}([.,]\d{3}){2,}/,                                    // 3.450.000, 1,500,000
  /\b(hutang|debt|piutang|gaji|salary|transfer|setoran)\b.*\d/i,  // hutang + angka
  /\b(password|api[\s_-]?key|token|secret|otp)\b/i,              // credential keywords
  /\b\d{16}\b/,                                                   // 16 digit (kartu kredit)
];

// Cek apa entry punya tag private OR kontennya match pattern sensitif
export const isPrivate = (entry) => {
  if (!entry) return false;
  if (entry.private === true) return true;
  const text = JSON.stringify(entry);
  return SENSITIVE_PATTERNS.some(re => re.test(text));
};

// Bersihkan memory snapshot — buang yang private, mask nominal di notes
export const redactMemory = (memSnapshot) => {
  if (!memSnapshot || typeof memSnapshot !== "object") return memSnapshot;
  const out = JSON.parse(JSON.stringify(memSnapshot));

  // People — buang yang private, redact nominal di notes lainnya
  if (Array.isArray(out.people)) {
    out.people = out.people
      .filter(p => !isPrivate(p))
      .map(p => ({
        ...p,
        notes: (p.notes || []).map(n => redactNumbers(n)),
      }));
  }
  // Decisions, beliefs — strip private
  for (const key of ["decisions", "beliefs", "events"]) {
    if (Array.isArray(out[key])) {
      out[key] = out[key]
        .filter(x => !isPrivate(x))
        .map(x => ({
          ...x,
          ...(x.notes ? { notes: x.notes.map(n => redactNumbers(n)) } : {}),
          ...(x.reason ? { reason: redactNumbers(x.reason) } : {}),
        }));
    }
  }
  return out;
};

// Mask angka besar (Rp, juta, ribu) → ganti dengan [REDACTED]
const redactNumbers = (text) => {
  if (typeof text !== "string") return text;
  return text
    .replace(/\b(rp\.?\s*)?\d[\d.,]*\s*(juta|jt|ribu|rb|miliar|m)?\b/gi, "[ANGKA-REDACTED]")
    .replace(/\b\d{1,3}([.,]\d{3}){2,}\b/g, "[ANGKA-REDACTED]");
};

// Auto-tag private kalau text match sensitive
export const shouldFlagPrivate = (text) => SENSITIVE_PATTERNS.some(re => re.test(text || ""));

export { redactNumbers };
