#!/usr/bin/env node
/**
 * STRVX Visual Layout Validator
 * Renders a page in a headless browser and checks:
 * 1. No dead white space below content (page fills viewport)
 * 2. No container exceeds viewport height without scrolling
 * 3. Page renders without errors
 *
 * Usage: node scripts/validate-layout.mjs http://localhost:3001/skills
 * Requires: npx playwright install chromium (one-time setup)
 */

import { chromium } from "playwright";

const url = process.argv[2];
if (!url) {
  console.log("Usage: node scripts/validate-layout.mjs <url>");
  console.log("Example: node scripts/validate-layout.mjs http://localhost:3001/skills");
  process.exit(1);
}

async function validate() {
  console.log(`Validating: ${url}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    console.log(`✗ Page failed to load: ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  await page.waitForTimeout(1000);

  const results = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const body = document.body;
    const html = document.documentElement;

    // Check 1: Does the page fill the viewport?
    const bodyHeight = Math.max(body.scrollHeight, body.offsetHeight);
    const fillsViewport = bodyHeight >= viewport.height * 0.95;

    // Check 2: Is there dead white space?
    // Find the lowest visible element
    const allElements = document.querySelectorAll("*");
    let lowestBottom = 0;
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.bottom > lowestBottom) {
        lowestBottom = rect.bottom;
      }
    }
    const whiteSpaceGap = viewport.height - lowestBottom;
    const hasDeadWhiteSpace = whiteSpaceGap > 100; // More than 100px gap

    // Check 3: Any container overflowing without scroll?
    const overflowIssues = [];
    const containers = document.querySelectorAll("div, section, main, aside");
    for (const container of containers) {
      const style = window.getComputedStyle(container);
      const hasOverflow = style.overflowY === "auto" || style.overflowY === "scroll" || style.overflow === "auto" || style.overflow === "scroll" || style.overflow === "hidden";
      const isScrollable = container.scrollHeight > container.clientHeight;

      if (isScrollable && !hasOverflow && container.clientHeight > 100) {
        const rect = container.getBoundingClientRect();
        if (rect.height > 50) {
          overflowIssues.push({
            tag: container.tagName.toLowerCase(),
            className: (container.className || "").toString().slice(0, 80),
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight,
            overflow: style.overflowY,
          });
        }
      }
    }

    return {
      viewport,
      bodyHeight,
      fillsViewport,
      lowestBottom: Math.round(lowestBottom),
      whiteSpaceGap: Math.round(whiteSpaceGap),
      hasDeadWhiteSpace,
      overflowIssues: overflowIssues.slice(0, 5),
    };
  });

  // Report
  let passed = true;

  console.log("=== Viewport Fill ===");
  if (results.fillsViewport) {
    console.log("✓ Page fills viewport");
  } else {
    console.log(`✗ Page does NOT fill viewport (body: ${results.bodyHeight}px, viewport: ${results.viewport.height}px)`);
    passed = false;
  }

  console.log("\n=== Dead White Space ===");
  if (!results.hasDeadWhiteSpace) {
    console.log("✓ No dead white space");
  } else {
    console.log(`✗ Dead white space detected: ${results.whiteSpaceGap}px gap below content (lowest element at ${results.lowestBottom}px, viewport ${results.viewport.height}px)`);
    passed = false;
  }

  console.log("\n=== Overflow Issues ===");
  if (results.overflowIssues.length === 0) {
    console.log("✓ No overflow issues");
  } else {
    for (const issue of results.overflowIssues) {
      console.log(`⚠ <${issue.tag}> content (${issue.scrollHeight}px) exceeds container (${issue.clientHeight}px) without overflow:auto`);
      if (issue.className) console.log(`  class="${issue.className}"`);
    }
    passed = false;
  }

  console.log("\n=== Console Errors ===");
  if (consoleErrors.length === 0 && pageErrors.length === 0) {
    console.log("✓ No console errors");
  } else {
    for (const err of [...pageErrors, ...consoleErrors].slice(0, 5)) {
      console.log(`✗ ${err.slice(0, 200)}`);
    }
    passed = false;
  }

  console.log(`\n${passed ? "✓ ALL CHECKS PASSED" : "✗ SOME CHECKS FAILED"}`);

  await browser.close();
  process.exit(passed ? 0 : 1);
}

validate().catch((e) => {
  console.error("Validator error:", e.message);
  process.exit(1);
});
