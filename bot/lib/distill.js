// Distill — baca inbox, ekstrak entitas pakai Groq, merge ke memory files.

import { randomUUID } from "node:crypto";
import { readJSON, writeJSON, listFolder, readText, writeFile, deleteFile } from "./store.js";
import { extract } from "./groq.js";
import { nowJakarta } from "./time.js";

const MEM = {
  people: "07-SYSTEM/memory/people.json",
  projects: "07-SYSTEM/memory/projects.json",
  events: "07-SYSTEM/memory/events.json",
  decisions: "07-SYSTEM/memory/decisions.json",
  beliefs: "07-SYSTEM/memory/beliefs.json",
};

const norm = (s) => (s || "").toLowerCase().trim();
const sid = (prefix) => `${prefix}_${randomUUID().slice(0, 6)}`;
const extractBody = (md) => {
  const m = md.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
  return (m ? m[1] : md).trim();
};

const findOrCreate = (list, candidate, prefix, today) => {
  const cand = norm(candidate.name);
  const existing = list.find(x =>
    norm(x.name) === cand || (x.aliases || []).some(a => norm(a) === cand)
  );
  if (existing) {
    existing.last_mentioned = today;
    return existing;
  }
  const fresh = {
    id: sid(prefix),
    name: candidate.name,
    first_seen: today,
    last_mentioned: today,
    notes: [],
  };
  list.push(fresh);
  return fresh;
};

const mergePerson = (list, p, today) => {
  const target = findOrCreate(list, p, "person", today);
  if (p.role && !target.role) target.role = p.role;
  if (p.context && !target.context) target.context = p.context;
  if (Array.isArray(p.notes)) {
    for (const n of p.notes) {
      if (n && !target.notes.includes(n)) target.notes.push(n);
    }
  }
};

const mergeProject = (list, p, today) => {
  const target = findOrCreate(list, p, "proj", today);
  if (p.status) target.status = p.status;
  if (Array.isArray(p.notes)) {
    for (const n of p.notes) {
      if (n && !target.notes.includes(n)) target.notes.push(n);
    }
  }
};

const mergeBelief = (list, b, today) => {
  const cand = norm(b.belief);
  if (!cand) return;
  if (list.some(x => norm(x.belief) === cand)) return;
  list.push({
    id: sid("bel"),
    belief: b.belief,
    first_seen: today,
    status: "aktif",
  });
};

export const distill = async () => {
  const files = (await listFolder("00-INBOX")).filter(f => f.name.endsWith(".md"));
  if (files.length === 0) return { processed: 0, found: 0 };

  const peopleDoc = await readJSON(MEM.people, { schema: "person", version: 1, people: [] });
  const projectsDoc = await readJSON(MEM.projects, { schema: "project", version: 1, projects: [] });
  const eventsDoc = await readJSON(MEM.events, { schema: "event", version: 1, events: [] });
  const decisionsDoc = await readJSON(MEM.decisions, { schema: "decision", version: 1, decisions: [] });
  const beliefsDoc = await readJSON(MEM.beliefs, { schema: "belief", version: 1, beliefs: [] });

  const { date: today } = nowJakarta();
  let totals = { people: 0, projects: 0, events: 0, decisions: 0, beliefs: 0 };
  const archived = [];

  for (const f of files) {
    const content = await readText(`00-INBOX/${f.name}`);
    if (!content) continue;
    const body = extractBody(content);
    if (!body) continue;

    let ex;
    try { ex = await extract(body); }
    catch (err) { console.error(`distill extract fail ${f.name}:`, err.message); continue; }

    for (const p of ex.people) { mergePerson(peopleDoc.people, p, today); totals.people++; }
    for (const p of ex.projects) { mergeProject(projectsDoc.projects, p, today); totals.projects++; }
    for (const e of ex.events) {
      if (!e.datetime_iso || !e.event) continue;
      eventsDoc.events.push({
        id: sid("ev"),
        datetime_iso: e.datetime_iso,
        event: e.event,
        involves: e.involves || [],
        project: e.project || null,
        status: "scheduled",
        source_file: f.name,
        recorded: today,
      });
      totals.events++;
    }
    for (const d of ex.decisions) {
      if (!d.decision) continue;
      decisionsDoc.decisions.push({
        id: sid("dec"),
        date: today,
        decision: d.decision,
        reason: d.reason || "",
        source_file: f.name,
      });
      totals.decisions++;
    }
    for (const b of ex.beliefs) { mergeBelief(beliefsDoc.beliefs, b, today); totals.beliefs++; }

    // Archive inbox file (copy ke 06-ARCHIVE, hapus dari INBOX)
    const ym = today.slice(0, 7);
    const archivePath = `06-ARCHIVE/inbox/${ym}/${f.name}`;
    await writeFile(archivePath, content, `archive: ${f.name} → ${ym}`);
    await deleteFile(`00-INBOX/${f.name}`, `inbox: clean ${f.name} after distill`);
    archived.push(f.name);
  }

  await writeJSON(MEM.people, peopleDoc, `memory: distill people (+${totals.people})`);
  await writeJSON(MEM.projects, projectsDoc, `memory: distill projects (+${totals.projects})`);
  await writeJSON(MEM.events, eventsDoc, `memory: distill events (+${totals.events})`);
  await writeJSON(MEM.decisions, decisionsDoc, `memory: distill decisions (+${totals.decisions})`);
  await writeJSON(MEM.beliefs, beliefsDoc, `memory: distill beliefs (+${totals.beliefs})`);

  return { processed: files.length, totals, archived };
};
