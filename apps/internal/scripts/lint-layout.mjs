#!/usr/bin/env node
/**
 * STRVX Layout Linter
 * Scans React/TSX files for layout violations:
 * 1. Containers without fixed height or overflow handling
 * 2. Pages that don't fill the viewport
 * 3. Wrong library imports (Tremor, Plate.js when not installed)
 *
 * Usage: node scripts/lint-layout.mjs [file or directory]
 * Example: node scripts/lint-layout.mjs src/app/(app)/partners/
 */

import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const target = args[0] || "src/app/(app)";

function collectFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const stat = fs.statSync(dir);
  if (stat.isFile() && dir.endsWith(".tsx")) return [dir];
  if (!stat.isDirectory()) return files;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    files.push(...collectFiles(path.join(dir, entry)));
  }
  return files;
}

const violations = [];

function addViolation(file, line, severity, rule, message, suggestion) {
  violations.push({ file, line, severity, rule, message, suggestion });
}

const WRONG_IMPORTS = [
  { pattern: /@tremor\/react/, rule: "wrong-library", message: "Tremor is not installed — use recharts", suggestion: "import { AreaChart, ... } from 'recharts'" },
  { pattern: /@udecode\/plate/, rule: "wrong-library", message: "Plate.js is not installed — use TipTap", suggestion: "import { useEditor, EditorContent } from '@tiptap/react'" },
  { pattern: /from ['"]react-hot-toast/, rule: "wrong-library", message: "Use Sonner for toasts", suggestion: "import { toast } from 'sonner'" },
];

function lintFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const isClient = content.includes('"use client"');

  // Wrong imports
  for (const { pattern, rule, message, suggestion } of WRONG_IMPORTS) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        addViolation(filePath, i + 1, "error", rule, message, suggestion);
      }
    }
  }

  // Containers with .map() but no overflow/height handling
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(".map(") && !line.includes("//")) {
      let hasOverflow = false;
      let hasFixedHeight = false;
      for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
        const prev = lines[j];
        if (prev.includes("overflow-y-auto") || prev.includes("overflowY") || prev.includes("overflow: \"auto\"")) hasOverflow = true;
        if (prev.includes("calc(100vh") || prev.includes("h-screen") || prev.includes("h-full") || prev.includes("h-[") || prev.includes("height:") || prev.includes("maxHeight")) hasFixedHeight = true;
        if (prev.includes("<div") || prev.includes("<section") || prev.includes("<main")) break;
      }
      if (!hasOverflow && !hasFixedHeight) {
        addViolation(filePath, i + 1, "warning", "flexible-container",
          "List rendering (.map) without fixed height or overflow on container",
          "Add overflowY: 'auto' and fixed height, or wrap in ScrollArea");
      }
    }
  }

  // Client page components that don't fill viewport
  if (isClient && (filePath.includes("page.") || filePath.endsWith("-client.tsx"))) {
    const hasViewportFill = content.includes("h-screen") || content.includes("h-full") ||
      content.includes("100vh") || content.includes("calc(100vh") ||
      content.includes("flex-1") || content.includes("flex: 1");
    if (!hasViewportFill) {
      addViolation(filePath, 1, "warning", "no-viewport-fill",
        "Component does not appear to fill the viewport",
        "Add h-screen, h-full, flex-1, or calc(100vh-...) to the root container");
    }
  }
}

const files = collectFiles(target);
console.log(`Scanning ${files.length} files in ${target}...\n`);
for (const file of files) lintFile(file);

if (violations.length === 0) {
  console.log("✓ No layout violations found");
  process.exit(0);
} else {
  const errors = violations.filter(v => v.severity === "error");
  const warnings = violations.filter(v => v.severity === "warning");
  console.log(`Found ${violations.length} issue${violations.length !== 1 ? "s" : ""} (${errors.length} errors, ${warnings.length} warnings)\n`);
  for (const v of violations) {
    const icon = v.severity === "error" ? "✗" : "⚠";
    console.log(`${icon} ${v.file}:${v.line}`);
    console.log(`  [${v.rule}] ${v.message}`);
    if (v.suggestion) console.log(`  → ${v.suggestion}`);
    console.log();
  }
  process.exit(errors.length > 0 ? 1 : 0);
}
