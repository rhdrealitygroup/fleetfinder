// MarketCheck + Auto.dev integration core. Shared by every /api/* search route.
// Ported and consolidated from the Base44 backend functions, with the trim
// logic rebuilt (see list-trims route) to fix the long-standing bugs.

export const MC_HOST = "https://api.marketcheck.com/v2";
export const AUTO_DEV_HOST = "https://api.auto.dev";

// Search defaults — centered on Oakhurst NJ (07755), brother's territory.
// MarketCheck Free tier rejects nationwide searches, so we always pass a
// lat/lng + radius. Bump RADIUS when we upgrade to a paid MarketCheck tier.
export const DEFAULT_LAT = 40.2606;
export const DEFAULT_LNG = -74.009;
export const DEFAULT_ZIP = "07755";
export const RADIUS_MILES = 100;
export const MAX_RESULTS = 50;
export const PAGE_SIZE = 50;

export const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const titleCase = (s: unknown) =>
  !s ? "" : String(s).replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

// Ensure a URL is clickable. Providers sometimes return bare domains or
// protocol-relative paths.
export function normalizeUrl(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("/")) return "";
  if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return "https://" + s;
  return "";
}

// Derive a base color (Black/White/Red/…) from a marketing name.
export function normalizeBaseColor(raw: unknown): string {
  if (!raw) return "";
  const s = String(raw).toLowerCase();
  const map: Record<string, string> = {
    black: "Black", onyx: "Black", obsidian: "Black", ebony: "Black", midnight: "Black",
    white: "White", pearl: "White", snowflake: "White", glacier: "White", arctic: "White", ivory: "White",
    silver: "Silver", platinum: "Silver", lunar: "Silver", chrome: "Silver",
    gray: "Gray", grey: "Gray", graphite: "Gray", magnetic: "Gray", shadow: "Gray", granite: "Gray",
    red: "Red", crimson: "Red", scarlet: "Red", ruby: "Red", garnet: "Red", cherry: "Red", barcelona: "Red", rallye: "Red",
    blue: "Blue", navy: "Blue", azure: "Blue", cobalt: "Blue", indigo: "Blue", marina: "Blue", riptide: "Blue",
    green: "Green", olive: "Green", forest: "Green", emerald: "Green", sage: "Green",
    brown: "Brown", bronze: "Brown", mocha: "Brown", chocolate: "Brown", chestnut: "Brown",
    beige: "Beige", tan: "Beige", sand: "Beige", desert: "Beige", khaki: "Beige",
    yellow: "Yellow", gold: "Yellow",
    orange: "Orange", copper: "Orange",
    purple: "Purple", violet: "Purple", plum: "Purple",
  };
  for (const key of Object.keys(map)) if (s.includes(key)) return map[key];
  return titleCase(raw);
}

export function normalizeFeature(s: unknown): string {
  const x = String(s || "").trim();
  if (!x) return "";
  return titleCase(x)
    .replace(/\bCarplay\b/g, "CarPlay")
    .replace(/\bUsb\b/g, "USB")
    .replace(/\bSuv\b/g, "SUV")
    .replace(/\bWifi\b/g, "WiFi");
}

