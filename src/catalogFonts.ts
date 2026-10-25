// فونت‌های قابل انتخاب برای خروجی کاتالوگ — هم‌خانواده با همه وزن‌های باندل‌شده در index.css
export interface CatalogFont {
  id: string;
  name: string;
  family: string;
}

export const CATALOG_FONTS: CatalogFont[] = [
  { id: "iransansx", name: "ایران‌سنس ایکس", family: "IRANSansX" },
  { id: "dana", name: "دانا", family: "DanaFaNum" },
  { id: "iransansdn", name: "ایران‌سنس دی‌ان", family: "IRANSansDN" },
  { id: "samim", name: "صمیم", family: "Samim" },
  { id: "shabnam", name: "شبنم", family: "Shabnam" },
  { id: "vazir", name: "وزیر", family: "Vazir" },
  { id: "yekanbakh", name: "یکان‌بک", family: "YekanBakh" },
];
