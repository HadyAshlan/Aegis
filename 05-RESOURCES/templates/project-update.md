---
project: <% tp.system.prompt("Nama project?") %>
date: <% tp.date.now("YYYY-MM-DD") %>
type: project-update
---

# Update: <% tp.frontmatter.project %> — <% tp.date.now("DD MMM YYYY") %>

## 📊 Status
- 

## ✅ Yang sudah dikerjakan
- 

## 🟡 Open items
- 

## 📋 Next action
- [ ] 

## 📜 Decision
- 

---

*Auto via Templater. Hubungkan ke [[02-PROJECTS/<% tp.frontmatter.project %>]]*
