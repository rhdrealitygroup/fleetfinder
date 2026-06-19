// MarketCheck + Auto.dev integration core. Shared by every /api/* search route.
// Ported and consolidated from the Base44 backend functions, with the trim
// logic rebuilt (see list-trims route) to fix the long-standing bugs.

import { cacheGet, cacheSet, DAY } from "@/lib/memoryCache";
import { CAR_CATALOG } from "@/lib/carCatalog";

export const MC_HOST = "https://api.marketcheck.com/v2";
export const AUTO_DEV_HOST = "https://api.auto.dev";

// Search is nationwide: agents enter any customer ZIP for local inventory, and
// a blank search scans the whole country (MarketCheck Basic tier allows
// unbounded nationwide queries). These lat/lng/zip defaults are now only used
// by the Auto.dev fallback, which still requires a center point.
export const DEFAULT_LAT = 40.2606;
export const DEFAULT_LNG = -74.009;
export const DEFAULT_ZIP = "07755";
export const RADIUS_MILES = 100; // default radius; Standard tier allows up to 500
export const MAX_RESULTS = 1500; // Standard tier: start offset caps at 1500
export const PAGE_SIZE = 50;     // MarketCheck's max rows/request — asking for >50 makes the API ignore it and return its DEFAULT of 10 (the "showing first 10" bug)

