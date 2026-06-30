---
date: <% tp.date.now("YYYY-MM-DD") %>
type: daily
---

# 📅 <% tp.date.now("dddd, DD MMMM YYYY") %>

## 🎯 Top 3 Hari Ini
- [ ] 
- [ ] 
- [ ] 

## 📆 Jadwal Hari Ini

```dataviewjs
const data = await dv.io.load("07-SYSTEM/reminders.json");
const obj = JSON.parse(data);
const today = "<% tp.date.now("YYYY-MM-DD") %>";
const list = (obj.reminders || []).filter(r => r.datetime_iso?.startsWith(today));
if (list.length === 0) dv.paragraph("(tidak ada jadwal)");
else dv.list(list.map(r => `${r.datetime_iso.slice(11,16)} — ${r.event}`));
```

## ✍️ Catatan
- 

## 💡 Insight / Ide
- 

## 🔁 Esok
- 

---

*Template auto via Templater + Periodic Notes.*
