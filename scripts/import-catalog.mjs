#!/usr/bin/env node
/**
 * Regenerates src/catalogProducts.ts from two sources:
 *   1. WordPress/WooCommerce export (WXR) items JSON  -> shop products + images
 *   2. UltraSur.pdf extraction JSON + carved objects   -> catalog products + images
 *
 * Inputs are produced by the offline extraction helpers and passed in by path
 * (defaults point at the analysis workspace). Rerunnable: existing image files
 * are skipped, so a rerun only fetches what is missing.
 *
 * Usage:
 *   node scripts/import-catalog.mjs [--wp path] [--pdf path] [--objs dir]
 *                                   [--out file] [--images dir]
 */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const TMP = process.env.TEMP || process.env.TMPDIR || "/tmp";
const analysisDir = path.join(TMP, "opencode");
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const WP_ITEMS = argValue("--wp", path.join(analysisDir, "wp-items.json"));
const PDF_PRODUCTS = argValue(
  "--pdf",
  path.join(analysisDir, "ultrasur-products.json"),
);
const PDF_OBJS = argValue("--objs", path.join(analysisDir, "ultrasur-objs"));
const PDF_DRAWS = argValue(
  "--draws",
  path.join(analysisDir, "ultrasur-draws.json"),
);
const OUT_TS = argValue(
  "--out",
  path.join(repoRoot, "src", "catalogProducts.ts"),
);
const IMAGES_DIR = argValue(
  "--images",
  path.join(repoRoot, "public", "images"),
);

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit RGB) for FlateDecode objects carved as raw pixels.
// ---------------------------------------------------------------------------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
};

const pngChunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const encodePng = (rgb, width, height) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
};

// ---------------------------------------------------------------------------
// Text normalization (Persian labels come with mixed Arabic/Persian letters
// and zero-width non-joiners; normalize before matching).
// ---------------------------------------------------------------------------
const norm = (s) =>
  String(s ?? "")
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// ---------------------------------------------------------------------------
// Category mapping (ids must match CATEGORIES in src/App.tsx)
// ---------------------------------------------------------------------------
const BUCKETS = new Set(["کابل و شارژر", "هدفون و هندزفری"]);

/** Priority rules over every non-bucket product_cat label. */
const SPECIFIC_RULES = [
  ["holder", (l) => l.startsWith("هولدر")],
  ["airpods", (l) => l.includes("ایرپاد") || l.includes("هندزفری بلوتوثی")],
  ["neckband", (l) => l.includes("هدفون پشت گردنی")],
  [
    "wired-earphone",
    (l) => l.includes("هندزفری سیم") || l.includes("هدفون سیم"),
  ],
  ["headphone", (l) => l.includes("هدفون بی سیم") || l.includes("هدست گیمینگ")],
  ["smartwatch", (l) => l.includes("ساعت هوشمند")],
  ["powerbank", (l) => l.includes("پاوربانک") || l.includes("پاور بانک")],
  ["car-charger", (l) => l.includes("فندکی")],
  [
    "charger",
    (l) =>
      l.includes("شارژر وایرلس") ||
      l.startsWith("شارژر دیواری") ||
      l.includes("آداپتور شارژ"),
  ],
  ["aux-cable", (l) => l.includes("ایوایکس") || l.includes("aux")],
  ["cables", (l) => l.includes("کابل")],
  ["speaker-acc", (l) => l.includes("اسپیکر")],
  [
    "computer-acc",
    (l) =>
      l.includes("فلش") ||
      l.includes("دانگل") ||
      l.includes("مبدل") ||
      l.includes("otg") ||
      l.includes("او جی") ||
      l.includes("محصولات کامپیوتری") ||
      l.includes("موس") ||
      l.includes("هاب") ||
      l.includes("میکروفون"),
  ],
];

/** Labels that are explicitly "everything else". */
const OTHER_RULES = [
  [
    "other",
    (l) =>
      l.includes("گجت") ||
      l.includes("قاب") ||
      l.includes("گلس") ||
      l.includes("عینک") ||
      l.includes("باطری") ||
      l.includes("چراغ") ||
      l.includes("چند راهی") ||
      l.includes("کپسولی") ||
      l.startsWith("سایر"),
  ],
];

