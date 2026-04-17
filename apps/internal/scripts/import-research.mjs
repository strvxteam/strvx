import fs from "fs";
import postgres from "postgres";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DIRECT_URL="([^"]+)"/);
const sql = postgres(match[1], { prepare: false, connect_timeout: 15, max: 1 });

// Valid categories from the enum
const VALID_CATEGORIES = new Set([
  "form", "layout", "data-display", "overlay", "navigation", "feedback",
  "animation", "text-effect", "chart", "editor", "ai", "utility",
  "background", "button", "card", "table", "input",
]);

function normalizeCategory(cat) {
  if (!cat) return "utility";
  const lower = cat.toLowerCase().replace(/_/g, "-");
  if (VALID_CATEGORIES.has(lower)) return lower;
  // Map common aliases
  const map = {
    "forms": "form", "date-time": "input", "date": "input", "time": "input",
    "colors": "input", "color": "input", "buttons": "button", "inputs": "input",
    "overlays": "overlay", "modals": "overlay", "navigation-menus": "navigation",
    "data-visualization": "chart", "charts": "chart", "tables": "table",
    "cards": "card", "backgrounds": "background", "animations": "animation",
    "text-effects": "text-effect", "editors": "editor", "layouts": "layout",
    "icons": "utility", "media": "data-display", "advanced": "utility",
    "core": "utility",
  };
  return map[lower] ?? "utility";
}

// Map library slugs from research to our DB slugs
const LIB_SLUG_MAP = {
  "shadcn-ui": "shadcn-ui",
  "radix-ui": "radix-ui",
  "tremor": "tremor",
  "tanstack-table": "tanstack-table",
  "heroui": "heroui",
};

async function importFile(path, label) {
  if (!fs.existsSync(path)) { console.log(`Skipping ${label} — file not found`); return; }
  const data = JSON.parse(fs.readFileSync(path, "utf8"));
  let imported = 0;
  let skipped = 0;

  for (const comp of data) {
    const libSlug = LIB_SLUG_MAP[comp.library] ?? comp.library;
    const [lib] = await sql`SELECT id FROM skill_libraries WHERE slug = ${libSlug}`;
    if (!lib) { skipped++; continue; }

    const category = normalizeCategory(comp.category);
    const slug = (comp.slug || comp.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")).slice(0, 100);

    await sql`
      INSERT INTO skill_components (library_id, name, slug, description, category, install_command, import_path, key_props, when_to_use, status)
      VALUES (${lib.id}, ${comp.name}, ${slug}, ${comp.description || null}, ${category}, ${comp.install_command || null}, ${comp.import_path || null}, ${comp.key_props || null}, ${comp.when_to_use || null}, ${comp.status || "available"})
      ON CONFLICT (library_id, slug) DO UPDATE SET
        description = COALESCE(EXCLUDED.description, skill_components.description),
        key_props = COALESCE(EXCLUDED.key_props, skill_components.key_props),
        when_to_use = COALESCE(EXCLUDED.when_to_use, skill_components.when_to_use),
        install_command = COALESCE(EXCLUDED.install_command, skill_components.install_command),
        import_path = COALESCE(EXCLUDED.import_path, skill_components.import_path)
    `;
    imported++;
  }
  console.log(`${label}: imported/updated ${imported}, skipped ${skipped}`);
}

async function run() {
  await importFile("component-registry.json", "shadcn + Radix research");
  await importFile("src/lib/component-registry.json", "Tremor + TanStack + HeroUI research");

  const [total] = await sql`SELECT count(*) as count FROM skill_components`;
  const [withProps] = await sql`SELECT count(*) as count FROM skill_components WHERE key_props IS NOT NULL`;
  console.log(`\nFinal: ${total.count} total components, ${withProps.count} with key_props`);
  await sql.end();
}

run().catch(e => { console.error(e.message); sql.end(); });
