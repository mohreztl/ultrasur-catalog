// Catalog color palettes for the PDF/catalog pages.
// Palette "gold" is derived from the ariyatechno logo artwork (LOGO-2):
// gold #d3b069, dark gray #4c4c4c, silver #b4b3b3 on black.
import type { CSSProperties } from "react";

export interface CatalogPalette {
  id: string;
  name: string;
  /** main swatch color shown in the picker */
  swatch: string;
  /** picker chip background */
  swatchBg: string;
  /** page background (content/TOC pages) */
  bg: string;
  /** cover/back-cover background */
  bgAlt: string;
  /** header bars, chips, TOC rows */
  surface: string;
  /** product print-card background */
  card: string;
  /** product image frame background */
  imageBox: string;
  /** strong borders / rules */
  border: string;
  /** hairline borders */
  borderSoft: string;
  /** TOC dotted leader */
  dotted: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  accentBg: string;
  accentBorder: string;
  onAccent: string;
  priceText: string;
  priceBorder: string;
  priceGradient: string;
  logoGradient: string;
}

export const CATALOG_PALETTES: CatalogPalette[] = [
  {
    id: "gold",
    name: "طلایی لوگو",
    swatch: "#d3b069",
    swatchBg: "#161616",
    bg: "#0a0a0a",
    bgAlt: "#0d0d0d",
    surface: "#161616",
    card: "#141414",
    imageBox: "#101010",
    border: "#2a2a2a",
    borderSoft: "#202020",
    dotted: "#4a4a4a",
    text: "#f4f2ed",
    muted: "#b4b3b3",
    faint: "#7a7a7a",
    accent: "#d3b069",
    accentSoft: "#e0c489",
    accentBg: "#2a2213",
    accentBorder: "#6b5730",
    onAccent: "#0a0a0a",
    priceText: "#d3b069",
    priceBorder: "#6b5730",
    priceGradient:
      "linear-gradient(to left, #2a2213, #1a1610 55%, transparent)",
    logoGradient: "linear-gradient(135deg, #e0c489, #d3b069 55%, #c09a4e)",
  },
  {
    id: "royal",
    name: "سرمه‌ای و طلایی",
    swatch: "#d3b069",
    swatchBg: "#142942",
    bg: "#0d1b2e",
    bgAlt: "#10203a",
    surface: "#142942",
    card: "#13273e",
    imageBox: "#0b1626",
    border: "#24425f",
    borderSoft: "#1c3350",
    dotted: "#3a5573",
    text: "#eaf1f8",
    muted: "#a8b8c8",
    faint: "#6e8296",
    accent: "#d3b069",
    accentSoft: "#e2c78f",
    accentBg: "#2b2c20",
    accentBorder: "#6b5730",
    onAccent: "#0d1b2e",
    priceText: "#e2c78f",
    priceBorder: "#6b5730",
    priceGradient:
      "linear-gradient(to left, #2b2c20, #1a2438 55%, transparent)",
    logoGradient: "linear-gradient(135deg, #e2c78f, #d3b069 55%, #c09a4e)",
  },
  {
    id: "light",
    name: "نقره‌ای روشن",
    swatch: "#a8862f",
    swatchBg: "#ffffff",
    bg: "#f3f2ef",
    bgAlt: "#fafaf8",
    surface: "#ffffff",
    card: "#ffffff",
    imageBox: "#edebe6",
    border: "#d9d6cf",
    borderSoft: "#e3e0d9",
    dotted: "#c4bfb4",
    text: "#2e2e2e",
    muted: "#5c5c5c",
    faint: "#8a8a8a",
    accent: "#a8862f",
    accentSoft: "#8f6f22",
    accentBg: "#f0e7cf",
    accentBorder: "#c9a961",
    onAccent: "#ffffff",
    priceText: "#7a5e14",
    priceBorder: "#a8862f",
    priceGradient:
      "linear-gradient(to left, #f0e7cf, #f7f2e4 55%, transparent)",
    logoGradient: "linear-gradient(135deg, #d3b069, #a8862f 55%, #8f6f22)",
  },
  {
    id: "espresso",
    name: "برنزی گرم",
    swatch: "#d3b069",
    swatchBg: "#221b12",
    bg: "#17120c",
    bgAlt: "#1c1610",
    surface: "#221b12",
    card: "#20190f",
    imageBox: "#120d08",
    border: "#3a2f20",
    borderSoft: "#2c2418",
    dotted: "#5a4a32",
    text: "#f1e9da",
    muted: "#c0b49c",
    faint: "#8a7b62",
    accent: "#d3b069",
    accentSoft: "#e2c78f",
    accentBg: "#2e2413",
    accentBorder: "#6b5730",
    onAccent: "#17120c",
    priceText: "#e2c78f",
    priceBorder: "#6b5730",
    priceGradient:
      "linear-gradient(to left, #2e2413, #221a10 55%, transparent)",
    logoGradient: "linear-gradient(135deg, #e2c78f, #d3b069 55%, #c09a4e)",
  },
  {
    id: "graphite",
    name: "زغالی نقره‌ای",
    swatch: "#b4b3b3",
    swatchBg: "#1e222a",
    bg: "#15171c",
    bgAlt: "#191c22",
    surface: "#1e222a",
    card: "#1c2027",
    imageBox: "#111318",
    border: "#333842",
    borderSoft: "#282c34",
    dotted: "#4a505a",
    text: "#eceef2",
    muted: "#9ba0a8",
    faint: "#6a7078",
    accent: "#b4b3b3",
    accentSoft: "#d0cfcf",
    accentBg: "#2a2d33",
    accentBorder: "#5a5f68",
    onAccent: "#15171c",
    priceText: "#d0cfcf",
    priceBorder: "#5a5f68",
    priceGradient:
      "linear-gradient(to left, #2a2d33, #22252b 55%, transparent)",
    logoGradient: "linear-gradient(135deg, #d0cfcf, #b4b3b3 55%, #8e8d8d)",
  },
];

