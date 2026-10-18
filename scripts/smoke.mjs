#!/usr/bin/env node
// Smoke test for dist/index.html in headless Chromium.
//
//   node scripts/smoke.mjs
//
// For each language (en, ko) and width (desktop, phone) it opens every chapter,
// scrolls through so each demo mounts and runs, and fails on:
//   - script errors or console errors
//   - a page that scrolls sideways
//   - Korean text left visible on the English page
// Then it lets the self-playing demo run the whole level and checks that it reaches the goal.
//
// Uses Playwright's Chromium. Set CHROME to use another Chromium binary.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page0 = pathToFileURL(path.join(root, "dist", "index.html")).href;
const CHAPTERS = ["intro", "loop", "sprites", "background", "tools", "sound", "physics", "basics", "hardware", "play"];
const failures = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

// Korean characters still visible in the English page (text nodes and labels)
function leakedKorean() {
  const out = [];
  const roots = [document.querySelector("article.chapter:not([hidden])"), document.querySelector("#rail"), document.querySelector(".topbar")];
  for (const r of roots) {
    if (!r) continue;
    const walker = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.trim();
      const e = n.parentElement;
      if (!t || !/[가-힣]/.test(t) || !e || e.closest("#lang-toggle") || !e.getClientRects().length) continue;
      out.push(t.slice(0, 60));
    }
    for (const a of r.querySelectorAll("[aria-label],[title]")) {
      const v = `${a.getAttribute("aria-label") || ""} ${a.getAttribute("title") || ""}`.trim();
      if (/[가-힣]/.test(v) && a.getClientRects().length && !a.closest("#lang-toggle")) out.push(`[attribute] ${v.slice(0, 60)}`);
    }
  }
  return [...new Set(out)];
}

for (const lang of ["en", "ko"]) {
  for (const width of [1280, 390]) {
    const tag = `${lang} · ${width}px`;
    const context = await browser.newContext({ viewport: { width, height: 860 }, hasTouch: width < 700, isMobile: width < 700 });
    const page = await context.newPage();
    page.on("pageerror", (e) => failures.push(`${tag}: script error: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource/.test(m.text())) failures.push(`${tag}: console error: ${m.text()}`);
    });
    // The page works offline; skip the web fonts so the test doesn't depend on the network.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`${page0}?lang=${lang}`);
    await page.waitForTimeout(500);
    for (const ch of CHAPTERS) {
      await page.evaluate((h) => { location.hash = h; }, ch);
      await page.waitForTimeout(250);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 640) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(110);
      }
      const visible = await page.evaluate(() => document.querySelectorAll("article.chapter:not([hidden])").length);
      if (visible !== 1) failures.push(`${tag}: ${ch}: ${visible} chapters visible`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) failures.push(`${tag}: ${ch}: the page scrolls sideways by ${overflow}px`);
      if (lang === "en") for (const t of await page.evaluate(leakedKorean)) failures.push(`${tag}: ${ch}: Korean text on the English page: ${t}`);
    }
    console.log(`checked ${CHAPTERS.length} chapters · ${tag}`);
    await context.close();
  }
}

// The self-playing demo should get through the default level.
{
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(`level run: script error: ${e.message}`));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(`${page0}?lang=en`);
  const run = await page.evaluate(() => {
    let cleared = false, deaths = 0, frames = 0;
    const w = new World({
      mode: "attract", input: new Input(), sound: false,
      onEvent: (ev) => { if (ev === "clear") cleared = true; if (ev === "die") deaths++; },
    });
    for (; frames < 20000 && !cleared; frames++) w.update();
    return { cleared, deaths, seconds: Math.round(frames / 60) };
  });
  if (!run.cleared) failures.push(`level run: the demo did not reach the goal (${run.deaths} deaths in ${run.seconds} s)`);
  else console.log(`level run: goal reached in ${run.seconds} s of game time with ${run.deaths} deaths`);
  await page.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("smoke test passed");
