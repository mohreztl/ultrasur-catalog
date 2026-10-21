import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Printer,
  RotateCcw,
  Download,
  Check,
  X,
  Eye,
  Upload,
  Smartphone,
  BatteryCharging,
  Headphones,
  Watch,
  Car,
  Cable,
  Sliders,
  Tag,
  Info,
  Layers,
  Database,
  FileDown,
  FileUp,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import initSqlJs, {
  type Database as SqlJsDatabase,
  type SqlJsStatic,
} from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

interface Product {
  id: string;
  category: string;
  title: string;
  capacity?: string;
  price: number;
  badge?: string;
  image?: string;
  specs?: string[];
}

type SyncStatus = "connecting" | "synced" | "saving" | "error";

const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    capacity TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    badge TEXT,
    image TEXT,
    specs TEXT NOT NULL DEFAULT '[]'
  );
`;

// پایداری دیتابیس SQLite (باینری خروجی sql.js) در IndexedDB مرورگر
const IDB_NAME = "ultrasur_catalog";
const IDB_STORE = "sqlite_db";
const IDB_KEY = "main";

const openIdb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const loadPersistedDb = async (): Promise<Uint8Array | null> => {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const req = idb
      .transaction(IDB_STORE, "readonly")
      .objectStore(IDB_STORE)
      .get(IDB_KEY);
    req.onsuccess = () =>
      resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
};

const persistDb = async (bytes: Uint8Array): Promise<void> => {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const readAllProducts = (db: SqlJsDatabase): Product[] => {
  const result = db.exec(
    "SELECT id, category, title, capacity, price, badge, image, specs FROM products",
  );
  if (result.length === 0) return [];
  return result[0].values.map((row) => ({
    id: String(row[0]),
    category: String(row[1]),
    title: String(row[2]),
    capacity: (row[3] as string) || "",
    price: Number(row[4]) || 0,
    badge: (row[5] as string) || "",
    image: (row[6] as string) || "",
    specs: JSON.parse(String(row[7] || "[]")) as string[],
  }));
};

const seedProducts = (db: SqlJsDatabase, products: Product[]): void => {
  db.run("BEGIN");
  for (const p of products) {
    db.run(
      "INSERT INTO products (id, category, title, capacity, price, badge, image, specs) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        p.id,
        p.category,
        p.title,
        p.capacity ?? "",
        p.price,
        p.badge ?? "",
        p.image ?? "",
        JSON.stringify(p.specs ?? []),
      ],
    );
  }
  db.run("COMMIT");
};

// دسته‌بندی‌های پیش‌فرض منطبق بر فهرست کاتالوگ UltraSur
const CATEGORIES = [
  { id: "all", name: "همه محصولات", icon: Layers },
  { id: "powerbank", name: "پاور بانک", icon: BatteryCharging },
  { id: "airpods", name: "ایرپاد و هندزفری بلوتوث", icon: Headphones },
  { id: "smartwatch", name: "ساعت هوشمند", icon: Watch },
  { id: "car-charger", name: "شارژر فندکی", icon: Car },
  { id: "aux-cable", name: "کابل AUX", icon: Cable },
  { id: "cables", name: "کابل‌های شارژ سریع", icon: Cable },
  { id: "wired-earphone", name: "هندزفری سیمی", icon: Headphones },
  { id: "neckband", name: "هندزفری گردنی", icon: Headphones },
  { id: "holder", name: "هولدر ۳۶۰ درجه", icon: Smartphone },
  { id: "speaker-acc", name: "اسپیکر و هدفون", icon: Headphones },
];

// دیتابیس اولیه استخراج‌شده دقیق از کاتالوگ ultrasur.pdf
const INITIAL_PRODUCTS: Product[] = [
  {
    id: "p1",
    category: "powerbank",
    title: "پاور بانک مدل U-P10",
    capacity: "۲۰,۰۰۰ میلی‌آمپر ساعت",
    specs: [
      "ظرفیت: ۲۰۰۰۰ میلی آمپر ساعت",
      "تعداد درگاه‌های خروجی: ۳ عدد",
      "دو درگاه USB با شارژ سریع QC3.0",
      "یک درگاه تایپ‌سی ۲۲.۵ وات خروجی PD",
      "دارای نمایشگر درصد شارژ باتری LED",
    ],
    price: 1480000,
    badge: "22.5W Fast Charge",
    image:
      "https://images.unsplash.com/photo-1609592426365-1886861611d2?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p2",
    category: "powerbank",
    title: "پاور بانک مدل U-P4",
    capacity: "۲۰,۰۰۰ میلی‌آمپر ساعت",
    specs: [
      "ظرفیت: ۲۰۰۰۰ میلی آمپر ساعت",
      "ورودی تایپ‌سی فست‌شارژ و میکرو نرمال",
      "خروجی USB دو عدد QC3.0",
      "خروجی PD: یک عدد ۲۲.۵ وات توان خروجی",
      "دارای نمایشگر دقیق دیجیتال درصد شارژ",
    ],
    price: 1580000,
    badge: "High Performance",
    image:
      "https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p3",
    category: "powerbank",
    title: "پاور بانک مدل U-P8",
    capacity: "۲۰,۰۰۰ میلی‌آمپر ساعت",
    specs: [
      "ظرفیت باتری: ۲۰۰۰۰ میلی آمپر",
      "پورت‌های USB: دو پورت با شارژ سریع QC3.0",
      "پورت Type-C: یک پورت با توان خروجی ۲۲.۵W PD",
      "ورودی شارژ فست از طریق پورت Type-C",
      "دارای نمایشگر اختصاصی درصد شارژ",
    ],
    price: 1520000,
    badge: "QC 3.0 + PD",
    image:
      "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p4",
    category: "powerbank",
    title: "پاور بانک وایرلس مگ‌سیف U-PW5",
    capacity: "۱۰,۰۰۰ میلی‌آمپر ساعت",
    specs: [
      "ظرفیت: ۱۰,۰۰۰ میلی آمپر ساعت",
      "شارژ بی‌سیم مگ‌سیف MagSafe + پایه نگهدارنده تاشو",
      "توان خروجی شارژ بی سیم: ۱۵ وات واقعی",
      "درگاه خروجی PD تایپ‌سی ۲۲.۵ وات",
      "درگاه خروجی USB QC3.0",
    ],
    price: 1688000,
    badge: "Wireless MagSafe 15W",
    image:
      "https://images.unsplash.com/photo-1618478594486-c65b899c4936?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "p5",
    category: "powerbank",
    title: "پاور بانک مدل U-P9 (بدنه تمام فلزی)",
    capacity: "۲۰,۰۰۰ میلی‌آمپر ساعت",
    specs: [
      "ظرفیت باتری ۲۰۰۰۰ میلی آمپر ساعت",
      "جنس بدنه آلومینیوم مات مقاوم + نمایشگر دیجیتال",
      "دو پورت USB خروجی با فناوری کوالکام QC3.0",
      "پورت ورودی/خروجی Type-C با توان ۲۲.۵ وات",
      "پورت ورودی جانبی میکرو USB",
    ],
    price: 1620000,
    badge: "Full Metal Body",
    image:
      "https://images.unsplash.com/photo-1585338107529-13afc5f02586?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "e1",
    category: "airpods",
    title: "ایرپاد بلوتوثی مدل U-E10",
    capacity: "باتری ۳۳۰mAh",
    specs: [
      "حذف نویز فعال هیبریدی (Active Noise Cancelling - ANC)",
      "ظرفیت باتری هر ایرباد: ۳۰ میلی آمپر ساعت",
      "ظرفیت باتری کیس شارژ: ۳۰۰ میلی آمپر ساعت",
      "درگاه شارژ سریع Type-C به همراه نشانگر وضعیت",
      "کیفیت صدای Super Bass با تفکیک عالی فرکانسی",
    ],
    price: 1248000,
    badge: "Active ANC Pro",
    image:
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "e2",
    category: "airpods",
    title: "ایرپاد بلوتوثی مدل U-E4",
    capacity: "کیس ۳۰۰mAh",
    specs: [
      "پشتیبانی کامل از فناوری حذف نویز فعال ANC",
      "قابلیت شارژ وایرلس بیسیم Wireless Charging",
      "پنل‌های لمسی هوشمند لمس خازنی + سوئیچ آنی",
      "مدت زمان نگهداری شارژ: تا ۵ ساعت مداوم با کیس",
      "زمان شارژ کامل کیس: فقط ۱ ساعت",
    ],
    price: 1428000,
    badge: "Wireless Charging",
    image:
      "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "e3",
    category: "airpods",
    title: "ایرپاد بلوتوثی مدل U-E2",
    capacity: "کیس ۳۰۰mAh",
    specs: [
      "زمان مکالمه و پخش موسیقی تا ۴ ساعت مداوم",
      "درگاه شارژ لایتنینگ و سازگاری کامل با iOS/Android",
      "دارای حسگر لمسی حساس روی دسته ایرفون",
      "طراحی ارگونومیک نیمه‌باز مطابق گوش انسان",
      "زمان مورد نیاز شارژ سریع: ۱ ساعت",
    ],
    price: 808000,
    badge: "Best Value",
    image:
      "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "e4",
    category: "airpods",
    title: "ایرپاد بلوتوثی گیمینگ U-E6 با بدنه چرمی",
    capacity: "کیس ۳۰۰mAh LED",
    specs: [
      "طراحی خاص با روکش چرم مرغوب و شیک روی کیس شارژ",
      "حذف نویز تماس شفاف و محیطی (ENC)",
      "دارای نمایشگر هوشمند LED درصد شارژ دقیق روی کیس",
      "تراشه بلوتوث نسخه ۵.۳ با حداقل تاخیر در بازی",
      "میکروفون دوتایی با وضوح بالا برای مکالمات شفاف",
    ],
    price: 1080000,
    badge: "Leather Edition + LED",
    image:
      "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "e5",
    category: "airpods",
    title: "ایرپاد بلوتوثی اولتراسور U-E7",
    capacity: "همراه با بند سیلیکونی",
    specs: [
      "حذف نویز مکالمه محیطی ENC Dual Mic",
      "بند آویز اورجینال متصل به کیس برای حمل آسان",
      "پخش موسیقی مداوم تا ۴ ساعت و استندبای ۷۰ ساعت",
      "پورت شارژ فوق سریع Type-C",
      "مقاوم در برابر تعریق و قطرات آب",
    ],
    price: 998000,
    badge: "Lanyard Design",
    image:
      "https://images.unsplash.com/photo-1588423771073-b8903fbb85b5?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "w1",
    category: "smartwatch",
    title: "ساعت هوشمند مدل U-W1 Ultra",
    capacity: "باتری ۲۷۰mAh",
    specs: [
      "صفحه نمایش ۲.۰۲ اینچی تمام لمسی HD",
      "فریم تیتانیومی مقاوم با بند اوشن لوکس (Ocean Band)",
      "باتری ۲۷۰ میلی‌آمپر با شارژدهی تا ۷ روز کاری",
      "پشتیبانی از هوش مصنوعی ChatGPT، قطب‌نما، دستیار صوتی",
      "پایش ۲۴ ساعته ضربان قلب، اکسیژن خون SpO2 و فشار خون",
    ],
    price: 1850000,
    badge: "ChatGPT & Compass",
    image:
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "w2",
    category: "smartwatch",
    title: "ساعت هوشمند مدل U-W2 (بند استیل)",
    capacity: "باتری ۲۵۰mAh",
    specs: [
      "طراحی لوکس مدیریتی با بند فلزی مشکی استیل ضدزنگ",
      "نمایشگر تمام لمسی ۲ اینچ با رزولوشن فوق‌العاده ۳۲۰×۳۹۰",
      "قابلیت مکالمه بلوتوثی با اسپیکر و میکروفون HD داخلی",
      "باتری ۲۵۰ میلی‌آمپر با شارژدهی استثنایی تا ۱۵ روز در استندبای",
      "چیپست پردازشی پرسرعت و روان BT8955B",
    ],
    price: 1980000,
    badge: "Stainless Steel Band",
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "w3",
    category: "smartwatch",
    title: "ساعت هوشمند اسپرت U-W2 Rounder",
    capacity: "باتری ۲۰۰mAh",
    specs: [
      "صفحه نمایش دایره‌ای ۱.۵۳ اینچی با کیفیت ۳۶۰×۳۶۰ پیکسل",
      "طراحی تاکتیکال و ضد ضربه مناسب ورزشکاران",
      "شارژر مغناطیسی فست + مسیریابی و گام‌شمار پیشرفته",
      "پایش دقیق خواب، استرس و سنسورهای بیومتریک پزشکی",
      "پشتیبانی کامل از پیام‌های فارسی و نوتیفیکیشن‌ها",
    ],
    price: 1720000,
    badge: "Round Tactical",
    image:
      "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "c1",
    category: "car-charger",
    title: "شارژر فندکی توربو مدل U-B1",
    capacity: "توان خروجی ۴۸W",
    specs: [
      "بدنه فلزی مقاوم از آلیاژ روی ضد حرارت",
      "پورت خروجی Type-C با توان ۳۰ وات PD",
      "پورت خروجی USB با توان ۱۸ وات QC3.0",
      "ولتاژ ورودی ۱۲ الی ۲۴ ولت (سازگار با خودرو و کامیون)",
      "دارای حلقه نورانی LED فیروزه‌ای زیبا در شب",
    ],
    price: 358000,
    badge: "48W Turbo Metal",
    image:
      "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "c2",
    category: "car-charger",
    title: "شارژر فندکی شفاف مدل U-B2",
    capacity: "۱۸W فست‌شارژ",
    specs: [
      "طراحی مدرن شیشه‌ای سایبرپانک با قابلیت مشاهده قطعات داخلی",
      "پورت USB-A با فناوری کوالکام QC3.0 و توان ۱۸ وات",
      "سیستم هوشمند کنترل دما و محافظت در برابر نوسان",
      "بدنه پلی‌کربنات نسوز شفاف ضدخش",
      "ولتاژ ورودی ۱۲ تا ۲۴ ولت اتوماتیک",
    ],
    price: 168000,
    badge: "Transparent Style",
    image:
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "c3",
    category: "car-charger",
    title: "شارژر فندکی دو پورت تایپ‌سی U-B3",
    capacity: "توان کلی ۶۰ وات",
    specs: [
      "دو عدد پورت خروجی مستقل Type-C PD فوق پرسرعت",
      "توان کل خروجی: ۶۰ وات واقعی با قابلیت شارژ لپ‌تاپ و تبلت",
      "متریال ترکیبی شیشه نشکن دودی و آلیاژ آلومینیومی",
      "پشتیبانی از فناوری‌های PD 3.0, PPS, QC 4.0",
      "مکانیزم حفاظتی ۸ لایه در برابر اتصال کوتاه",
    ],
    price: 420000,
    badge: "Dual PD 60W",
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "cb1",
    category: "aux-cable",
    title: "کابل AUX کنفی مدل U-A1",
    capacity: "طول ۱۲۰ سانتی‌متر",
    specs: [
      "کانکتورهای جک ۳.۵ میلی‌متری طلایی با رسانایی بدون نویز",
      "طول کابل: ۱۲۰ سانتی‌متر استاندارد",
      "روکش کنفی بافته شده فوق‌العاده مقاوم و ضد گره",
      "جنس پوسته کانکتورها آلومینیوم مات مشکی اولتراسور",
      "انتقال صدای کریستالی با خلوص Hi-Fi Audio",
    ],
    price: 118000,
    badge: "Hi-Fi Gold Plug",
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "cb3",
    category: "cables",
    title: "کابل فست ۱۰۰ وات اولتراسور U-D8",
    capacity: "توان ۱۰۰ وات ۵ آمپر",
    specs: [
      "پشتیبانی از فناوری شارژ ۱۰۰ وات واقعی (20V/5A)",
      "مناسب شارژ مک‌بوک، لپ‌تاپ‌های تایپ‌سی و پرچمداران موبایل",
      "جنس بدنه: کنف فشرده ضد سایش و پارگی",
      "سر سیم‌های آلومینیومی تقویت‌شده ضد شکستگی SR",
      "طول استاندارد ۱۰۰ سانتی‌متر",
    ],
    price: 198000,
    badge: "100W Super PD",
    image:
      "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "n1",
    category: "neckband",
    title: "هندزفری گردنی ماراتن U-N15",
    capacity: "باتری ۵۰۰mAh (۶۰ ساعت کارکرد)",
    specs: [
      "باتری ۵۰۰ میلی‌آمپری با پخش مداوم شگفت‌انگیز ۶۰ ساعت",
      "زمان استندبای آماده به کار تا ۱۰۰۰ ساعت",
      "زمان شارژ شدن کامل: ۴ ساعت",
      "سری‌های ارگونومیک فلزی مجهز به مگنت آهنربایی",
      "صدای بم عمیق Extra Bass با پورت محافظت شده",
    ],
    price: 788000,
    badge: "60 Hours Playtime",
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "h1",
    category: "holder",
    title: "هولدر تلسکوپی ۳۶۰ درجه UF1",
    capacity: "پایه مکنده وکیوم ژله‌ای",
    specs: [
      "بدنه از جنس پلاستیک مقاوم ABS نشکن",
      "امکان چرخش کامل ۳۶۰ درجه مفصلی به همراه بازوی تلسکوپی کشویی",
      "سازگار با تمامی گوشی‌ها از سایز ۴.۵ تا ۶.۸ اینچ",
      "اتصال دوگانه به داشبورد و شیشه با ساکشن وکیوم و ژل نانو نچسب",
      "گیره خرچنگی قفل‌شونده با رهاسازی تک لمسی",
    ],
    price: 245000,
    badge: "Crab Clamp Lock",
    image:
      "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80",
  },
  {
    id: "sp1",
    category: "speaker-acc",
    title: "اسپیکر قابل حمل اولتراسور U-S40",
    capacity: "باتری ۱۵۰۰mAh",
    specs: [
      "توان خروجی ۵ وات واقعی با بیس کوبنده و تفکیک عالی",
      "باتری لیتیومی ۱۵۰۰ میلی‌آمپر با پخش مداوم ۸ الی ۱۰ ساعت",
      "دارای ولوم کنترل چرخشی دقیق و لذت‌بخش در جلوی دستگاه",
      "درگاه شارژ تایپ‌سی + بند بافته شده برای جابجایی آسان",
      "پشتیبانی از بلوتوث، فلش USB، کارت حافظه TF و AUX",
    ],
    price: 680000,
    badge: "Rotary Volume Control",
    image:
      "https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&auto=format&fit=crop&q=80",
  },
];

export default function UltraSurCatalogApp() {
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPricesInPrint, setShowPricesInPrint] = useState(true);
  const [activeTab, setActiveTab] = useState("manager"); // 'manager' | 'pdf-preview'

  // وضعیت پایگاه داده SQLite محلی
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [statusMessage, setStatusMessage] = useState(
    "در حال بارگذاری پایگاه داده...",
  );
  const [feedbackToast, setFeedbackToast] = useState<{
    message: string;
    type: string;
  } | null>(null);

  // وضعیت مدال افزودن / ویرایش
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    category: "powerbank",
    capacity: "",
    price: "",
    badge: "",
    image: "",
    specs: "",
  });

  // نمونه‌های در حال اجرای SQLite (WASM)
  const dbRef = useRef<SqlJsDatabase | null>(null);
  const sqlRef = useRef<SqlJsStatic | null>(null);

  // نمایش پیام توست موقت
  const showToast = (message: string, type = "success") => {
    setFeedbackToast({ message, type });
    setTimeout(() => {
      setFeedbackToast(null);
    }, 3500);
  };

  // ۱. راه‌اندازی SQLite در مرورگر و بارگذاری دیتابیس ذخیره‌شده (یا ساخت اولیه)
  useEffect(() => {
    let cancelled = false;

    const setupDatabase = async () => {
      try {
        const SQL = await initSqlJs({ locateFile: () => wasmUrl });
        const persisted = await loadPersistedDb();
        const db = persisted ? new SQL.Database(persisted) : new SQL.Database();

        db.run(DB_SCHEMA);

        const countResult = db.exec("SELECT COUNT(*) FROM products");
        const rowCount =
          countResult.length > 0 ? Number(countResult[0].values[0][0]) : 0;
        if (rowCount === 0) {
          setStatusMessage("بارگذاری اولیه کاتالوگ اولتراسور...");
          seedProducts(db, INITIAL_PRODUCTS);
        }

        if (cancelled) return;
        dbRef.current = db;
        sqlRef.current = SQL;
        setProducts(readAllProducts(db));
        await persistDb(db.export());
        if (cancelled) return;
        setSyncStatus("synced");
        setStatusMessage("پایگاه داده SQLite آماده است");
      } catch (err) {
        console.error("SQLite setup failed:", err);
        if (cancelled) return;
        setSyncStatus("error");
        setStatusMessage("خطا در راه‌اندازی پایگاه داده");
      }
    };

    setupDatabase();

    return () => {
      cancelled = true;
    };
  }, []);

  // فیلتر و جستجوی محصولات در حافظه کلاینت
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory =
        selectedCategory === "all" || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        p.title.toLowerCase().includes(q) ||
        (p.capacity && p.capacity.toLowerCase().includes(q)) ||
        (p.badge && p.badge.toLowerCase().includes(q)) ||
        (p.specs && p.specs.some((s) => s.toLowerCase().includes(q)));
      return matchCategory && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // فرمت‌بندی اعداد به تومان فارسی
  const formatToman = (val: number) => {
    if (!val && val !== 0) return "استعلام بگیرید";
    return Number(val).toLocaleString("fa-IR") + " تومان";
  };

  // باز کردن مدال افزودن محصول
  const handleAddNew = () => {
    setEditingProduct(null);
    setFormData({
      title: "",
      category: selectedCategory === "all" ? "powerbank" : selectedCategory,
      capacity: "",
      price: "",
      badge: "جدید",
      image:
        "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80",
      specs:
        "کیفیت ساخت اورجینال درجه یک اولتراسور\nپشتیبانی از فناوری Fast Charging\nگارانتی تعویض شرکتی",
    });
    setIsModalOpen(true);
  };

  // باز کردن مدال ویرایش
  const handleEdit = (prod: Product) => {
    setEditingProduct(prod);
    setFormData({
      title: prod.title,
      category: prod.category,
      capacity: prod.capacity || "",
      price: String(prod.price || ""),
      badge: prod.badge || "",
      image: prod.image || "",
      specs: prod.specs ? prod.specs.join("\n") : "",
    });
    setIsModalOpen(true);
  };

  // حذف محصول از دیتابیس SQLite
  const handleDelete = async (id: string, title: string) => {
    if (!dbRef.current) {
      showToast("پایگاه داده هنوز آماده نشده است", "error");
      return;
    }

    try {
      setSyncStatus("saving");
      setStatusMessage("در حال حذف محصول از دیتابیس...");
      dbRef.current.run("DELETE FROM products WHERE id = ?", [id]);
      setProducts(readAllProducts(dbRef.current));
      await persistDb(dbRef.current.export());
      setSyncStatus("synced");
      setStatusMessage("محصول با موفقیت از دیتابیس حذف گردید");
      showToast(`محصول «${title}» با موفقیت حذف شد`);
    } catch (err) {
      console.error("Delete error:", err);
      setSyncStatus("error");
      setStatusMessage("خطا در حذف محصول");
      showToast("خطا در حذف محصول از دیتابیس", "error");
    }
  };

  // ذخیره فرم افزودن یا ویرایش در پایگاه داده
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    if (!dbRef.current) {
      showToast("پایگاه داده هنوز آماده نشده است", "error");
      return;
    }

    const specsArray = formData.specs
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const priceNum = formData.price ? parseInt(formData.price, 10) : 0;
    const targetId = editingProduct ? editingProduct.id : "prod_" + Date.now();

    const image =
      formData.image ||
      "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop&q=80";

    setIsModalOpen(false);

    try {
      setSyncStatus("saving");
      setStatusMessage("در حال ذخیره‌سازی در دیتابیس...");
      dbRef.current.run(
        `INSERT INTO products (id, category, title, capacity, price, badge, image, specs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           category = excluded.category,
           title = excluded.title,
           capacity = excluded.capacity,
           price = excluded.price,
           badge = excluded.badge,
           image = excluded.image,
           specs = excluded.specs`,
        [
          targetId,
          formData.category,
          formData.title,
          formData.capacity,
          priceNum,
          formData.badge,
          image,
          JSON.stringify(specsArray),
        ],
      );
      setProducts(readAllProducts(dbRef.current));
      await persistDb(dbRef.current.export());
      setSyncStatus("synced");
      setStatusMessage("تغییرات با موفقیت ذخیره شد");
      showToast(
        editingProduct
          ? "مشخصات محصول با موفقیت به‌روزرسانی شد"
          : "محصول جدید با موفقیت به کاتالوگ اضافه شد",
      );
    } catch (err) {
      console.error("Save product error:", err);
      setSyncStatus("error");
      setStatusMessage("خطا در ذخیره تغییرات");
      showToast("خطا در همگام‌سازی محصول", "error");
    }
  };

  // ویرایش سریع قیمت با کلیک و ثبت آنی
  const handleQuickPriceChange = async (id: string, newPrice: string) => {
    const numericPrice = Number(newPrice) || 0;
    // بروزرسانی آنی رابط کاربری (Optimistic UI)
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, price: numericPrice } : p)),
    );

    if (!dbRef.current) return;

    try {
      setSyncStatus("saving");
      setStatusMessage("در حال ثبت تغییر قیمت...");
      dbRef.current.run("UPDATE products SET price = ? WHERE id = ?", [
        numericPrice,
        id,
      ]);
      await persistDb(dbRef.current.export());
      setSyncStatus("synced");
      setStatusMessage("قیمت جدید در دیتابیس ذخیره شد");
    } catch (err) {
      console.error("Quick price update error:", err);
      setSyncStatus("error");
      setStatusMessage("خطا در ذخیره قیمت");
    }
  };

  // بازنشانی دیتابیس به کاتالوگ اولیه UltraSur
  const handleResetToFactory = async () => {
    if (
      !window.confirm(
        "آیا مایل به بازگردانی کلیه محصولات به داده‌های اصلی کاتالوگ اولترا سور هستید؟ تغییرات اعمال‌شده در دیتابیس بازنویسی خواهد شد.",
      )
    ) {
      return;
    }
    if (!dbRef.current) return;

    try {
      setSyncStatus("saving");
      setStatusMessage("در حال بازیابی کاتالوگ پیش‌فرض...");
      dbRef.current.run("DELETE FROM products");
      seedProducts(dbRef.current, INITIAL_PRODUCTS);
      setProducts(readAllProducts(dbRef.current));
      await persistDb(dbRef.current.export());
      setSyncStatus("synced");
      setStatusMessage("کاتالوگ با موفقیت ریست شد");
      showToast("تمام محصولات به اطلاعات اولیه ultrasur.pdf بازگردانده شدند");
    } catch (err) {
      console.error("Reset error:", err);
      setSyncStatus("error");
      setStatusMessage("خطا در بازیابی کاتالوگ");
      showToast("خطا در بازیابی کاتالوگ", "error");
    }
  };

  // دانلود دیتابیس SQLite فعلی به‌صورت فایل .sqlite
  const handleExportDb = () => {
    if (!dbRef.current) {
      showToast("پایگاه داده هنوز آماده نشده است", "error");
      return;
    }
    try {
      const exported = dbRef.current.export();
      const blob = new Blob([exported.buffer as ArrayBuffer], {
        type: "application/x-sqlite3",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ultrasur-catalog.sqlite";
      a.click();
      URL.revokeObjectURL(url);
      showToast("فایل دیتابیس SQLite دانلود شد");
    } catch (err) {
      console.error("Export DB error:", err);
      showToast("خطا در ساخت فایل خروجی", "error");
    }
  };

  // بازیابی دیتابیس از یک فایل .sqlite انتخاب‌شده توسط کاربر
  const handleImportDb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !sqlRef.current) return;

    try {
      const buffer = await file.arrayBuffer();
      const db = new sqlRef.current.Database(new Uint8Array(buffer));
      // بررسی سلامت فایل: جدول products باید وجود داشته باشد
      const check = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='products'",
      );
      if (check.length === 0) {
        db.close();
        showToast("فایل انتخاب‌شده جدول products ندارد", "error");
        return;
      }

      if (dbRef.current) dbRef.current.close();
      dbRef.current = db;
      db.run(DB_SCHEMA);
      setProducts(readAllProducts(db));
      await persistDb(db.export());
      setSyncStatus("synced");
      setStatusMessage("دیتابیس از فایل بازیابی شد");
      showToast("دیتابیس SQLite با موفقیت بازیابی شد");
    } catch (err) {
      console.error("Import DB error:", err);
      showToast("خطا در بازیابی فایل دیتابیس", "error");
    }
  };

  // آپلود عکس: تغییر اندازه و فشرده‌سازی در مرورگر قبل از ذخیره به صورت Base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("فایل انتخاب‌شده باید تصویر باشد", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          showToast("خطا در پردازش تصویر", "error");
          return;
        }
        // پس‌زمینه سفید برای تصاویر شفاف چون خروجی JPEG است
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        if (dataUrl.length > 1500000) {
          showToast(
            "حجم تصویر پس از فشرده‌سازی همچنان زیاد است؛ تصویر کوچک‌تری انتخاب کنید",
            "error",
          );
          return;
        }
        setFormData((prev) => ({ ...prev, image: dataUrl }));
        showToast("تصویر پردازش و آماده ذخیره شد");
      };
      img.onerror = () => showToast("خطا در باز کردن تصویر", "error");
      img.src = reader.result as string;
    };
    reader.onerror = () => showToast("خطا در خواندن فایل", "error");
    reader.readAsDataURL(file);
  };

  const handlePrintPdf = () => {
    // قالب چاپی فقط در تب pdf-preview رندر می‌شود؛ اول به آن برو، بعد چاپ کن
    setActiveTab("pdf-preview");
    setTimeout(() => window.print(), 150);
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#0b0f19] text-gray-100 font-sans selection:bg-orange-500 selection:text-white"
    >
      {/* استایل اختصاصی چاپ برای خروجی تمیز بدون هدرها و ابزارک‌های اضافی */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap');
        
        * {
          font-family: 'Vazirmatn', sans-serif;
        }

        @media print {
          /* حفظ رنگ‌های تم تیره کاتالوگ در خروجی PDF */
          * {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          body {
            background-color: #0b0f19 !important;
          }

          .no-print {
            display: none !important;
          }

          .catalog-print-container {
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #0b0f19 !important;
          }

          .catalog-page {
            page-break-after: always;
            break-after: page;
            padding: 24px 20px;
            box-sizing: border-box;
            border-radius: 0 !important;
            margin-bottom: 0 !important;
          }

          .catalog-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }

          .print-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      {/* اعلان‌های توست موقت */}
      {feedbackToast && (
        <div className="no-print fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#1e293b] border border-orange-500/40 text-white px-5 py-2.5 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4">
          {feedbackToast.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          )}
          <span className="text-xs font-semibold">{feedbackToast.message}</span>
        </div>
      )}

      {/* نوار ناوبری اصلی */}
      <header className="no-print sticky top-0 z-40 bg-[#0f172a]/90 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* لوگو و نام برند */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-orange-500/20">
              U
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-white via-gray-200 to-orange-400 bg-clip-text text-transparent">
                  ULTRASUR
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  ORIGINAL
                </span>
              </div>
              <p className="text-[11px] text-gray-400 tracking-wide font-medium">
                Saving on quality is meaningless.
              </p>
            </div>
          </div>

          {/* نشانگر وضعیت پایگاه داده محلی */}
          <div className="flex items-center gap-2 bg-gray-900/80 px-3 py-1.5 rounded-xl border border-gray-800 text-xs">
            {syncStatus === "synced" && (
              <>
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-medium">
                  پایگاه داده SQLite آماده
                </span>
              </>
            )}
            {syncStatus === "saving" && (
              <>
                <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                <span className="text-amber-400 font-medium">
                  در حال ذخیره‌سازی...
                </span>
              </>
            )}
            {syncStatus === "connecting" && (
              <>
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-blue-400 font-medium">
                  بارگذاری دیتابیس...
                </span>
              </>
            )}
            {syncStatus === "error" && (
              <>
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span className="text-rose-400 font-medium">خطای دیتابیس</span>
              </>
            )}
          </div>

          {/* تب‌های جابجایی بین حالت ویرایش و پیش‌نمایش چاپی */}
          <div className="flex items-center bg-gray-900/90 p-1 rounded-xl border border-gray-800">
            <button
              onClick={() => setActiveTab("manager")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "manager"
                  ? "bg-orange-600 text-white shadow-md"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              مدیریت و قیمت‌گذاری
            </button>
            <button
              onClick={() => setActiveTab("pdf-preview")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === "pdf-preview"
                  ? "bg-orange-600 text-white shadow-md"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              قالب کاتالوگ و چاپ PDF
            </button>
          </div>

          {/* دکمه‌های اقدام سریع */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddNew}
              className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-orange-500/20"
            >
              <Plus className="w-4 h-4" />
              محصول جدید
            </button>

            <button
              onClick={handlePrintPdf}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
              title="خروجی PDF استاندارد کاتالوگ A4"
            >
              <Printer className="w-4 h-4" />
              خروجی PDF
            </button>

            <button
              onClick={handleExportDb}
              className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition border border-gray-800"
              title="دانلود دیتابیس SQLite فعلی به‌صورت فایل"
            >
              <Download className="w-4 h-4" />
            </button>

            <label
              className="p-2 text-gray-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-xl transition border border-gray-800 cursor-pointer"
              title="بازیابی دیتابیس از فایل SQLite"
            >
              <Upload className="w-4 h-4" />
              <input
                type="file"
                accept=".sqlite,.db,application/x-sqlite3"
                onChange={handleImportDb}
                className="hidden"
              />
            </label>

            <button
              onClick={handleResetToFactory}
              className="p-2 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition border border-gray-800"
              title="بازگردانی داده‌های پیش‌فرض کاتالوگ اولترا سور"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* نوار فیلتر و جستجو */}
      <div className="no-print max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-1">
        <div className="bg-[#131b2e] p-3.5 rounded-2xl border border-gray-800 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* جستجو */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute right-3 top-3 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی مدل، توان، ویژگی (U-P10, 100W)..."
              className="w-full bg-[#0b0f19] text-xs text-gray-200 pr-9 pl-4 py-2 rounded-xl border border-gray-700 focus:outline-none focus:border-orange-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute left-2.5 top-2.5 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* سوئیچ نمایش قیمت و آمار */}
          <div className="flex items-center gap-4 text-xs font-medium text-gray-300">
            <label className="flex items-center gap-2 cursor-pointer bg-gray-900/60 px-3 py-1.5 rounded-lg border border-gray-700/80 hover:border-gray-600 transition">
              <input
                type="checkbox"
                checked={showPricesInPrint}
                onChange={(e) => setShowPricesInPrint(e.target.checked)}
                className="rounded accent-orange-500 cursor-pointer"
              />
              <span>نمایش قیمت‌ها در نسخه کاتالوگ و خروجی PDF</span>
            </label>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400">
              تعداد محصولات:{" "}
              <span className="font-bold text-orange-400">
                {filteredProducts.length}
              </span>{" "}
              مورد
            </span>
          </div>
        </div>

        {/* لیست دسته‌بندی‌ها با اسکرول نرم */}
        <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border ${
                  isSelected
                    ? "bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-md shadow-orange-500/10"
                    : "bg-gray-900/70 text-gray-400 border-gray-800 hover:border-gray-700 hover:text-gray-200"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${isSelected ? "text-orange-400" : "text-gray-500"}`}
                />
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* بخش اصلی محتوا */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {activeTab === "manager" ? (
          /* ================= نمای مدیریت و ویرایش کارت‌ها ================= */
          <div className="no-print">
            {filteredProducts.length === 0 ? (
              <div className="bg-[#131b2e] rounded-2xl border border-gray-800 p-12 text-center text-gray-400">
                <Info className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-base font-semibold">
                  محصولی در این دسته‌بندی یافت نشد.
                </p>
                <button
                  onClick={() => {
                    setSelectedCategory("all");
                    setSearchQuery("");
                  }}
                  className="mt-4 px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs"
                >
                  نمایش همه محصولات
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="bg-[#131b2e] rounded-2xl border border-gray-800 hover:border-gray-700 transition-all duration-200 overflow-hidden flex flex-col justify-between group shadow-lg hover:shadow-orange-500/5"
                  >
                    <div>
                      {/* تصویر و برچسب */}
                      <div className="relative h-52 bg-gradient-to-b from-[#1b253b] to-[#0c1220] p-4 flex items-center justify-center overflow-hidden border-b border-gray-800/60">
                        <img
                          src={product.image}
                          alt={product.title}
                          className="max-h-full max-w-full object-contain filter drop-shadow-2xl group-hover:scale-105 transition duration-300"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80";
                          }}
                        />
                        {product.badge && (
                          <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-500/90 text-white shadow">
                            {product.badge}
                          </span>
                        )}
                        <span className="absolute bottom-2.5 left-2.5 text-[10px] font-mono px-2 py-0.5 rounded bg-black/70 text-gray-300 backdrop-blur-sm">
                          {product.capacity || "ULTRASUR"}
                        </span>
                      </div>

                      {/* عنوان و مشخصات */}
                      <div className="p-4">
                        <h3 className="font-bold text-sm text-white group-hover:text-orange-400 transition mb-3">
                          {product.title}
                        </h3>

                        <ul className="space-y-1.5 text-xs text-gray-300 mb-2 bg-[#0b0f19] p-3 rounded-xl border border-gray-800/80">
                          {product.specs &&
                            product.specs.map((spec, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-1.5 leading-relaxed"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                                <span>{spec}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </div>

                    {/* فوتر قیمت و دکمه‌های کنترل */}
                    <div className="p-4 pt-0 border-t border-gray-800/60 mt-auto">
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-xs text-gray-400 font-medium">
                          قیمت عمده:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={product.price || ""}
                            onChange={(e) =>
                              handleQuickPriceChange(product.id, e.target.value)
                            }
                            className="w-28 bg-[#0b0f19] border border-gray-700 rounded-lg px-2 py-1 text-xs text-left font-bold text-amber-400 focus:outline-none focus:border-amber-500"
                            placeholder="قیمت..."
                          />
                          <span className="text-[11px] text-gray-400">
                            تومان
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2">
                        <button
                          onClick={() => handleEdit(product)}
                          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold py-2 rounded-xl transition flex items-center justify-center gap-1.5 border border-gray-700"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          ویرایش مشخصات
                        </button>
                        <button
                          onClick={() =>
                            handleDelete(product.id, product.title)
                          }
                          className="p-2 bg-gray-800 hover:bg-rose-900/40 text-gray-400 hover:text-rose-400 rounded-xl transition border border-gray-700"
                          title="حذف محصول از دیتابیس"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ================= قالب چاپی PDF مطابق با فایل ultrasur.pdf ================= */
          <div className="catalog-print-container">
            <div className="no-print mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  این پیش‌نمایش چاپی دقیقاً منطبق با چیدمان فایل اصلی
                  ultrasur.pdf طراحی شده است. تغییرات ذخیره شده در دیتابیس در
                  خروجی اعمال خواهند شد.
                </span>
              </div>
              <button
                onClick={handlePrintPdf}
                className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold px-4 py-2 rounded-xl transition shrink-0"
              >
                خروجی PDF کاتالوگ
              </button>
            </div>

            {/* صفحه ۱: جلد کاتالوگ */}
            <div className="catalog-page bg-[#0f172a] text-white rounded-3xl p-8 mb-8 border border-gray-800 shadow-2xl flex flex-col justify-between">
              <div className="flex justify-between items-center border-b border-gray-700/60 pb-5">
                <div>
                  <h1 className="text-3xl font-black tracking-widest text-white flex items-center gap-2">
                    ULTRASUR<span className="text-orange-500">.</span>
                  </h1>
                  <p className="text-xs text-orange-400 tracking-wider font-semibold mt-0.5">
                    لیست لوازم جانبی و کالاهای دیجیتال
                  </p>
                </div>
                <div className="text-left font-mono text-xs text-gray-400">
                  <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-white font-bold">
                    OFFICIAL CATALOGUE
                  </span>
                </div>
              </div>

              {/* شبکه ۸تایی محصولات جلد کاتالوگ */}
              <div className="grid grid-cols-4 gap-4 my-8">
                {products.slice(0, 8).map((p, idx) => (
                  <div
                    key={idx}
                    className="bg-white/5 border border-white/10 rounded-2xl p-3 flex flex-col items-center justify-center text-center"
                  >
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-28 w-28 object-contain mb-2 filter drop-shadow-md"
                    />
                    <span className="text-[11px] font-medium text-gray-200 line-clamp-1">
                      {p.title}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-center pt-6 border-t border-gray-700/60">
                <p className="text-lg font-bold tracking-widest text-orange-400 uppercase">
                  Saving on quality is meaningless.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  صرفه‌جویی در کیفیت بی‌معناست • تضمین اصالت کالا
                </p>
              </div>
            </div>

            {/* صفحات محصولات به تفکیک صفحات استاندارد ۳تایی کاتالوگ */}
            {Array.from({ length: Math.ceil(filteredProducts.length / 3) }).map(
              (_, pageIdx) => {
                const pageProducts = filteredProducts.slice(
                  pageIdx * 3,
                  pageIdx * 3 + 3,
                );
                return (
                  <div
                    key={pageIdx}
                    className="catalog-page bg-[#0d1424] text-white rounded-3xl p-8 mb-8 border border-gray-800 shadow-xl flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-center border-b border-gray-800 pb-3 mb-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center font-black text-white text-xs">
                          U
                        </div>
                        <span className="font-extrabold text-base tracking-wider text-white">
                          ULTRASUR
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 font-mono">
                        صفحه {pageIdx + 2} • لیست رسمی کاتالوگ
                      </span>
                    </div>

                    <div className="space-y-5 flex-1">
                      {pageProducts.map((item) => (
                        <div
                          key={item.id}
                          className="print-card bg-[#131b2e] border border-gray-800 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-5"
                        >
                          <div className="w-full md:w-40 h-36 bg-[#090d16] rounded-xl flex items-center justify-center p-2 shrink-0 border border-gray-800">
                            <img
                              src={item.image}
                              alt={item.title}
                              className="max-h-full max-w-full object-contain filter drop-shadow-xl"
                            />
                          </div>

                          <div className="flex-1 w-full">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <h3 className="text-sm font-extrabold text-white">
                                {item.title}
                              </h3>
                              {item.badge && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                  {item.badge}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300 mb-3">
                              {item.specs &&
                                item.specs.map((sp, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="flex items-start gap-1.5 py-0.5"
                                  >
                                    <span className="text-orange-500 font-bold">
                                      •
                                    </span>
                                    <span className="leading-snug">{sp}</span>
                                  </div>
                                ))}
                            </div>

                            {showPricesInPrint && (
                              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-amber-500/10 border border-orange-500/40 px-3 py-1 rounded-xl">
                                <span className="text-xs text-gray-300 font-medium">
                                  قیمت عمده:
                                </span>
                                <span className="text-xs font-black text-orange-400">
                                  {formatToman(item.price)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 mt-5 border-t border-gray-800 flex justify-between items-center text-xs text-gray-400">
                      <span className="font-semibold tracking-wide text-orange-500/90">
                        ULTRASUR ACCESSORIES
                      </span>
                      <span className="italic">
                        Saving on quality is meaningless.
                      </span>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </main>

      {/* مدال افزودن و ویرایش مشخصات محصول */}
      {isModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#131b2e] border border-gray-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-3.5 bg-[#0f172a] border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-orange-500" />
                {editingProduct
                  ? "ویرایش اطلاعات محصول در دیتابیس محلی"
                  : "افزودن محصول جدید به دیتابیس محلی"}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitForm}
              className="p-5 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    نام و مدل محصول *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="مثال: پاور بانک مدل U-P10"
                    className="w-full bg-[#0b0f19] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    دسته‌بندی کاتالوگ *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="w-full bg-[#0b0f19] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
                  >
                    {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    برچسب برجسته (Badge)
                  </label>
                  <input
                    type="text"
                    value={formData.badge}
                    onChange={(e) =>
                      setFormData({ ...formData, badge: e.target.value })
                    }
                    placeholder="مثال: 22.5W Fast Charge یا ANC Pro"
                    className="w-full bg-[#0b0f19] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    قیمت عمده (تومان)
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    placeholder="مثال: 1480000"
                    className="w-full bg-[#0b0f19] border border-gray-700 rounded-xl px-3 py-2 text-xs text-amber-400 font-bold focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  تصویر محصول (لینک تصویر یا آپلود فایل مستقیم)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.image}
                    onChange={(e) =>
                      setFormData({ ...formData, image: e.target.value })
                    }
                    placeholder="آدرس اینترنتی تصویر..."
                    className="flex-1 bg-[#0b0f19] border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-100 focus:outline-none focus:border-orange-500"
                  />
                  <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-gray-700 shrink-0">
                    <Upload className="w-3.5 h-3.5 text-orange-400" />
                    <span>انتخاب فایل</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                {formData.image && (
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={formData.image}
                      alt="پیش‌نمایش تصویر محصول"
                      className="h-16 w-16 object-contain bg-[#0b0f19] border border-gray-700 rounded-lg p-1"
                    />
                    <span className="text-[10px] text-gray-500">
                      تصویر انتخاب‌شده پس از فشرده‌سازی در دیتابیس ذخیره می‌شود
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  مشخصات فنی و امکانات (هر خط یک ویژگی در کاتالوگ) *
                </label>
                <textarea
                  rows={4}
                  required
                  value={formData.specs}
                  onChange={(e) =>
                    setFormData({ ...formData, specs: e.target.value })
                  }
                  placeholder="ظرفیت: ۲۰۰۰۰ میلی‌آمپر ساعت&#10;تعداد پورت: ۳ پورت فست&#10;جنس بدنه: آلومینیوم مات مقاوم"
                  className="w-full bg-[#0b0f19] border border-gray-700 rounded-xl p-3 text-xs text-gray-200 leading-relaxed focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-md shadow-orange-500/20 transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  ذخیره در دیتابیس
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