/** Last-resort title keywords, in priority order. */
const TITLE_RULES = [
  ["holder", (t) => t.includes("هولدر")],
  ["airpods", (t) => t.includes("ایرپاد")],
  ["neckband", (t) => t.includes("گردنی")],
  ["powerbank", (t) => t.includes("پاور")],
  ["car-charger", (t) => t.includes("فندکی")],
  ["aux-cable", (t) => t.includes("ایوایکس") || t.includes("aux")],
  ["cables", (t) => t.includes("کابل")],
  ["charger", (t) => t.includes("شارژر")],
  ["wired-earphone", (t) => t.includes("هندزفری")],
  ["headphone", (t) => t.includes("هدفون")],
  ["smartwatch", (t) => t.includes("ساعت")],
  ["speaker-acc", (t) => t.includes("اسپیکر")],
  [
    "computer-acc",
    (t) =>
      ["فلش", "موس", "هاب", "مبدل", "دانگل", "otg", "میکروفون"].some((k) =>
        t.includes(k),
      ),
  ],
];

const bucketCategory = (bucket, title) => {
  if (bucket === "کابل و شارژر") {
    if (title.includes("ایوایکس") || title.includes("aux")) return "aux-cable";
    if (title.includes("کابل")) return "cables";
    if (title.includes("شارژر")) return "charger";
    return "cables";
  }
  if (title.includes("گردنی")) return "neckband";
  if (
    title.includes("ایرپاد") ||
    title.includes("بلوتوث") ||
    title.includes("tws")
  )
    return "airpods";
  if (title.includes("هدفون")) return "headphone";
  return "wired-earphone";
};

const classifyWp = (rawLabels, rawTitle) => {
  const labels = rawLabels.map(norm);
  const title = norm(rawTitle);
  const buckets = labels.filter((l) => BUCKETS.has(l));
  const specific = labels.filter((l) => !BUCKETS.has(l));
  for (const [id, test] of SPECIFIC_RULES) {
    if (specific.some(test)) return id;
  }
  if (buckets.length > 0) return bucketCategory(buckets[0], title);
  for (const [id, test] of OTHER_RULES) {
    if (labels.some(test)) return id;
  }
  for (const [id, test] of TITLE_RULES) {
    if (test(title)) return id;
  }
  return "other";
};

/** PDF products sit in fixed catalog sections, keyed by page number. */
const classifyPdf = (page, rawTitle) => {
  const title = norm(rawTitle);
  if (page <= 4) return "powerbank";
  if (page <= 6) return "airpods";
  if (page <= 8) return "smartwatch";
  if (page <= 10) return "car-charger";
  if (page <= 12) return "aux-cable";
  if (page <= 18) return "cables";
  if (page <= 20) return "wired-earphone";
  if (page <= 22) return "neckband";
  if (page <= 24) return "holder";
  return title.includes("هدفون") ? "headphone" : "speaker-acc";
};

// ---------------------------------------------------------------------------
// Attribute specs (WP pa_* terms)
// ---------------------------------------------------------------------------
const ATTR_SPEC_LABELS = {
  pa_color: "رنگ",
  "pa_cable-brand": "برند کابل",
  "pa_charger-brand": "برند شارژر",
  "pa_airpods-brand": "برند ایرپاد",
  "pa_handsfree-brand": "برند هندزفری",
  "pa_power-bank-brand": "برند پاوربانک",
};