export type CatalogStyleKey =
  | "cover"
  | "page"
  | "line"
  | "rule"
  | "logoBig"
  | "logoTile"
  | "text"
  | "accent"
  | "accentSoft"
  | "muted"
  | "faint"
  | "chipSolid"
  | "chipSoft"
  | "chipAccent"
  | "gridCard"
  | "row"
  | "card"
  | "imageBox"
  | "brandChip"
  | "badgeChip"
  | "bullet"
  | "dotted"
  | "pageBadge"
  | "priceBox"
  | "priceLabel"
  | "priceValue"
  | "footerBrand";

/** Literal inline styles per catalog element — inline colors render reliably in html2canvas. */
export function catalogStyles(
  p: CatalogPalette,
): Record<CatalogStyleKey, CSSProperties> {
  return {
    cover: { backgroundColor: p.bgAlt, color: p.text },
    page: { backgroundColor: p.bg, color: p.text },
    line: { borderColor: p.borderSoft },
    rule: { borderColor: p.border, color: p.muted },
    logoBig: { background: p.logoGradient, color: p.onAccent },
    logoTile: { backgroundColor: p.accent, color: p.onAccent },
    text: { color: p.text },
    accent: { color: p.accent },
    accentSoft: { color: p.accentSoft },
    muted: { color: p.muted },
    faint: { color: p.faint },
    chipSolid: {
      backgroundColor: p.surface,
      borderColor: p.border,
      color: p.text,
    },
    chipSoft: {
      backgroundColor: p.surface,
      borderColor: p.border,
      color: p.muted,
    },
    chipAccent: {
      backgroundColor: p.accentBg,
      borderColor: p.accentBorder,
      color: p.accentSoft,
    },
    gridCard: { backgroundColor: p.surface, borderColor: p.border },
    row: { backgroundColor: p.surface, borderColor: p.border },
    card: { backgroundColor: p.card, borderColor: p.border },
    imageBox: { backgroundColor: p.imageBox, borderColor: p.border },
    brandChip: {
      backgroundColor: p.accentBg,
      borderColor: p.accentBorder,
      color: p.accentSoft,
    },
    badgeChip: {
      backgroundColor: p.surface,
      borderColor: p.border,
      color: p.muted,
    },
    bullet: { color: p.accent },
    dotted: { borderColor: p.dotted },
    pageBadge: {
      backgroundColor: p.accentBg,
      borderColor: p.accentBorder,
      color: p.accentSoft,
    },
    priceBox: { background: p.priceGradient, borderColor: p.priceBorder },
    priceLabel: { color: p.muted },
    priceValue: { color: p.priceText },
    footerBrand: { color: p.accent },
  };
}
