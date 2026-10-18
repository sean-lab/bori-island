#!/usr/bin/env node
// Bundles src/ into one self-contained HTML page.
//
//   node scripts/build.mjs                      → dist/index.html (full document, opens in English)
//   node scripts/build.mjs --lang=ko            → opens in Korean when the URL has no ?lang=
//   node scripts/build.mjs --fragment --out=…   → body fragment only, for hosts that supply <html>/<head>
//
// No dependencies: the page is plain HTML, CSS and JavaScript.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};
const lang = arg("lang", "en");
const fragment = arg("fragment", false) === true;
const out = path.resolve(root, arg("out", "dist/index.html"));
if (!["en", "ko"].includes(lang)) throw new Error(`--lang must be en or ko, got ${lang}`);

const read = (p) => readFileSync(path.join(root, p), "utf8");
const shell = read("src/shell.html");
const css = read("src/style.css");
const jsFiles = readdirSync(path.join(root, "src/js")).filter((f) => f.endsWith(".js")).sort();
const js = jsFiles.map((f) => read(`src/js/${f}`)).join("\n");
const chapterFiles = readdirSync(path.join(root, "src/chapters")).filter((f) => f.endsWith(".html")).sort();
const chapters = chapterFiles.map((f) => read(`src/chapters/${f}`)).join("\n\n");

if (/<\/script/i.test(js)) throw new Error("A script file contains '</script', which would end the inline <script> early.");

const META = {
  en: {
    title: "Bori Island Dev Notes",
    desc: "Build a Wonder Boy-style 8-bit side-scroller from an empty canvas: game loop, sprites, tile maps, authoring tools, chip sound, physics, state machines, and how 1980s hardware compares with today's. Every chapter is interactive.",
  },
  ko: {
    title: "보리 섬 개발 노트",
    desc: "원더보이 스타일 8비트 횡스크롤 액션을 빈 캔버스부터 만드는 인터랙티브 개발 노트. 게임 루프, 스프라이트, 타일맵, 저작 도구, 칩 사운드, 물리, 상태 기계, 그리고 80년대 하드웨어와 지금의 차이까지.",
  },
};

// Runs before the page content is parsed, so the right language shows on the first paint.
const boot = `(function(){var l=${JSON.stringify(lang)};try{var q=new URLSearchParams(location.search).get('lang');` +
  `if(q==='ko'||q==='en')l=q;else{var s=localStorage.getItem('bori:lang');if(s){s=JSON.parse(s);if(s==='ko'||s==='en')l=s;}}}catch(e){}` +
  `var h=document.documentElement;h.setAttribute('data-lang',l);h.lang=l;window.BORI_LANG=l;` +
  `document.title=l==='en'?${JSON.stringify(META.en.title)}:${JSON.stringify(META.ko.title)};})();`;

const [headTpl, bodyTpl] = shell.split("<!--BODY-->");
if (!bodyTpl) throw new Error("src/shell.html needs a <!--BODY--> marker");
const head = headTpl
  .replace("<!--HEAD-->", "")
  .replace("@@TITLE@@", META[lang].title)
  .replace("@@DESC@@", META[lang].desc)
  .replace("/*@@CSS@@*/", () => css)
  .trim();
const body = bodyTpl
  .replace("/*@@BOOT@@*/", () => boot)
  .replace("<!--@@CHAPTERS@@-->", () => chapters)
  .replace("//@@JS@@", () => js)
  .trim();

const html = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="${lang}" data-lang="${lang}">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${path.relative(root, out)} · ${lang}${fragment ? " · fragment" : ""} · ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB · ${jsFiles.length} scripts · ${chapterFiles.length} chapters`);
