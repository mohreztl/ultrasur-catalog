import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
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
  Speaker,
  Monitor,
} from "lucide-react";
import initSqlJs, {
  type Database as SqlJsDatabase,
  type SqlJsStatic,
} from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { CATALOG_PRODUCTS } from "./catalogProducts";
import {
  CATALOG_PALETTES,
  catalogStyles,
} from "./catalogTheme";
import { CATALOG_FONTS } from "./catalogFonts";

export interface Product {
  id: string;
  category: string;
  title: string;
  brand?: string;
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
    brand TEXT,
    capacity TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    badge TEXT,
    image TEXT,
    specs TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
    "SELECT id, category, title, brand, capacity, price, badge, image, specs FROM products",
  );
  if (result.length === 0) return [];
  return result[0].values.map((row) => ({
    id: String(row[0]),
    category: String(row[1]),
    title: String(row[2]),
    brand: (row[3] as string) || "",
    capacity: (row[4] as string) || "",
    price: Number(row[5]) || 0,
    badge: (row[6] as string) || "",
    image: (row[7] as string) || "",
    specs: JSON.parse(String(row[8] || "[]")) as string[],
  }));
};

const seedProducts = (db: SqlJsDatabase, products: Product[]): void => {
  db.run("BEGIN");
  for (const p of products) {
    db.run(
      "INSERT INTO products (id, category, title, brand, capacity, price, badge, image, specs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        p.id,
        p.category,
        p.title,
        p.brand ?? null,
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

const PLACEHOLDER_IMAGE = "images/placeholder.svg";

// ارتقای دیتابیس‌های قدیمی: افزودن ستون brand، نسبت دادن برند به رکوردها و جایگزینی تصاویر unsplash
const migrateDatabase = (db: SqlJsDatabase): void => {
  const cols = db.exec("PRAGMA table_info(products)");
  const hasBrand =
    cols.length > 0 && cols[0].values.some((row) => String(row[1]) === "brand");
  if (!hasBrand) {
    db.run("ALTER TABLE products ADD COLUMN brand TEXT");
  }
  // رکوردهای قدیمی (و دانه‌های اولیه بدون برند) متعلق به برند UltraSur هستند
  db.run("UPDATE products SET brand = 'UltraSur' WHERE brand IS NULL");
};

// دسته‌بندی‌های کاتالوگ (ترتیب فهرست)
const CATEGORIES = [
  { id: "all", name: "همه محصولات", icon: Layers },
  { id: "powerbank", name: "پاور بانک", icon: BatteryCharging },
  { id: "airpods", name: "ایرپاد و هندزفری بلوتوث", icon: Headphones },
  { id: "smartwatch", name: "ساعت هوشمند", icon: Watch },
  { id: "car-charger", name: "شارژر فندکی", icon: Car },
  { id: "charger", name: "شارژر دیواری و وایرلس", icon: BatteryCharging },
  { id: "cables", name: "کابل‌های شارژ سریع", icon: Cable },
  { id: "aux-cable", name: "کابل AUX", icon: Cable },
  { id: "wired-earphone", name: "هندزفری سیمی", icon: Headphones },
  { id: "neckband", name: "هندزفری گردنی", icon: Headphones },
  { id: "headphone", name: "هدفون", icon: Headphones },
  { id: "holder", name: "هولدر ۳۶۰ درجه", icon: Smartphone },
  { id: "speaker-acc", name: "اسپیکر و OTG", icon: Speaker },
  { id: "computer-acc", name: "لوازم کامپیوتر", icon: Monitor },
  { id: "other", name: "سایر محصولات", icon: Layers },
];

// دانه کامل: محصولات استخراج‌شده از بک‌اپ وردپرس + کاتالوگ UltraSur
const SEED_PRODUCTS: Product[] = CATALOG_PRODUCTS;

// نسخه‌بندی دانه — نسخه ۳: جایگزینی کامل فهرست محصولات
const SEED_VERSION = 3;
const syncSeedVersion = (db: SqlJsDatabase): void => {
  const cur = db.exec("SELECT value FROM meta WHERE key = 'seed_version'");
  const version = cur.length > 0 ? Number(cur[0].values[0][0]) : 1;
  if (version >= SEED_VERSION) return;
  // نسخه ۳: محصولات قبلی حذف و فهرست کامل جایگزین می‌شود
  db.run("DELETE FROM products");
  seedProducts(db, SEED_PRODUCTS);
  db.run(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_version', ?)",
    [String(SEED_VERSION)],
  );
};

export default function UltraSurCatalogApp() {
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPricesInPrint, setShowPricesInPrint] = useState(true);
  const [paletteId, setPaletteId] = useState<string>(
    () => localStorage.getItem("catalog-palette") || CATALOG_PALETTES[0].id,
  );
  const palette =
    CATALOG_PALETTES.find((pl) => pl.id === paletteId) ?? CATALOG_PALETTES[0];
  const cs = catalogStyles(palette);
  const choosePalette = (id: string) => {
    setPaletteId(id);
    localStorage.setItem("catalog-palette", id);
  };
  // فونت قابل انتخاب برای خروجی کاتالوگ
  const [fontId, setFontId] = useState<string>(
    () => localStorage.getItem("catalog-font") || CATALOG_FONTS[0].id,
  );
  const font = CATALOG_FONTS.find((f) => f.id === fontId) ?? CATALOG_FONTS[0];
  const chooseFont = (id: string) => {
    setFontId(id);
    localStorage.setItem("catalog-font", id);
  };
  // نمایش/پنهان‌سازی محصولات بدون قیمت در خروجی
  const [showPriceless, setShowPriceless] = useState<boolean>(
    () => localStorage.getItem("catalog-priceless") !== "0",
  );
  const togglePriceless = () => {
    setShowPriceless((v) => {
      localStorage.setItem("catalog-priceless", v ? "0" : "1");
      return !v;
    });
  };
  const [activeTab, setActiveTab] = useState("manager"); // 'manager' | 'pdf-preview'
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

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
    brand: "",
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
          setStatusMessage("بارگذاری اولیه کاتالوگ ariyatechno...");
          seedProducts(db, SEED_PRODUCTS);
        }
        migrateDatabase(db);
        syncSeedVersion(db);

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
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.capacity && p.capacity.toLowerCase().includes(q)) ||
        (p.badge && p.badge.toLowerCase().includes(q)) ||
        (p.specs && p.specs.some((s) => s.toLowerCase().includes(q)));
      return matchCategory && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // محصولات قابل نمایش در خروجی (با امکان حذف محصولات بدون قیمت)
  const catalogProducts = useMemo(
    () => (showPriceless ? products : products.filter((p) => p.price > 0)),
    [products, showPriceless],
  );

  // گروه‌بندی همه محصولات بر اساس دسته‌بندی برای خروجی کامل PDF
  const categoryGroups = useMemo(() => {
    return CATEGORIES.filter((c) => c.id !== "all")
      .map((cat) => ({
        ...cat,
        items: catalogProducts.filter((p) => p.category === cat.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [catalogProducts]);

  // صفحه‌آرایی: جلد + فهرست چندصفحه‌ای + محصولات به تفکیک دسته + پشت‌جلد
  const TOC_ROWS_PER_PAGE = 14;

  const pagesForCategory = (count: number) =>
    count === 0 ? 0 : count <= 2 ? 1 : 1 + Math.ceil((count - 2) / 3);

  const tocPages = Math.max(
    1,
    Math.ceil(categoryGroups.length / TOC_ROWS_PER_PAGE),
  );
  const contentStart = 2 + tocPages;

  const categoryPages = useMemo(() => {
    let nextPage = contentStart;
    return categoryGroups.map((group) => {
      const startPage = nextPage;
      nextPage += pagesForCategory(group.items.length);
      return { ...group, startPage };
    });
  }, [categoryGroups, contentStart]);

  const tocChunks = useMemo(() => {
    const chunks: (typeof categoryPages)[] = [];
    for (let i = 0; i < categoryPages.length; i += TOC_ROWS_PER_PAGE) {
      chunks.push(categoryPages.slice(i, i + TOC_ROWS_PER_PAGE));
    }
    return chunks;
  }, [categoryPages]);

  // آخرین شماره صفحه = پشت‌جلد
  const totalPages =
    contentStart +
    categoryPages.reduce((s, g) => s + pagesForCategory(g.items.length), 0);

  // فرمت‌بندی اعداد به تومان فارسی
  const formatToman = (val: number) => {
    if (!val) return "تماس بگیرید";
    return Number(val).toLocaleString("fa-IR") + " تومان";
  };

  // باز کردن مدال افزودن محصول
  const handleAddNew = () => {
    setEditingProduct(null);
    setFormData({
      title: "",
      category: selectedCategory === "all" ? "powerbank" : selectedCategory,
      brand: "",
      capacity: "",
      price: "",
      badge: "جدید",
      image: PLACEHOLDER_IMAGE,
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
      brand: prod.brand || "",
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

    const image = formData.image || PLACEHOLDER_IMAGE;

    setIsModalOpen(false);

    try {
      setSyncStatus("saving");
      setStatusMessage("در حال ذخیره‌سازی در دیتابیس...");
      dbRef.current.run(
        `INSERT INTO products (id, category, title, brand, capacity, price, badge, image, specs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           category = excluded.category,
           title = excluded.title,
           brand = excluded.brand,
           capacity = excluded.capacity,
           price = excluded.price,
           badge = excluded.badge,
           image = excluded.image,
           specs = excluded.specs`,
        [
          targetId,
          formData.category,
          formData.title,
          formData.brand.trim(),
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
      seedProducts(dbRef.current, SEED_PRODUCTS);
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
      migrateDatabase(db);
      syncSeedVersion(db);
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

  // خروجی فایل PDF واحد: رندر صفحات کاتالوگ به تصویر و مونتاژ با jsPDF
  // (بدون هدر/آدرس سایت مرورگر و بدون حاشیه‌های اضافه چاپ)
  const handleDownloadPdfFile = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    const A4_W = 794;
    const A4_H = 1123;
    try {
      setActiveTab("pdf-preview");
      await new Promise((r) => setTimeout(r, 250));
      // Explicitly activate every weight of the selected font before capture so
      // html2canvas paints with it instead of falling back in its clone canvas.
      await Promise.all(
        ["400", "500", "600", "700", "800", "900"].map((w) =>
          document.fonts.load(`${w} 16px '${font.family}'`),
        ),
      );
      await document.fonts.ready;
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(".catalog-page"),
      );
      if (nodes.length === 0) throw new Error("no catalog pages rendered");
      // قفل نسبت A4 برای هر صفحه تا خروجی بدون حاشیه سفید باشد
      for (const node of nodes) {
        node.style.width = `${A4_W}px`;
        node.style.height = `${A4_H}px`;
        node.style.overflow = "hidden";
      }
      // مختصات ردیف‌های فهرست برای لینک‌های داخلی PDF
      const tocLinks: Array<{
        nodeIdx: number;
        x: number;
        y: number;
        w: number;
        h: number;
        page: number;
      }> = [];
      nodes.forEach((node, nodeIdx) => {
        if (!node.classList.contains("catalog-toc")) return;
        const base = node.getBoundingClientRect();
        node
          .querySelectorAll<HTMLAnchorElement>("a[data-target-page]")
          .forEach((a) => {
            const page = Number(a.dataset.targetPage);
            const r = a.getBoundingClientRect();
            tocLinks.push({
              nodeIdx,
              x: r.left - base.left,
              y: r.top - base.top,
              w: r.width,
              h: r.height,
              page,
            });
          });
      });
      try {
        const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
          import("jspdf"),
          import("html2canvas-pro"),
        ]);
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });
        const pageW = 210;
        const pageH = 297;
        const k = pageW / A4_W;
        // کیفیت تطبیقی: برای کاتالوگ‌های حجیم سبک‌تر
        const scale = nodes.length > 150 ? 2 : nodes.length > 60 ? 2.25 : 2.5;
        const quality = nodes.length > 150 ? 0.82 : 0.9;
        for (let i = 0; i < nodes.length; i++) {
          setExportProgress({ current: i + 1, total: nodes.length });
          const canvas = await html2canvas(nodes[i], {
            scale,
            backgroundColor: getComputedStyle(nodes[i]).backgroundColor,
            useCORS: true,
          });
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (i > 0) pdf.addPage();
          pdf.addImage(dataUrl, "JPEG", 0, 0, pageW, pageH);
          for (const l of tocLinks) {
            if (l.nodeIdx !== i) continue;
            pdf.link(l.x * k, l.y * k, l.w * k, l.h * k, {
              pageNumber: l.page,
            });
          }
        }
        pdf.save("ariyatechno-catalog.pdf");
        showToast(
          `فایل PDF کاتالوگ (${nodes.length.toLocaleString("fa-IR")} صفحه) دانلود شد`,
        );
      } finally {
        for (const node of nodes) {
          node.style.width = "";
          node.style.height = "";
          node.style.overflow = "";
        }
      }
    } catch (err) {
      console.error("PDF export failed:", err);
      showToast("خطا در ساخت فایل PDF");
    } finally {
      setIsExportingPdf(false);
      setExportProgress(null);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#0b0f19] text-gray-100 font-sans selection:bg-orange-500 selection:text-white"
    >
      {/* استایل اختصاصی چاپ برای خروجی تمیز بدون هدرها و ابزارک‌های اضافی */}
      <style>{`
        * {
          font-family: '${font.family}', Tahoma, sans-serif;
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
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
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

          .catalog-toc a {
            color: inherit;
            text-decoration: none;
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
              A
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-wider bg-gradient-to-r from-white via-gray-200 to-orange-400 bg-clip-text text-transparent">
                  ariyatechno
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

            <div
              className="flex items-center gap-1.5"
              title="پالت رنگی خروجی PDF"
            >
              {CATALOG_PALETTES.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => choosePalette(pl.id)}
                  title={pl.name}
                  aria-label={pl.name}
                  className="w-5 h-5 rounded-full border-2 transition"
                  style={{
                    backgroundColor: pl.swatch,
                    borderColor:
                      pl.id === palette.id ? "#ffffff" : "transparent",
                  }}
                />
              ))}
            </div>

            <select
              value={fontId}
              onChange={(e) => chooseFont(e.target.value)}
              title="فونت خروجی PDF"
              className="bg-gray-900/60 border border-gray-700/80 text-gray-200 text-xs rounded-lg px-2 py-2 cursor-pointer"
            >
              {CATALOG_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleDownloadPdfFile}
              disabled={isExportingPdf}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
              title="دانلود فایل PDF کاتالوگ بدون هدر و آدرس سایت"
            >
              {isExportingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              {isExportingPdf
                ? exportProgress
                  ? `صفحه ${exportProgress.current.toLocaleString("fa-IR")} از ${exportProgress.total.toLocaleString("fa-IR")}`
                  : "در حال ساخت..."
                : "دانلود فایل PDF"}
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
            <label className="flex items-center gap-2 cursor-pointer bg-gray-900/60 px-3 py-1.5 rounded-lg border border-gray-700/80 hover:border-gray-600 transition">
              <input
                type="checkbox"
                checked={showPriceless}
                onChange={togglePriceless}
                className="rounded accent-orange-500 cursor-pointer"
              />
              <span>نمایش محصولات بدون قیمت (تماس بگیرید) در خروجی</span>
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
                    className="bg-[#131b2e] rounded-2xl border border-gray-800 hover:border-orange-500/40 transition-all duration-300 overflow-hidden flex flex-col justify-between group shadow-lg hover:shadow-orange-500/10 hover:-translate-y-0.5"
                  >
                    <div>
                      {/* تصویر و برچسب‌ها */}
                      <div className="relative h-56 bg-[radial-gradient(circle_at_50%_35%,#24304d_0%,#0c1220_75%)] p-4 flex items-center justify-center overflow-hidden border-b border-gray-800/60">
                        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(249,115,22,0.08),transparent_55%)]" />
                        <img
                          src={product.image}
                          alt={product.title}
                          className="relative max-h-full max-w-full object-contain filter drop-shadow-2xl group-hover:scale-105 transition duration-300"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              PLACEHOLDER_IMAGE;
                          }}
                        />
                        {product.brand && (
                          <span className="absolute top-3 left-3 text-[10px] font-extrabold tracking-wider px-2.5 py-1 rounded-lg bg-[#0b0f19]/85 text-orange-400 border border-orange-500/40 backdrop-blur-sm shadow">
                            {product.brand}
                          </span>
                        )}
                        {product.badge && (
                          <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-lg bg-gradient-to-l from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
                            {product.badge}
                          </span>
                        )}
                        <span className="absolute bottom-2.5 left-2.5 text-[10px] font-mono px-2 py-0.5 rounded bg-black/70 text-gray-300 backdrop-blur-sm">
                          {product.capacity || "UltraSur"}
                        </span>
                      </div>

                      {/* عنوان و مشخصات */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <h3 className="font-bold text-sm text-white group-hover:text-orange-400 transition leading-relaxed">
                            {product.title}
                          </h3>
                          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-800 text-gray-400 border border-gray-700">
                            {CATEGORIES.find((c) => c.id === product.category)
                              ?.name ?? ""}
                          </span>
                        </div>

                        <ul className="space-y-1.5 text-xs text-gray-300 bg-[#0b0f19] p-3 rounded-xl border border-gray-800/80">
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

                    {/* پنل قیمت بزرگ + دکمه‌های کنترل */}
                    <div className="px-4 pb-4 mt-auto">
                      <div className="bg-gradient-to-l from-amber-500/15 via-orange-500/10 to-transparent border border-amber-500/30 rounded-xl p-3 mb-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-amber-200/80">
                            قیمت عمده
                          </span>
                          <div className="flex items-center gap-1.5 flex-1 justify-end">
                            <input
                              type="number"
                              value={product.price || ""}
                              onChange={(e) =>
                                handleQuickPriceChange(
                                  product.id,
                                  e.target.value,
                                )
                              }
                              className="w-36 bg-[#0b0f19] border border-amber-500/40 rounded-lg px-3 py-1.5 text-sm text-left font-black text-amber-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40"
                              placeholder="قیمت..."
                            />
                            <span className="text-[11px] font-bold text-amber-200/70">
                              {product.price ? "تومان" : "تماس بگیرید"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
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
          /* ================= قالب چاپی PDF: جلد + فهرست انکردار + همه محصولات ================= */
          <div className="catalog-print-container">
            <div className="no-print mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  این پیش‌نمایش شامل جلد، فهرست انکردار و همه{" "}
                  {catalogProducts.length.toLocaleString("fa-IR")} محصول به تفکیک
                  دسته‌بندی است. با کلیک روی ردیف‌های فهرست می‌توانید به بخش
                  مربوطه بپرید.
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold opacity-70 ml-1">
                  پالت رنگی:
                </span>
                {CATALOG_PALETTES.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => choosePalette(pl.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition"
                    style={{
                      backgroundColor: pl.swatchBg,
                      borderColor:
                        pl.id === palette.id ? pl.accent : pl.border,
                      color: pl.id === palette.id ? pl.accentSoft : pl.muted,
                    }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: pl.accent }}
                    />
                    {pl.name}
                  </button>
                ))}
                <span className="text-[10px] font-bold opacity-70 ml-1">
                  فونت:
                </span>
                {CATALOG_FONTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => chooseFont(f.id)}
                    className="px-2.5 py-1 rounded-lg border text-[11px] font-bold transition"
                    style={{
                      fontFamily: f.family,
                      backgroundColor:
                        f.id === font.id
                          ? "rgba(245, 158, 11, 0.2)"
                          : "transparent",
                      borderColor:
                        f.id === font.id ? "#fbbf24" : "rgba(245, 158, 11, 0.3)",
                      color:
                        f.id === font.id ? "#fcd34d" : "rgba(252, 211, 77, 0.7)",
                    }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>

              <button
                onClick={handleDownloadPdfFile}
                disabled={isExportingPdf}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-black font-extrabold px-4 py-2 rounded-xl transition shrink-0 flex items-center gap-2"
              >
                {isExportingPdf && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                {isExportingPdf
                  ? exportProgress
                    ? `صفحه ${exportProgress.current.toLocaleString("fa-IR")} از ${exportProgress.total.toLocaleString("fa-IR")}`
                    : "در حال ساخت فایل..."
                  : "دانلود فایل PDF کاتالوگ"}
              </button>
            </div>

            {/* صفحه ۱: جلد کاتالوگ ariyatechno */}
            <div className="catalog-page p-8 mb-8 flex flex-col justify-between" style={cs.cover}>
              <div className="flex justify-between items-center border-b pb-5" style={cs.line}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl overflow-hidden shadow-lg" style={cs.logoBig}>
                    <img
                      src="images/logo.png"
                      alt="لوگوی ariyatechno"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h1 className="text-3xl font-black tracking-wider" style={cs.text}>
                      ariyatechno
                      <span style={cs.accent}>.</span>
                    </h1>
                    <p className="text-xs font-semibold mt-0.5" style={cs.accentSoft}>
                      کاتالوگ لوازم جانبی و کالاهای دیجیتال
                    </p>
                  </div>
                </div>
                <div className="text-left font-mono text-xs" style={cs.muted}>
                  <span className="px-3 py-1 rounded-full border font-bold" style={cs.chipSolid}>
                    OFFICIAL CATALOGUE
                  </span>
                </div>
              </div>

              {/* آمار کاتالوگ */}
              <div className="flex items-center justify-center gap-3 my-6">
                <span className="px-4 py-1.5 rounded-xl border text-xs font-bold" style={cs.chipAccent}>
                  {catalogProducts.length.toLocaleString("fa-IR")} محصول
                </span>
                <span className="px-4 py-1.5 rounded-xl border text-xs font-bold" style={cs.chipSoft}>
                  {categoryGroups.length.toLocaleString("fa-IR")} دسته‌بندی
                </span>
                <span className="px-4 py-1.5 rounded-xl border text-xs font-bold" style={cs.chipSoft}>
                  ariyatechno
                </span>
              </div>

              {/* شبکه ۸تایی محصولات جلد کاتالوگ */}
              <div className="grid grid-cols-4 gap-4 my-2">
                {catalogProducts.slice(0, 8).map((p) => (
                  <div
                    key={p.id}
                    className="border rounded-2xl p-3 flex flex-col items-center justify-center text-center" style={cs.gridCard}
                  >
                    <img
                      src={p.image}
                      alt={p.title}
                      className="h-28 w-28 object-contain mb-2 filter drop-shadow-md"
                    />
                    <span className="text-[11px] font-medium line-clamp-1" style={cs.text}>
                      {p.title}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-center pt-6 border-t" style={cs.line}>
                <p className="text-lg font-bold tracking-widest uppercase" style={cs.accentSoft}>
                  Saving on quality is meaningless.
                </p>
                <p className="text-xs mt-1" style={cs.muted}>
                  صرفه‌جویی در کیفیت بی‌معناست • تضمین اصالت کالا
                </p>
              </div>
            </div>

            {/* فهرست انکردار چندصفحه‌ای (ایندکس کاتالوگ) */}
            {tocChunks.map((tocRows, tocIdx) => (
              <div
                key={`toc-${tocIdx}`}
                className="catalog-page catalog-toc p-8 mb-8 flex flex-col" style={cs.page}
              >
                <div className="flex justify-between items-center border-b pb-3 mb-6" style={cs.line}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg overflow-hidden" style={cs.logoTile}>
                          <img
                            src="images/logo.png"
                            alt="لوگوی ariyatechno"
                            className="w-full h-full object-cover"
                          />
                        </div>
                    <span className="font-extrabold text-base tracking-wider" style={cs.text}>
                      ariyatechno
                    </span>
                  </div>
                  <span className="text-xs font-mono" style={cs.muted}>
                    صفحه {(2 + tocIdx).toLocaleString("fa-IR")} • فهرست مطالب
                  </span>
                </div>

                <h2 className="text-xl font-black mb-1" style={cs.text}>
                  فهرست دسته‌بندی‌های کاتالوگ
                </h2>
                <p className="text-xs mb-6" style={cs.muted}>
                  با کلیک روی هر ردیف، به صفحه شروع آن دسته‌بندی منتقل می‌شوید.
                </p>

                <div className="space-y-2 flex-1">
                  {tocRows.map((group) => {
                    const Icon = group.icon;
                    return (
                      <a
                        key={group.id}
                        href={`#cat-${group.id}`}
                        data-target-page={group.startPage}
                        className="flex items-center gap-3 border rounded-xl px-4 py-2.5 transition-colors" style={cs.row}
                      >
                        <Icon className="w-4 h-4 shrink-0" style={cs.accent} />
                        <span className="text-sm font-bold" style={cs.text}>
                          {group.name}
                        </span>
                        <span className="flex-1 border-b border-dotted mx-2 translate-y-0.5" style={cs.dotted} />
                        <span className="text-xs font-medium" style={cs.muted}>
                          {group.items.length.toLocaleString("fa-IR")} محصول
                        </span>
                        <span className="text-xs font-black border rounded-lg px-2.5 py-1" style={cs.pageBadge}>
                          صفحه {group.startPage.toLocaleString("fa-IR")}
                        </span>
                      </a>
                    );
                  })}
                </div>

                <div className="pt-4 mt-5 border-t flex justify-between items-center text-xs" style={cs.rule}>
                  <span className="font-semibold tracking-wide" style={cs.footerBrand}>
                    ariyatechno ACCESSORIES
                  </span>
                  <span className="italic">
                    Saving on quality is meaningless.
                  </span>
                </div>
              </div>
            ))}

            {/* صفحات محصولات: همه محصولات به تفکیک دسته‌بندی */}
            {categoryPages.map((group) => {
              const chunks: Product[][] = [];
              if (group.items.length > 0) {
                chunks.push(
                  group.items.slice(0, Math.min(2, group.items.length)),
                );
              }
              for (let i = 2; i < group.items.length; i += 3) {
                chunks.push(group.items.slice(i, i + 3));
              }
              return chunks.map((chunk, chunkIdx) => {
                const pageNo = group.startPage + chunkIdx;
                return (
                  <div
                    key={`${group.id}-${chunkIdx}`}
                    id={chunkIdx === 0 ? `cat-${group.id}` : undefined}
                    className="catalog-page p-6 mb-8 flex flex-col justify-between" style={cs.page}
                  >
                    <div className="flex justify-between items-center border-b pb-3 mb-4" style={cs.line}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg overflow-hidden" style={cs.logoTile}>
                          <img
                            src="images/logo.png"
                            alt="لوگوی ariyatechno"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="font-extrabold text-base tracking-wider" style={cs.text}>
                          ariyatechno
                        </span>
                        <span className="text-xs mr-2" style={cs.faint}>
                          | {group.name}
                        </span>
                      </div>
                      <span className="text-xs font-mono" style={cs.muted}>
                        صفحه {pageNo.toLocaleString("fa-IR")} از{" "}
                        {totalPages.toLocaleString("fa-IR")}
                      </span>
                    </div>

                    {chunkIdx === 0 && (
                      <div className="mb-4 -mt-1">
                        <h2 className="text-lg font-black flex items-center gap-2" style={cs.accent}>
                          <group.icon className="w-5 h-5" />
                          {group.name}
                        </h2>
                        <p className="text-[11px] mt-0.5" style={cs.faint}>
                          {group.items.length.toLocaleString("fa-IR")} محصول در
                          این دسته‌بندی
                        </p>
                      </div>
                    )}

                    <div className="space-y-3 flex-1">
                      {chunk.map((item) => (
                        <div
                          key={item.id}
                          className="print-card border rounded-2xl p-3 flex flex-col md:flex-row items-center gap-3" style={cs.card}
                        >
                          <div className="w-full md:w-72 aspect-square rounded-xl flex items-center justify-center p-3 shrink-0 border" style={cs.imageBox}>
                            <img
                              src={item.image}
                              alt={item.title}
                              className="max-h-full max-w-full object-contain filter drop-shadow-xl"
                            />
                          </div>

                          <div className="flex-1 w-full">
                            <div className="mb-2">
                              <h3 className="text-sm font-extrabold leading-snug line-clamp-2" style={cs.text}>
                                {item.title}
                              </h3>
                              {(item.brand || item.badge) && (
                                <div className="flex items-center flex-wrap gap-2 mt-1.5">
                                  {item.brand && (
                                    <span className="text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-md border" style={cs.brandChip}>
                                      {item.brand}
                                    </span>
                                  )}
                                  {item.badge && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border" style={cs.badgeChip}>
                                      {item.badge}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3" style={cs.muted}>
                              {item.specs &&
                                item.specs.slice(0, 6).map((sp, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="flex items-start gap-1.5 py-0.5"
                                  >
                                    <span className="font-bold" style={cs.bullet}>
                                      •
                                    </span>
                                    <span className="leading-snug line-clamp-2">
                                      {sp}
                                    </span>
                                  </div>
                                ))}
                            </div>

                            {showPricesInPrint && (
                              <div className="w-full border-2 rounded-xl px-4 py-2.5 flex items-center justify-between" style={cs.priceBox}>
                                <span className="text-xs font-semibold" style={cs.priceLabel}>
                                  قیمت عمده
                                </span>
                                <span className="text-xl font-black" style={cs.priceValue}>
                                  {formatToman(item.price)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 mt-5 border-t flex justify-between items-center text-xs" style={cs.rule}>
                      <span className="font-semibold tracking-wide" style={cs.footerBrand}>
                        ariyatechno ACCESSORIES
                      </span>
                      <span className="font-mono">
                        صفحه {pageNo.toLocaleString("fa-IR")} از{" "}
                        {totalPages.toLocaleString("fa-IR")}
                      </span>
                      <span className="italic">
                        Saving on quality is meaningless.
                      </span>
                    </div>
                  </div>
                );
              });
            })}

            {/* پشت‌جلد */}
            <div className="catalog-page p-8 mb-8 flex flex-col items-center justify-center text-center" style={cs.cover}>
              <div className="w-16 h-16 rounded-2xl overflow-hidden" style={cs.logoTile}>
                <img
                  src="images/logo.png"
                  alt="لوگوی ariyatechno"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-5 text-3xl font-black tracking-wider">
                ariyatechno.
              </div>
              <div className="mt-2 text-sm font-semibold" style={cs.accentSoft}>
                کاتالوگ لوازم جانبی و کالاهای دیجیتال
              </div>
              <div className="mt-8 text-xs leading-7" style={cs.muted}>
                صرفه‌جویی در کیفیت بی‌معناست • تضمین اصالت کالا
              </div>
              <div className="mt-auto pt-8 text-[10px] font-mono" style={cs.faint}>
                {totalPages.toLocaleString("fa-IR")} • پایان کاتالوگ
              </div>
            </div>
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
                    نام برند (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    placeholder="مثال: UltraSur"
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
