// Shared inventory constants + helpers used across the search UI. Ported from Base44.

// UI body-type labels. The server (mcBodyType) maps these to MarketCheck's facet
// vocabulary — "Truck"→Pickup, "Van"→Cargo Van,Minivan,Passenger Van — so each
// option returns inventory instead of a dead end.
export const BODY_TYPES = ["SUV", "Sedan", "Truck", "Wagon", "Coupe", "Van"];
// MarketCheck does NOT distinguish AWD from 4WD (both are bucketed "4WD"), so we
// offer one combined option that the server maps to 4WD. ("AWD" alone returned 0.)
export const DRIVETRAINS = ["AWD/4WD", "FWD", "RWD"];
export const STATUSES = ["In Stock", "In Transit", "On Order"];

export const STATUS_META: Record<string, { color: string; label: string }> = {
  "In Stock": { color: "152 60% 45%", label: "In stock" },
  "In Transit": { color: "38 92% 55%", label: "In transit" },
  "On Order": { color: "217 91% 60%", label: "On order" },
};

export const SORTS = [
  { value: "distance", label: "Distance: nearest" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
  { value: "monthly_asc", label: "Monthly: low → high" },
  { value: "monthly_desc", label: "Monthly: high → low" },
  { value: "recent", label: "Recently added" },
];

const CURRENT_YEAR = new Date().getFullYear();
export const YEAR_RANGES = [
  { label: "Any year", min: "", max: "" },
  { label: `${CURRENT_YEAR + 1}`, min: CURRENT_YEAR + 1, max: CURRENT_YEAR + 1 },
  { label: `${CURRENT_YEAR}`, min: CURRENT_YEAR, max: CURRENT_YEAR },
  { label: `${CURRENT_YEAR - 1}+`, min: CURRENT_YEAR - 1, max: "" },
  { label: `${CURRENT_YEAR - 2}+`, min: CURRENT_YEAR - 2, max: "" },
  { label: `${CURRENT_YEAR - 3}+`, min: CURRENT_YEAR - 3, max: "" },
  { label: `${CURRENT_YEAR - 5}+`, min: CURRENT_YEAR - 5, max: "" },
];

export const PRICE_RANGES = [
  { label: "Any price", min: "", max: "" },
  { label: "Under $25k", min: "", max: 25000 },
  { label: "$25k – $35k", min: 25000, max: 35000 },
  { label: "$35k – $50k", min: 35000, max: 50000 },
  { label: "$50k – $75k", min: 50000, max: 75000 },
  { label: "$75k – $100k", min: 75000, max: 100000 },
  { label: "Over $100k", min: 100000, max: "" },
];

// High-value feature picker — same groups as Base44.
export const FEATURE_GROUPS = [
  { title: "Tech & connectivity", items: [
    { label: "Apple CarPlay", value: "apple carplay" },
    { label: "Wireless CarPlay", value: "wireless apple carplay" },
    { label: "Android Auto", value: "android auto" },
    { label: "Navigation", value: "navigation system" },
    { label: "Wireless Charging", value: "wireless charging" },
    { label: "Heads-Up Display", value: "heads-up display" },
    { label: "Premium Audio", value: "premium speakers" },
    { label: "Wi-Fi Hotspot", value: "wifi hotspot" },
  ]},
  { title: "Comfort & interior", items: [
    { label: "Heated Seats", value: "heated seats" },
    { label: "Cooled Seats", value: "cooled seats" },
    { label: "Heated Steering Wheel", value: "heated steering wheel" },
    { label: "Leather Seats", value: "leather seats" },
    { label: "Sunroof", value: "sunroof" },
    { label: "Panoramic Sunroof", value: "panoramic sunroof" },
    { label: "Memory Seats", value: "memory seats" },
    { label: "Ambient Lighting", value: "ambient interior lighting" },
  ]},
  { title: "Safety & driver assist", items: [
    { label: "Backup Camera", value: "backup camera" },
    { label: "Adaptive Cruise", value: "adaptive cruise control" },
    { label: "Blind Spot Monitor", value: "blind spot monitor" },
    { label: "Lane Keep Assist", value: "lane keep assist" },
    { label: "360° Camera", value: "surround view camera" },
    { label: "Auto Emergency Braking", value: "automatic emergency braking" },
    { label: "Parking Sensors", value: "parking sensors" },
  ]},
  { title: "Convenience", items: [
    { label: "Keyless Entry", value: "keyless entry" },
    { label: "Push-Button Start", value: "push button start" },
    { label: "Remote Start", value: "remote start" },
    { label: "Power Liftgate", value: "power liftgate" },
  ]},
  { title: "Utility", items: [
    { label: "Tow Package", value: "tow package" },
    { label: "3rd-Row Seating", value: "third row seating" },
    { label: "Roof Rails", value: "roof rails" },
    { label: "Running Boards", value: "running boards" },
  ]},
];

// Deterministic accent hue per make so each brand's wordmark block is distinct.
export function makeHue(make = "") {
  let h = 0;
  for (let i = 0; i < make.length; i++) h = (h * 31 + make.charCodeAt(i)) % 360;
  return h;
}

export function agoLabel(days: number | string) {
  const d = Number(days);
  if (!Number.isFinite(d)) return "—";
  if (d <= 0) return "today";
  if (d === 1) return "1 day ago";
  return `${d} days ago`;
}

// Haversine distance in miles between two lat/lng points.
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return Infinity;
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
