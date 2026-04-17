import fs from "fs";
import postgres from "postgres";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DIRECT_URL="([^"]+)"/);
const sql = postgres(match[1], { prepare: false, connect_timeout: 15, max: 1 });

const INSTALLED_LABELS = {
  "shadcn-ui": "[INSTALLED — PREFERRED]",
  "radix-ui": "[INSTALLED via shadcn]",
  "tiptap": "[INSTALLED]",
};
const INSTALLED_SET = new Set(Object.keys(INSTALLED_LABELS));

async function gen() {
  const components = await sql`
    SELECT sc.name, sc.category, sc.key_props, sc.when_to_use, sc.import_path,
           sl.name as library_name, sl.slug as library_slug
    FROM skill_components sc
    INNER JOIN skill_libraries sl ON sc.library_id = sl.id
    WHERE sl.is_active = true AND sc.when_to_use IS NOT NULL
    ORDER BY sc.category, sl.name, sc.name
  `;

  let md = `# STRVX Component Reference\n\n`;
  md += `> ${components.length} components across 15 libraries.\n`;
  md += `> Libraries marked [INSTALLED] can be used immediately.\n`;
  md += `> Others need \`npm install\` first — check before importing.\n`;
  md += `> Prefer installed libraries: shadcn/ui > Radix > TipTap > recharts > framer-motion > others\n\n`;

  const catOrder = ["button","input","form","card","table","layout","navigation","overlay","feedback","data-display","chart","animation","text-effect","background","editor","ai","utility"];
  const byCat = new Map();
  for (const c of components) {
    const existing = byCat.get(c.category) || [];
    existing.push(c);
    byCat.set(c.category, existing);
  }

  for (const cat of catOrder) {
    const comps = byCat.get(cat);
    if (!comps) continue;
    md += `## ${cat} (${comps.length})\n\n`;

    const byLib = new Map();
    for (const c of comps) {
      const key = c.library_slug;
      if (!byLib.has(key)) byLib.set(key, { name: c.library_name, slug: c.library_slug, comps: [] });
      byLib.get(key).comps.push(c);
    }

    const sorted = [...byLib.values()].sort((a, b) => {
      const aInst = INSTALLED_SET.has(a.slug) ? 0 : 1;
      const bInst = INSTALLED_SET.has(b.slug) ? 0 : 1;
      return aInst - bInst || a.name.localeCompare(b.name);
    });

    for (const lib of sorted) {
      const label = INSTALLED_LABELS[lib.slug] || "[INSTALL FIRST]";
      md += `**${lib.name}** ${label}\n`;
      for (const c of lib.comps.slice(0, 5)) {
        md += `- ${c.name}`;
        if (c.when_to_use) md += ` — ${c.when_to_use.slice(0, 70)}`;
        if (c.import_path) md += ` (\`${c.import_path}\`)`;
        md += "\n";
      }
      if (lib.comps.length > 5) md += `- _...+${lib.comps.length - 5} more_\n`;
    }
    md += "\n";
  }

  fs.writeFileSync(".claude/rules/strvx-components.md", md);
  console.log(`Written: ${md.length} chars, ${components.length} components`);
  await sql.end();
}

gen().catch(e => { console.error(e.message); sql.end(); });