const modelCode = (title) => {
  const m = norm(title).match(/u-[a-z0-9+]+|hs\d+/);
  return m ? m[0].toUpperCase() : "";
};

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------
const readJson = async (file, hint) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ${hint} at ${file}: ${err.message}`);
  }
};

const wpItems = await readJson(WP_ITEMS, "WordPress items JSON");
const pdfProducts = await readJson(PDF_PRODUCTS, "UltraSur PDF products JSON");

// Pixel dimensions of every image draw (used to rebuild FlateDecode objects).
const drawDims = new Map();
const pdfDraws = await readJson(PDF_DRAWS, "UltraSur PDF draws JSON");
for (const page of pdfDraws) {
  for (const im of page.draws || page.images || []) {
    if (im.objNum != null && im.pixW && im.pixH) {
      drawDims.set(im.objNum, { w: im.pixW, h: im.pixH });
    }
  }
}

const attachments = new Map();
const rawProducts = [];
for (const item of wpItems) {
  if (item.type === "attachment") {
    attachments.set(String(item.id), item);
  } else if (item.type === "product") {
    rawProducts.push(item);
  }
}

// ---------------------------------------------------------------------------
// Build PDF products (they win dedupe against WP)
// ---------------------------------------------------------------------------
const pdfCodeKeys = new Set();
const pdfOut = [];
const usedIds = new Set();
for (const p of pdfProducts) {
  const code = modelCode(p.title);
  if (code) pdfCodeKeys.add(code);
  let id = code ? `us-${code.toLowerCase()}` : `us-p${p.page}`;
  while (usedIds.has(id)) id += "-2";
  usedIds.add(id);
  const photo =
    Array.isArray(p.photos) && p.photos.length > 0 ? p.photos[0] : null;
  pdfOut.push({
    id,
    category: classifyPdf(p.page, p.title),
    title: p.title,
    brand: "UltraSur",
    price: Math.floor(Number(p.price) || 0),
    image: photo
      ? `images/ultrasur/obj-${photo.objNum}.jpg`
      : "images/placeholder.svg",
    specs: Array.isArray(p.specs) ? p.specs : [],
  });
}

// ---------------------------------------------------------------------------
// Build WP products (skip trash and PDF duplicates)
// ---------------------------------------------------------------------------
const wpOut = [];
const wpImageJobs = new Map(); // thumbId -> { destName, urls[] }
let skippedTrash = 0;
let skippedDupe = 0;
let noThumb = 0;

for (const item of rawProducts) {
  if (item.status === "trash") {
    skippedTrash += 1;
    continue;
  }
  const metas = item.metas || {};
  const code = modelCode(item.title);
  if (code && pdfCodeKeys.has(code)) {
    skippedDupe += 1;
    continue;
  }

  const catLabels = (item.cats || [])
    .filter((c) => c.domain === "product_cat")
    .map((c) => c.label);
  const attrTerms = (item.cats || []).filter((c) =>
    (c.domain || "").startsWith("pa_"),
  );

  const price = Math.floor(Number(metas._price) || 0);

  const specs = [];
  for (const term of attrTerms) {
    const key =
      ATTR_SPEC_LABELS[term.domain] || term.domain.replace(/^pa_/, "");
    specs.push(`${key}: ${term.label}`);
  }

  let brand = "";
  const brandTerm = attrTerms.find((t) => (t.domain || "").endsWith("-brand"));
  if (brandTerm) brand = brandTerm.label;

  const thumbId = String(metas._thumbnail_id || "").trim();
  let image = "images/placeholder.svg";
  if (thumbId) {
    const att = attachments.get(thumbId);
    if (att && att.attachmentUrl) {
      const original = att.attachmentUrl;
      const variant = original.replace(
        /(\.[a-z0-9]+)(\?.*)?$/i,
        "-1024x1024$1",
      );
      const ext = (variant.match(/\.([a-z0-9]+)$/i) || [
        null,
        "jpg",
      ])[1].toLowerCase();
      const destName = `${thumbId}.${ext}`;
      image = `images/wp/${destName}`;
      if (!wpImageJobs.has(thumbId)) {
        wpImageJobs.set(thumbId, {
          destName,
          urls: variant !== original ? [variant, original] : [original],
        });
      }
    } else {
      noThumb += 1;
    }
  } else {
    noThumb += 1;
  }

  wpOut.push({
    id: `wp-${item.id}`,
    category: classifyWp(catLabels, item.title),
    title: item.title,
    brand,
    price,
    image,
    specs,
  });
}

const products = [...wpOut, ...pdfOut];

// ---------------------------------------------------------------------------
// Category statistics
// ---------------------------------------------------------------------------
const counts = {};
for (const p of products) counts[p.category] = (counts[p.category] || 0) + 1;

// ---------------------------------------------------------------------------
// Images: download WP thumbs, copy PDF objects
// ---------------------------------------------------------------------------
const wpDir = path.join(IMAGES_DIR, "wp");
const usDir = path.join(IMAGES_DIR, "ultrasur");
await fs.mkdir(wpDir, { recursive: true });
await fs.mkdir(usDir, { recursive: true });

const failures = [];

const fetchTo = async (urls, dest) => {
  const attemptsLog = [];
  for (const url of urls) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "user-agent": "ultrasur-catalog-import/1.0" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 200) throw new Error(`suspicious size ${buf.length}`);
        await fs.writeFile(dest, buf);
        clearTimeout(timer);
        return true;
      } catch (err) {
        clearTimeout(timer);
        attemptsLog.push(`${url} -> ${err.message}`);
      }
    }
  }
  failures.push(attemptsLog.join(" | "));
  return false;
};

const jobs = [...wpImageJobs.values()].filter(
  (job) =>
    job.destName.endsWith(".webp") ||
    job.destName.endsWith(".jpg") ||
    job.destName.endsWith(".png"),
);
let downloaded = 0;
let skippedExisting = 0;
const CONCURRENCY = 8;
for (let i = 0; i < jobs.length; i += CONCURRENCY) {
  const batch = jobs.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (job) => {
      const dest = path.join(wpDir, job.destName);
      try {
        const st = await fs.stat(dest);
        if (st.size > 200) {
          skippedExisting += 1;
          return;
        }
      } catch {
        /* not present yet */
      }
      const ok = await fetchTo(job.urls, dest);
      if (ok) downloaded += 1;
    }),
  );
}

// Copy every referenced PDF photo object.
const pdfObjs = new Set();
for (const p of products) {
  const m = /^images\/ultrasur\/obj-(\d+)\.jpg$/.exec(p.image || "");
  if (m) pdfObjs.add(m[1]);
}
let copied = 0;
for (const n of pdfObjs) {
  const src = path.join(PDF_OBJS, `obj-${n}.jpg`);
  const dest = path.join(usDir, `obj-${n}.jpg`);
  try {
    const st = await fs.stat(dest);
    if (st.size > 200) {
      copied += 1;
      continue;
    }
  } catch {
    /* not present yet */
  }
  try {
    await fs.copyFile(src, dest);
    copied += 1;
  } catch {
    // FlateDecode objects were carved as raw zlib streams; convert RGB → PNG.
    const rawPath = path.join(PDF_OBJS, `obj-${n}.raw`);
    let ok = false;
    try {
      const inf = zlib.inflateSync(await fs.readFile(rawPath));
      const draw = drawDims.get(Number(n));
      if (draw && inf.length === draw.w * draw.h * 3) {
        await fs.writeFile(dest, encodePng(inf, draw.w, draw.h));
        copied += 1;
        ok = true;
      }
    } catch {
      /* handled below */
    }
    if (!ok) {
      failures.push(`PDF obj-${n}.jpg -> missing carved JPEG`);
      for (const p of products) {
        if (p.image === `images/ultrasur/obj-${n}.jpg`)
          p.image = "images/placeholder.svg";
      }
    }
  }
}

// Final pass: any product still pointing at a missing file falls back to the
// placeholder so the UI/PDF never renders a broken <img>.
let missingRefs = 0;
for (const p of products) {
  const m = /^images\/(wp|ultrasur)\/(.+)$/.exec(p.image || "");
  if (!m) continue;
  const dir = m[1] === "wp" ? wpDir : usDir;
  try {
    const st = await fs.stat(path.join(dir, m[2]));
    if (st.size > 200) continue;
  } catch {
    /* fall through */
  }
  p.image = "images/placeholder.svg";
  missingRefs += 1;
}

// ---------------------------------------------------------------------------
// Emit src/catalogProducts.ts
// ---------------------------------------------------------------------------
const header = `// AUTO-GENERATED by scripts/import-catalog.mjs — DO NOT EDIT.
// Sources: WordPress export (shop) + UltraSur.pdf (catalog price list).
import type { Product } from "./App";

export const CATALOG_PRODUCTS: Product[] = `;
await fs.writeFile(
  OUT_TS,
  `${header}${JSON.stringify(products, null, 2)};\n`,
  "utf8",
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const report = {
  wpProducts: wpOut.length,
  pdfProducts: pdfOut.length,
  total: products.length,
  skippedTrash,
  skippedDupe,
  wpWithoutImage: noThumb,
  categoryCounts: counts,
  images: { downloaded, skippedExisting, pdfCopied: copied, missingRefs },
  failures,
};
await fs.writeFile(
  path.join(analysisDir, "import-report.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);
console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  throw new Error(
    `${failures.length} image transfer(s) failed — rerun to retry`,
  );
}