// ── Trim normalization — the core of the trims fix ────────────────────────
// MarketCheck listing facets return raw trim strings that often carry package
// or drivetrain suffixes ("xDrive40i Sport", "Limited w/ Tech Pkg"). Feeding
// those back as an exact `trim` filter returns zero results. We canonicalize
// for dedup/matching while preserving a clean display name.
export function canonicalTrimKey(raw: unknown): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/\bw\/?\b.*$/i, "")           // drop "w/ Tech Package" tails
    .replace(/\b(pkg|package|group|edition|pref(erred)?)\b.*$/i, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// MarketCheck's `version` field carries the full granular config, e.g.
// "Denali Extended Range Crew Cab e4WD". The trim ("Denali") is only the top
// level — the meaningful sub-variant ("Extended Range") is what agents pick
// between. This strips the trim name + body/cab/drivetrain boilerplate to
// leave the distinguishing part (range, package level, etc.).
const VERSION_NOISE = [
  "crew cab", "double cab", "regular cab", "extended cab", "super cab", "supercrew", "supercab", "quad cab", "king cab", "access cab", "mega cab", "club cab",
  "cab", "pickup", "sedan", "suv", "coupe", "convertible", "wagon", "hatchback", "van", "minivan", "truck",
  "e4wd", "4wd", "awd", "rwd", "fwd", "2wd", "4x4", "4x2", "e-4wd",
  "short bed", "long bed", "standard bed", "std bed",
  "short box", "long box", "standard box", "std box",
];

// Common automotive trim acronyms that should stay uppercase (titleCase would
// mangle "AT4" → "At4", "XLT" → "Xlt"). Plus any short token containing a digit.
const TRIM_ACRONYMS = new Set([
  "XL", "XLT", "STX", "SLE", "SLT", "GT", "RST", "TRD", "SR", "SR5", "SE", "SEL",
  "LE", "LX", "EX", "SX", "RS", "LT", "LTZ", "GLI", "GTI", "SS", "SV", "SL", "SHO",
  "AT4", "ZR2", "Z71", "TRX", "GLE", "GLB", "GLC", "GLA", "CLA", "AMG", "S", "RT",
]);
export function prettyTrim(s: string): string {
  return String(s || "")
    .split(/\s+/)
    .map((w) => {
      const u = w.toUpperCase();
      if (/\d/.test(w) && w.length <= 4) return u;
      if (TRIM_ACRONYMS.has(u)) return u;
      return w;
    })
    .join(" ")
    .trim();
}

// Fix known MarketCheck source typos in config/range labels.
function fixTypos(s: string): string {
  return s.replace(/\bstamdard\b/gi, "Standard").replace(/\bextened\b/gi, "Extended");
}
export function parseVariant(version: string, trim: string): string {
  let s = String(version || "").trim();
  if (!s) return "";
  // Drop the leading trim name (case-insensitive).
  const t = String(trim || "").trim();
  if (t && s.toLowerCase().startsWith(t.toLowerCase())) s = s.slice(t.length).trim();
  let low = s.toLowerCase();
  for (const noise of VERSION_NOISE) {
    low = low.replace(new RegExp(`\\b${noise.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " ");
  }
  // Rebuild from the original words that survived (preserve original casing).
  const keep = new Set(low.split(/\s+/).filter(Boolean));
  const out = s.split(/\s+/).filter((w) => keep.has(w.toLowerCase()));
  return fixTypos(out.join(" ").replace(/\s+/g, " ").trim());
}

export type UnifiedVehicle = {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  version: string;
  price: number;
  msrp: number;
  est_monthly: number;
  body_type: string;
  fuel_type: string;
  drivetrain: string;
  exterior_color: string;
  base_color: string;
  mileage: number;
  dealer_name: string;
  dealer_key: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  listing_url: string;
  dealer_url: string;
  image_url: string;
  photo_gallery: string[];
  photo_count: number;
  monroney_url: string;
  inventory_type: string;
  is_cpo: boolean;
  raw_options: unknown[];
  status: string;
  days_listed: number;
  features: string[];
};

function estMonthlyCard(price: number, msrp: number) {
  const residual = (msrp * 58) / 100;
  return Math.round((price - residual) / 36 + (price + residual) * 0.0015);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// MarketCheck listing → unified shape.
export function mcListing(l: any): UnifiedVehicle {
  const build = l.build || {};
  const dealer = l.dealer || {};
  const price = num(l.price || l.msrp);
  const msrp = num(l.msrp || l.price);
  const features = Array.isArray(l.high_value_features)
    ? l.high_value_features.map(normalizeFeature).filter(Boolean)
    : [];
  return {
    vin: (l.vin || "").toUpperCase(),
    year: num(build.year),
    make: titleCase(build.make),
    model: titleCase(build.model),
    trim: prettyTrim(titleCase(build.trim)),
    version: String(build.version || ""),
    price, msrp, est_monthly: estMonthlyCard(price, msrp),
    body_type: titleCase(build.body_type),
    fuel_type: titleCase(build.fuel_type),
    drivetrain: build.drivetrain || "",
    exterior_color: titleCase(l.exterior_color || l.base_ext_color),
    base_color: titleCase(l.base_ext_color || l.exterior_color),
    mileage: num(l.miles),
    dealer_name: titleCase(dealer.name),
    dealer_key: (l.source || "").toLowerCase(),
    city: titleCase(dealer.city),
    state: (dealer.state || "").toUpperCase(),
    latitude: num(l.dealer?.latitude || l.dealer?.lat || l.latitude),
    longitude: num(l.dealer?.longitude || l.dealer?.lng || l.longitude),
    listing_url: normalizeUrl(l.vdp_url),
    dealer_url: normalizeUrl(dealer.website || `https://${l.source || ""}`),
    image_url: (l.media?.photo_links || [])[0] || "",
    photo_gallery: Array.isArray(l.media?.photo_links) ? l.media.photo_links.slice(0, 30) : [],
    photo_count: Number(l.media?.photo_links?.length) || 0,
    monroney_url: normalizeUrl(l.media?.monroney || l.monroney),
    inventory_type: String(l.inventory_type || "").toLowerCase(),
    is_cpo: !!l.is_certified || String(l.inventory_type || "").toLowerCase() === "certified",
    raw_options: Array.isArray(l.options) ? l.options : [],
    status: "In Stock",
    days_listed: num(l.dos_active || l.dom),
    features,
  };
}

// Auto.dev listing → unified shape.
export function adListing(l: any): UnifiedVehicle {
  const v = l.vehicle || {};
  const r = l.retailListing || {};
  const price = num(r.price);
  const msrp = price;
  const rawFeats = Array.isArray(v.features) ? v.features
    : Array.isArray(r.features) ? r.features
    : Array.isArray(v.high_value_features) ? v.high_value_features : [];
  const features = rawFeats.map(normalizeFeature).filter(Boolean);
  return {
    vin: (l.vin || "").toUpperCase(),
    year: num(v.year),
    make: titleCase(v.make),
    model: titleCase(v.model),
    trim: titleCase(v.trim),
    version: String(v.version || v.trim || ""),
    price, msrp, est_monthly: estMonthlyCard(price, msrp),
    body_type: titleCase(v.bodyStyle),
    fuel_type: titleCase(v.fuel),
    drivetrain: v.drivetrain || "",
    exterior_color: titleCase(v.exteriorColor || r.exteriorColor),
    base_color: titleCase(v.baseExteriorColor || normalizeBaseColor(v.exteriorColor || r.exteriorColor)),
    mileage: num(r.miles),
    dealer_name: titleCase(r.dealer),
    dealer_key: (r.dealer || "").toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com",
    city: titleCase(r.city),
    state: (r.state || "").toUpperCase(),
    latitude: num(r.latitude || r.lat || r.dealerLatitude),
    longitude: num(r.longitude || r.lng || r.dealerLongitude),
    listing_url: normalizeUrl(r.vdp),
    dealer_url: normalizeUrl(r.dealerUrl || r.dealerWebsite || ""),
    image_url: r.primaryImage || "",
    photo_gallery: Array.isArray(r.images) ? r.images.slice(0, 30)
      : Array.isArray(r.photos) ? r.photos.slice(0, 30)
      : (r.primaryImage ? [r.primaryImage] : []),
    photo_count: Number(r.imageCount || r.images?.length || 0),
    monroney_url: normalizeUrl(r.monroneyUrl || r.windowSticker || ""),
    inventory_type: String(r.condition || (r.used ? "used" : "new")).toLowerCase(),
    is_cpo: !!(r.certified || r.cpo),
    raw_options: Array.isArray(v.options) ? v.options : Array.isArray(r.options) ? r.options : [],
    status: "In Stock",
    days_listed: num(r.daysOnMarket),
    features,
  };
}

export function mcKey() {
  return process.env.MARKETCHECK_API_KEY || "";
}
export function autoDevKey() {
  return process.env.AUTO_DEV_API_KEY || "";
}
