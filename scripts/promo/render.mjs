#!/usr/bin/env node
// Renders the 20-second promo video from the built page.
//
//   node scripts/promo/render.mjs [out-dir] [page-url]
//
// Writes <out-dir>/bori-island-promo.mp4 (1080×1080, 30 fps, H.264 + AAC at -14 LUFS) and
// <out-dir>/bori-island-promo-cover.png. out-dir defaults to dist/promo, page-url to the local
// dist/index.html; pass another URL (a local server, the deployed page) to render from that.
// Needs Playwright's Chromium and ffmpeg with libx264. Without ffmpeg it keeps the PNG frames and
// the WAV and prints the command that finishes the job.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const out = path.resolve(process.argv[2] || path.join(root, "dist", "promo"));
const url = process.argv[3] || pathToFileURL(path.join(root, "dist", "index.html")).href;
mkdirSync(out, { recursive: true });
const work = mkdtempSync(path.join(tmpdir(), "bori-promo-"));
const framesDir = path.join(work, "frames");
mkdirSync(framesDir);
const frameFile = (f) => path.join(framesDir, `f${String(f).padStart(4, "0")}.png`);

// 1. frames and soundtrack, from the page
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${url}${url.includes("?") ? "&" : "?"}lang=en#play`);
await page.evaluate(() => document.fonts.ready);
await page.addScriptTag({ path: path.join(here, "promo.js") });
await page.evaluate(() => PROMO.init());
const { TOTAL, FPS, COVER } = await page.evaluate(() => ({ TOTAL: PROMO.TOTAL, FPS: PROMO.FPS, COVER: PROMO.COVER }));
for (let f = 0; f < TOTAL; f++) {
  const data = await page.evaluate((n) => PROMO.frameDataURL(n), f);
  writeFileSync(frameFile(f), Buffer.from(data.split(",")[1], "base64"));
  if ((f + 1) % 150 === 0) console.log(`frames ${f + 1}/${TOTAL}`);
}
const audio = await page.evaluate(() => PROMO.renderAudio());
const wav = path.join(work, "audio.wav");
writeFileSync(wav, Buffer.from(audio.b64, "base64"));
await browser.close();
if (errors.length) throw new Error(`the page reported errors:\n  ${errors.join("\n  ")}`);

const cover = path.join(out, "bori-island-promo-cover.png");
copyFileSync(frameFile(COVER), cover);
console.log("wrote", path.relative(process.cwd(), cover));

// 2. encode
const mp4 = path.join(out, "bori-island-promo.mp4");
const video = [
  "-framerate", String(FPS), "-i", path.join(framesDir, "f%04d.png"), "-i", wav,
  // nearest-neighbor keeps the 4× pixels square; BT.709 is what players assume for HD
  "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=neighbor+full_chroma_int+accurate_rnd,format=yuv420p",
  "-c:v", "libx264", "-preset", "slow", "-tune", "animation", "-crf", "12", "-profile:v", "high", "-level:v", "4.0", "-g", "60",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
];
const ffmpeg = (args) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
if (ffmpeg(["-version"]).status !== 0) {
  console.log(`ffmpeg was not found. The frames and the soundtrack are in ${work}. To finish:`);
  console.log(`  ffmpeg ${[...video, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4].map((a) => (/[\s;]/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
  process.exit(1);
}
// two passes: measure the loudness, then apply one linear gain to -14 LUFS, where most platforms play
const target = "I=-14:TP=-1.5:LRA=11";
const measured = ffmpeg(["-i", wav, "-af", `loudnorm=${target}:print_format=json`, "-f", "null", "-"]);
const m = JSON.parse(measured.stderr.slice(measured.stderr.lastIndexOf("{")));
const loudnorm = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
  `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
const enc = ffmpeg(["-loglevel", "error", "-y", ...video, "-af", loudnorm, "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-shortest", "-movflags", "+faststart", mp4]);
if (enc.status !== 0) throw new Error(`ffmpeg failed:\n${enc.stderr}`);
rmSync(work, { recursive: true, force: true });
console.log("wrote", path.relative(process.cwd(), mp4));