export const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// fetch with a hard per-request timeout. A single hung MarketCheck request would
// otherwise block a whole cron/search (maxDuration=60) until the platform kills
// the function mid-loop — skipping cleanup (e.g. the dump's lock-release finally)
// and starving the rest of the batch. On timeout this throws (AbortError), which
// callers treat the same as a failed response (no destructive sweep / leave
// undecoded). Default 12s leaves room for several sequential calls within 60s.
export async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Word-boundary phrase match. True only when `needle` appears in `hay` bounded
// by non-alphanumerics on both sides — so "tow" does NOT match "Towel Hooks",
// "red" does NOT match "Predator", "sport" does NOT match "Passport". Used by
// the option/feature filters (search + diagnose) instead of raw .includes(),
// which produced false matches. Multi-word needles match as a contiguous phrase.
const RX_ESCAPE = /[.*+?^${}()|[\]\\]/g;
export function phraseMatch(hay: string, needle: string): boolean {
  const n = String(needle || "").trim().toLowerCase();
  if (!n) return false;
  const h = String(hay || "").toLowerCase();
  const esc = n.replace(RX_ESCAPE, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(h);
}

// Bidirectional word-boundary match: handles the case where either side is the
// shorter token (e.g. facet "sunroof" vs requested "ultraview sunroof").
export function phraseMatchEither(a: string, b: string): boolean {
  return phraseMatch(a, b) || phraseMatch(b, a);
}

// Capitalize each alphabetic run — handles "Mercedes-Benz", "Big Horn/Lone
// Star", "F-Pace" correctly (the old \w\S* version lowercased after / and -).
export const titleCase = (s: unknown) =>
  !s ? "" : String(s).replace(/[a-zA-Z]+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

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

// ── Color-name cleanup (exterior + interior dropdowns) ────────────────────────
// Dealer free-text colors arrive truncated ("Agate Blk Met"), abbreviated, and
// padded with junk codes ("Dr", "Js", "M7", "9b"). normalizeColorName expands
// the common truncations so spelling variants collapse into one bucket, and
// isJunkColor drops the code-like garbage. Both are token-based and only touch
// WHOLE tokens, so real names ("Red", "Jet Black", "GT Silver") pass through.
const COLOR_ABBREV: Record<string, string> = {
  blk: "Black", wht: "White", whi: "White", sil: "Silver", slv: "Silver",
  slvr: "Silver", gry: "Gray", grey: "Gray", blu: "Blue", grn: "Green",
  brn: "Brown", brz: "Bronze", chrcl: "Charcoal", chcl: "Charcoal",
  met: "Metallic", mtl: "Metallic", mtlc: "Metallic", metalic: "Metallic",
  prl: "Pearl", pearlcoat: "Pearl", burg: "Burgundy", dk: "Dark", lt: "Light",
  drk: "Dark", med: "Medium", grnt: "Granite", snd: "Sand",
};
export function normalizeColorName(raw: unknown): string {
  const s = String(raw || "")
    .replace(/\s+Exterior Paint$/i, "")
    .replace(/\s+Clear-?Coat\b/gi, " Clear-Coat")
    .replace(/[._]+/g, " ")
    .trim();
  if (!s) return "";
  return s
    .split(/\s+/)
    .map((tok) => {
      const k = tok.toLowerCase().replace(/[^a-z]/g, "");
      if (COLOR_ABBREV[k]) return COLOR_ABBREV[k];
      return tok.charAt(0).toUpperCase() + tok.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
// True when a (cleaned) color name is dealer junk — a code with no real word.
// "Real word" = a token of >=3 letters containing a vowel. Drops "Dr", "Js",
// "M7", "Yz", "Um", "9b"; keeps "Red", "Tan", "Jet Black", "Agate Black".
export function isJunkColor(name: unknown): boolean {
  const s = String(name || "").trim();
  if (!s) return true;
  return !s.split(/\s+/).some((t) => {
    const letters = t.replace(/[^a-zA-Z]/g, "");
    return letters.length >= 3 && /[aeiou]/i.test(letters);
  });
}

// Strip dealer/factory paint-code cruft that rides on raw facet color strings:
// a LEADING code token ("0475 Black Sapphire Metallic" → "Black Sapphire
// Metallic", "0c36 Dravit Grey Metallic" → "Dravit Grey Metallic"), a TRAILING
// "- Pw7" / "/Ea03" code suffix, a trailing lone digit ("Wind Chill Pearl 1"),
// and stray asterisks. A leading token is only treated as a code when it holds a
// digit AND is either 3+ digits or a letter+digit mix — so a real first word
// ("8 Ball Black") is left alone. Pairs with normalizeColorName + isJunkColor,
// which drop anything with no real word left (pure codes like "Nh-731p").
export function scrubColorCode(raw: unknown): string {
  let s = String(raw || "").trim();
  // Leading factory code token: 3+ digits, OR an alnum mix with both a letter and
  // a digit (len>=2). A lone leading digit is NOT a code, so "8 Ball" / "30 Xdrive"
  // are left intact.
  const lead = /^(\S+)\s+(.*)$/.exec(s);
  if (lead) {
    const t = lead[1];
    const bare = t.replace(/[^0-9a-z]/gi, "");
    if (/\d/.test(t) && (/^\d{3,}$/.test(bare) || (/[a-z]/i.test(t) && bare.length >= 2))) s = lead[2];
  }
  s = s
    .replace(/^[0-9]{2,4}\s*\/\s*/, "")              // leading "040/" code prefix → drop
    .replace(/^[0-9]{3,4}(?=[a-z])/i, "")            // leading digit-glue "149white" → "white"
    .replace(/\s*[[(][^\])]*[\])]\s*$/g, " ")        // trailing "[extra Cost Color]" / "(g4j)" / "(red)"
    .replace(/\s+paint\s*$/i, "")                    // redundant trailing "Paint" ("Hydro Blue Pearl Paint" → "Hydro Blue Pearl")
    .replace(/\s*[-/]\s*\S*\d\S*\s*$/i, "")          // trailing "- Pw7" / "/Ea03" code
    // trailing short code with BOTH a letter and a digit ("41w","Pe2","M7","47c") —
    // leaves pure numbers ("Area 51") and real words untouched.
    .replace(/\s+(?=[0-9a-z]{1,4}$)(?=[0-9a-z]*[a-z])(?=[0-9a-z]*[0-9])[0-9a-z]{1,4}$/i, "")
    .replace(/\*+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Trailing pure 1–2 digit number ("Wind Chill Pearl 17" → "Wind Chill Pearl"),
  // but only when 2+ words remain — so a real name like "Area 51" is left intact.
  const tn = /^(.+\S)\s+\d{1,2}$/.exec(s);
  if (tn && tn[1].trim().split(/\s+/).length >= 2) s = tn[1].trim();
  return s;
}

// Placeholder "colors" that are not real colors — dropped outright.
const COLOR_PLACEHOLDERS = new Set([
  "other", "unknown", "special order", "paint to sample", "na", "n a", "tbd",
  "select", "extra cost color", "color", "exterior color", "interior color",
  "primer", "undercoat", "audi exclusive special paint color", "custom", "various",
]);
// True for a cleaned name that's a placeholder, or a single smushed token that
// still carries a digit ("Col74000", "0p0p", "J2j2/puregray") — i.e. a code, not
// a color. Real one-word colors never contain a digit.
function isPlaceholderOrCode(cleaned: string): boolean {
  const low = cleaned.toLowerCase();
  if (COLOR_PLACEHOLDERS.has(low)) return true;
  if (!/\s/.test(cleaned) && /\d/.test(cleaned)) return true;
  return false;
}

// Clean + dedupe a raw exterior/interior color facet into display buckets.
// Mirrors the list-colors route (normalizeColorName + isJunkColor + variant
// bucketing) PLUS the factory-code scrub, so the persisted catalog matches what
// the live picker shows. Keeps the RAW facet values in `variants` for exact
// MarketCheck filtering later.
export function cleanColorFacet(
  items: { item?: unknown; count?: unknown }[],
): { name: string; count: number; variants: string[] }[] {
  const dedupKey = (name: string) => name.toLowerCase()
    .replace(/\s+(metallic|pearl|pearl-?coat|clear-?coat|tricoat|tri-?coat|mica)\s*$/i, "")
    .replace(/\s+(i{1,3}|iv|v|vi)\s*$/i, "")
    .replace(/\s+[0-9a-z]{0,3}[0-9][0-9a-z]{0,3}$/i, "") // trailing residual code/number → collapse variants
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const numDigits = (s: string) => (s.match(/\d/g) || []).length;
  const buckets = new Map<string, { name: string; count: number; variants: string[] }>();
  for (const c of items || []) {
    const raw = String(c.item || "").trim();
    const cleaned = normalizeColorName(scrubColorCode(c.item));
    if (!cleaned || isJunkColor(cleaned) || isPlaceholderOrCode(cleaned)) continue;
    const key = dedupKey(cleaned);
    if (!key) continue;
    const cnt = num(c.count);
    const prev = buckets.get(key);
    if (prev) {
      prev.count += cnt;
      // Prefer the cleanest display name in the bucket: fewest digits, then longer.
      if (numDigits(cleaned) < numDigits(prev.name) ||
          (numDigits(cleaned) === numDigits(prev.name) && cleaned.length > prev.name.length)) prev.name = cleaned;
      if (raw && !prev.variants.includes(raw)) prev.variants.push(raw);
    } else {
      buckets.set(key, { name: cleaned, count: cnt, variants: raw ? [raw] : [] });
    }
  }
  return [...buckets.values()].filter((c) => c.name.length > 0).sort((a, b) => a.name.localeCompare(b.name));
}

// Correct known misspellings carried on raw MarketCheck `version` strings
// (e.g. "Elevation Stamdard Range Crew Cab e4WD" → "Standard").
const VERSION_TYPOS: [RegExp, string][] = [
  [/\bStamdard\b/gi, "Standard"],
];
export function fixVersionName(raw: unknown): string {
  let s = String(raw || "");
  for (const [re, to] of VERSION_TYPOS) s = s.replace(re, to);
  return s.trim();
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
  "XL", "XLT", "XLE", "XSE", "STX", "SLE", "SLT", "GT", "RST", "TRD", "SR", "SR5",
  "SE", "SEL", "LE", "LX", "EX", "EXL", "EX-L", "SX", "RS", "LT", "LTZ", "GLI",
  "GTI", "SS", "SV", "SL", "SHO", "AT4", "ZR2", "Z71", "TRX", "GLE", "GLB", "GLC",
  "GLA", "CLA", "AMG", "S", "RT", "WT", "EV", "SRT", "RHO", "TRX", "GT", "Z",
]);
// Mercedes / EQ family prefixes that glue to a number ("Gle350" → "GLE 350").
const MB_PREFIX = /^(gle|glc|gls|gla|glb|eqs|eqe|eqb|cla|cls|amg|sl)$/i;

function prettyToken(w: string): string {
  const u = w.toUpperCase();
  if (TRIM_ACRONYMS.has(u)) return u;                 // EX-L, XLE, AT4…
  if (w.includes("-")) return w.split("-").map(prettyToken).join("-");
  // Mercedes-style letters+digits(+letter): Gle350 → GLE 350, Gle450e → GLE 450e
  let m = /^([A-Za-z]{2,4})(\d{2,4})([A-Za-z]?)$/.exec(w);
  if (m && MB_PREFIX.test(m[1])) return m[1].toUpperCase() + " " + m[2] + (m[3] ? m[3].toLowerCase() : "");
  // BMW/Audi number+letter: 330I → 330i, 530E → 530e
  m = /^(\d{2,4})([a-zA-Z])$/.exec(w);
  if (m) return m[1] + m[2].toLowerCase();
  if (/\d/.test(w) && w.length <= 4) return u;          // Z71, SR5, 4WT
  return w;
}

export function prettyTrim(s: string): string {
  return String(s || "").split(/\s+/).map(prettyToken).join(" ").trim();
}

// Drop "variants" that are really bed/wheelbase/config noise, not real choices.
export function isNoiseVariant(label: string): boolean {
  const l = label.toLowerCase();
  if (l.includes("|")) return true;                        // facet artifact
  if (/['‘’"“”]/.test(label)) return true;                 // 5'7", 6'4", 8' (bed)
  if (/\b(box|bed|lwb|swb|cwb|wb)\b/.test(l)) return true; // bed / wheelbase
  if (/flareside|styleside|fleetside|chassis|cutaway/.test(l)) return true;
  if (/\d\s*-?\s*(in|ft|")\b/.test(l)) return true;        // 145 in, 145-in
  if (/\d\s*1\/2/.test(l)) return true;                    // 5-1/2
  if (/^[\d\s.\-]+$/.test(l)) return true;                 // pure numbers
  return false;
}

// Resolve our catalog model name to MarketCheck's actual model string. MC lists
// some models differently (RAM "1500" → "Ram 1500 Pickup"), so an exact query
// returns nothing. We look up the make's model facet, prefer an exact match,
// else the highest-count model that contains our name. Cached 1 day.
// Known catalog→MarketCheck model-name mismatches. Checked first so these are
// deterministic and never depend on the (occasionally flaky) live facet lookup.
// Catalog model name → MarketCheck's actual model string. Without these, the
// affected dropdown entries resolve to a model MarketCheck doesn't index and come
// back with zero trims/colors/inventory. Verified live against the MarketCheck
// model facet (see the audit sweep over all 360 catalog entries).
const MODEL_ALIASES: Record<string, string> = {
  // RAM files every pickup as "Ram <n> Pickup"; the 1500 also still sells the
  // prior-gen body as a distinct "Ram 1500 Classic" model — union both so the
  // 1500 count isn't truncated to just the current body.
  "ram::1500": "Ram 1500 Pickup,Ram 1500 Classic",
  "ram::2500": "Ram 2500 Pickup",
  "ram::3500": "Ram 3500 Pickup",
  "ram::1500 classic": "Ram 1500 Classic",
  "ram::promaster": "ProMaster Cargo Van",

  // ── Name mismatches (same vehicle, different MarketCheck spelling) ──────
  "polestar::polestar 2": "2",
  "polestar::polestar 3": "3",
  "polestar::polestar 4": "4",
  "hyundai::kona electric": "Kona EV",
  // Audi files the RS performance cars with a SPACE ("RS 3", "RS 5"), so the
  // no-space catalog name catches only a tiny mislabeled residual.
  "audi::rs3": "RS 3",
  "audi::rs5": "RS 5,RS 5 Sportback,RS 5 Coupe,RS 5 Cabriolet",
  // Lamborghini "Murcielago" — MarketCheck stores it accent-stripped as
  // "Murcilago" for most listings.
  "lamborghini::murcielago": "Murcilago,Murcielago",
  "porsche::cayenne coupe": "Cayenne Coup",
  // MarketCheck files the current mid-engine cars as "718" (both body styles)
  // and keeps the pre-718 cars under "Boxster"/"Cayman" — union so neither the
  // modern nor the legacy inventory is dropped.
  "porsche::718 boxster": "718,Boxster",
  "porsche::718 cayman": "718,Cayman",
  "volkswagen::id.buzz": "ID. Buzz",
  "audi::rs6": "RS 6 Avant",
  // e-tron GT lineup: MarketCheck has no bare "e-tron GT"/"RS e-tron GT" — only
  // "S e-tron GT" + "RS e-tron GT Performance". Without these, both returned 0.
  "audi::e-tron gt": "e-tron GT,S e-tron GT",
  "audi::rs e-tron gt": "RS e-tron GT,RS e-tron GT Performance",
  "audi::q4 e-tron": "Q4 e-tron,Q4 Sportback e-tron",
  // Mitsubishi files the PHEV as "Outlander Plug-in Hybrid" (+ casing/abbr
  // variants), not "Outlander PHEV". Bare name caught only 21 of 652 listings.
  "mitsubishi::outlander phev": "Outlander Plug-in Hybrid,Outlander PHEV,Outlander Plug-In Hybrid",
  "toyota::rav4 prime": "RAV4 Plug-in Hybrid",
  "toyota::prius prime": "Prius Plug-in Hybrid",
  "ford::transit": "Transit Van",
  "gmc::hummer ev suv": "HUMMER EV",
  // "…HD" is a catalog umbrella; MarketCheck splits it by GVWR (2500HD/3500HD)
  // and again by Denali trim. Union every HD bucket so the count is complete.
  "gmc::sierra hd": "Sierra 2500HD,Sierra 3500HD,Sierra 2500 Denali HD,Sierra 3500 Denali HD",
  "chevrolet::silverado hd": "Silverado 2500HD,Silverado 3500HD",
  "kia::niro ev": "Niro",
  "bmw::m3": "M3 Sedan",
  "mini::cooper": "Hardtop 2 Door",

  // ── Performance / variant sub-models that MarketCheck files as a TRIM of
  //    the base model (not a separate model). Resolve to the base so inventory
  //    + the full trim list load; the specific trim (Si, Type R, N, …) is then
  //    pickable from the trim list. ──────────────────────────────────────────
  "toyota::gr supra": "Supra",
  "honda::civic si": "Civic",
  "honda::civic type r": "Civic",

  // ── Ferrari: the catalog uses the marketing names (296 GTB, SF90 Stradale,
  //    …) but MarketCheck indexes each car under a shorter base name. Map to
  //    the base so inventory loads; body/trim (GTB, GTS, Spider, M) is then
  //    pickable from the trim list. Includes two that "exist" under the granular
  //    name but with near-zero count — F8 Tributo (1) and 812 Superfast (1) —
  //    whose real inventory lives under "F8" (107) and "812" (33). ─────────────
  "ferrari::296 gtb": "296",
  "ferrari::296 gts": "296",
  "ferrari::sf90 stradale": "SF90",
  "ferrari::sf90 spider": "SF90",
  "ferrari::f8 tributo": "F8",
  "ferrari::f8 spider": "F8",
  "ferrari::812 superfast": "812",
  "ferrari::gtc4lusso": "GTC4Lusso,GTC4",
};

export async function resolveModel(make: string, model: string): Promise<string> {
  const apiKey = mcKey();
  if (!apiKey || !make || !model) return model;
  const aliasKey = `${make}::${model}`.toLowerCase();
  if (MODEL_ALIASES[aliasKey]) return MODEL_ALIASES[aliasKey];
  const ck = `resolvemodel::${make}::${model}`.toLowerCase();
  const hit = cacheGet<string>(ck);
  if (hit) return hit;
  try {
    const u = new URL(`${MC_HOST}/search/car/active`);
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("make", make);
    u.searchParams.set("rows", "0");
    u.searchParams.set("facets", "model|0|80|1");
    const r = await fetchWithTimeout(u.toString(), { cache: "no-store" });
    if (!r.ok) return model;
    const d = await r.json();
    const items = (d.facets?.model || []) as { item: string; count: number }[];
    const ml = model.toLowerCase();

    // Sibling models the catalog lists for this make (lowercased). These are
    // user-pickable in their own right, so they must NEVER be folded into
    // another model's OR-list (e.g. "Wrangler 4xe", "Grand Cherokee L"). Include
    // each sibling's ALIAS-resolved MarketCheck name too — e.g. Toyota "RAV4
    // Prime" → "RAV4 Plug-in Hybrid" and Porsche "Cayenne Coupe" → "Cayenne
    // Coup" — so base "RAV4"/"Cayenne" don't swallow a model that's pickable on
    // its own under a different MarketCheck spelling.
    const makeKey = Object.keys(CAR_CATALOG).find((k) => k.toLowerCase() === make.toLowerCase());
    const siblings = new Set<string>();
    for (const sm of (makeKey ? CAR_CATALOG[makeKey] : [])) {
      siblings.add(sm.toLowerCase());
      const alias = MODEL_ALIASES[`${make}::${sm}`.toLowerCase()];
      if (alias) siblings.add(alias.toLowerCase());
    }

    // MarketCheck frequently splits ONE model across body-style names — e.g.
    // Jeep "Wrangler" → "Wrangler 2-Door" + "Wrangler 4-Door" — so a literal
    // `model=Wrangler` query catches only the tiny mislabeled residual (12 of
    // ~54k). Union the exact model with every facet that EXTENDS it at a word
    // boundary ("Wrangler " + …), EXCEPT extensions that are themselves a
    // distinct catalog model. The space boundary also stops "Cherokee" from
    // pulling in "Grand Cherokee". MarketCheck's `model` param accepts this
    // comma-separated OR-list on both search and facet endpoints.
    //
    // Mercedes also keeps a legacy HYPHENATED form for the same nameplate —
    // "GLE" + "GLE-Class" + "GLE-Class Coupe", "CLA" + "CLA-Class" — which the
    // space boundary alone misses (the CLS even sells mostly under "CLS-Class").
    // Treat "<model>-Class…" as the same word-boundary extension. This suffix is
    // Mercedes-specific, so it's inert for other makes and never merges a
    // distinct trim (e.g. "CT4-V" is not "CT4-Class").
    const variants = items
      .filter((i) => {
        const it = i.item.toLowerCase();
        if (it === ml) return true;
        if (siblings.has(it)) return false;
        return it.startsWith(ml + " ") || it.startsWith(ml + "-class");
      })
      .sort((a, b) => b.count - a.count);
    if (variants.length) {
      const orList = variants.map((v) => v.item).join(",");
      cacheSet(ck, orList, DAY);
      return orList;
    }

    // No word-boundary match — fall back to the best fuzzy (contains) hit.
    // Only cache a real hit — never poison the cache with the fallback (which
    // can happen if MarketCheck soft-rate-limits and returns an empty facet).
    const best = items
      .filter((i) => i.item.toLowerCase().includes(ml))
      .sort((a, b) => b.count - a.count)[0];
    if (best) {
      cacheSet(ck, best.item, DAY);
      return best.item;
    }
    return model;
  } catch {
    return model;
  }
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

export function estMonthlyCard(price: number, msrp: number) {
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
  // A real MSRP is required for a meaningful lease estimate: the residual is a %
  // of MSRP, not of the (discounted/used) selling price. When msrp falls back to
  // price (used cars, listings with no MSRP) the estimate is garbage — and it
  // drives the "under $X/mo" filter — so emit 0 (the UI hides 0) instead.
  const realMsrp = num(l.msrp);
  const isNew = String(l.inventory_type || "").toLowerCase().includes("new");
  const estMonthly = realMsrp > 0 && realMsrp >= price && isNew ? estMonthlyCard(price, realMsrp) : 0;
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
    price, msrp, est_monthly: estMonthly,
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
  const realMsrp = num(v.msrp || r.msrp);
  const msrp = realMsrp || price;
  // Auto.dev rarely exposes a true MSRP → only estimate when one is present and
  // the car is new (residual is a % of MSRP). Otherwise emit 0 (UI hides it)
  // rather than a misleading number that feeds the payment filter.
  const isNew = r.used === false || String(r.condition || v.condition || "").toLowerCase() === "new";
  const estMonthly = realMsrp > 0 && realMsrp >= price && isNew ? estMonthlyCard(price, realMsrp) : 0;
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
    price, msrp, est_monthly: estMonthly,
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

// Decode a VIN to the lowercase names of its installed options/packages/
// features — for filtering search results by package ("Premium Package",
// "Tow", etc.). Cached 30 days per VIN (build never changes).
// throwOnError: callers that must distinguish a HARD failure (429/5xx/timeout)
// from a genuinely empty option list pass true (the dump's decodeUndecoded does,
// so it doesn't permanently mark a VIN decoded-with-no-options after a transient
// blip). Search/diagnose pass false and treat a failed decode as "no options".
export async function decodeVinOptionNames(vin: string, throwOnError = false): Promise<string[]> {
  const v = String(vin || "").toUpperCase().trim();
  if (v.length !== 17) return [];
  const ck = `vinopts::${v}`;
  const hit = cacheGet<string[]>(ck);
  if (hit) return hit;
  const apiKey = mcKey();
  if (!apiKey) { if (throwOnError) throw new Error("MarketCheck key not configured"); return []; }
  try {
    const u = new URL(`${MC_HOST}/decode/car/neovin/${v}/specs`);
    u.searchParams.set("api_key", apiKey);
    const r = await fetchWithTimeout(u.toString(), { cache: "no-store" });
    if (!r.ok) { if (throwOnError) throw new Error(`decode ${r.status}`); return []; }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const d: any = await r.json();
    const details = Array.isArray(d.installed_options_details) ? d.installed_options_details : [];
    const hvf = Array.isArray(d.high_value_features) ? d.high_value_features : [];
    const feats = Array.isArray(d.features) ? d.features : [];
    const names = [...details.map((x: any) => x.name || ""), ...hvf, ...feats]
      .filter(Boolean)
      .map((s: string) => String(s).toLowerCase());
    cacheSet(ck, names, DAY * 30);
    return names;
  } catch (e) {
    if (throwOnError) throw e;
    return [];
  }
}

export type VinOption = { code: string; name: string; msrp: number; type: string };

// Detailed factory build-sheet options for a VIN (named + priced), e.g.
// "UltraView Sunroof" / $1450. Cached 30d. Powers the per-model option catalog.
export async function decodeVinOptionDetails(vin: string): Promise<VinOption[]> {
  const v = String(vin || "").toUpperCase().trim();
  if (v.length !== 17) return [];
  const ck = `vinoptdet::${v}`;
  const hit = cacheGet<VinOption[]>(ck);
  if (hit) return hit;
  const apiKey = mcKey();
  if (!apiKey) return [];
  try {
    const u = new URL(`${MC_HOST}/decode/car/neovin/${v}/specs`);
    u.searchParams.set("api_key", apiKey);
    const r = await fetchWithTimeout(u.toString(), { cache: "no-store" });
    if (!r.ok) return [];
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const d: any = await r.json();
    const details = Array.isArray(d.installed_options_details) ? d.installed_options_details : [];
    const out: VinOption[] = details
      .map((x: any) => ({
        code: String(x.code || ""),
        name: String(x.name || "").trim(),
        msrp: num(x.msrp || x.sale_price),
        type: String(x.type || ""),
      }))
      .filter((o: VinOption) => o.name);
    cacheSet(ck, out, DAY * 30);
    return out;
  } catch {
    return [];
  }
}

export function mcKey() {
  return process.env.MARKETCHECK_API_KEY || "";
}
export function autoDevKey() {
  return process.env.AUTO_DEV_API_KEY || "";
}
