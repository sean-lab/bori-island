#!/usr/bin/env node
// Regenerates the README screenshots from dist/index.html.
//
//   node scripts/screenshots.mjs <out-dir> [page-url]
//
// Writes game.png (the game screen at exactly 4×, same in both languages) and
// tools / sound / hardware / state-machine as .en.png and .ko.png.
// page-url defaults to the local dist/index.html; pass a deployed URL to shoot that instead.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || "docs/screenshots");
const url = process.argv[3] || pathToFileURL(path.join(root, "dist", "index.html")).href;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || undefined,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

async function open(lang) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${url}${url.includes("?") ? "&" : "?"}lang=${lang}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return { page, context };
}
async function chapter(page, id) {
  await page.evaluate((h) => { location.hash = h; }, id);
  await page.waitForTimeout(400);
}
async function shot(page, selector, file, wait = 500) {
  const loc = page.locator(`${selector} > :first-child`).first();   // the panel itself, not the full-width slot
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(wait);
  await loc.screenshot({ path: path.join(out, file) });
  console.log("wrote", file);
}

// game.png: run the self-playing demo for a fixed number of frames, then draw at 4×
{
  const { page, context } = await open("en");
  const dataUrl = await page.evaluate(() => {
    const w = new World({ mode: "attract", input: new Input(), sound: false });
    for (let i = 0; i < 1320; i++) w.update();
    const small = document.createElement("canvas");
    small.width = SCREEN_W; small.height = SCREEN_H;
    const sctx = small.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    w.render(sctx, 1);
    const big = document.createElement("canvas");
    big.width = SCREEN_W * 4; big.height = SCREEN_H * 4;
    const bctx = big.getContext("2d");
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(small, 0, 0, big.width, big.height);
    return big.toDataURL("image/png");
  });
  writeFileSync(path.join(out, "game.png"), Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote game.png");
  await context.close();
}

for (const lang of ["en", "ko"]) {
  const { page, context } = await open(lang);

  await chapter(page, "tools");
  await shot(page, "#tool-pixel", `tools.${lang}.png`);

  await chapter(page, "sound");
  await page.locator("#snd-tracker").scrollIntoViewIfNeeded();
  await page.locator("#snd-tracker .btn.primary").first().click();
  await shot(page, "#snd-tracker", `sound.${lang}.png`, 1600);
  await page.evaluate(() => AudioSys.stopMusic());

  await chapter(page, "hardware");
  await shot(page, "#hw-raster", `hardware.${lang}.png`, 1200);

  await chapter(page, "basics");
  await page.locator("#bas-fsm-intro").scrollIntoViewIfNeeded();
  await page.locator("#bas-fsm-intro .btn.primary").click();
  await page.locator("#bas-fsm-intro .btn").nth(1).click();
  await shot(page, "#bas-fsm-intro", `state-machine.${lang}.png`, 300);

  await context.close();
}

await browser.close();
