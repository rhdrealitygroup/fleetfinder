// Shared mock data for the search-page style previews. Same cars rendered in
// three different design languages (editorial / modern / automotive) so the
// only variable is the visual treatment.

export type PreviewVehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  miles: number;
  dist: number;
  color: string;
  dealer: string;
  status: "In Stock" | "In Transit" | "On Order";
  ev?: boolean;
  cpo?: boolean;
  hue: number;
  features: string[];
};

export const PREVIEW_VEHICLES: PreviewVehicle[] = [
  { id: "1", year: 2026, make: "Ford", model: "Expedition", trim: "King Ranch", price: 78420, miles: 12, dist: 14, color: "Agate Black", dealer: "Galpin Ford", status: "In Stock", hue: 210, features: ["Captain's Chairs", "Premium Tow Pkg", "Panoramic Roof", "Heated + Cooled Seats"] },
  { id: "2", year: 2026, make: "Ford", model: "Expedition", trim: "King Ranch", price: 76990, miles: 8, dist: 22, color: "Star White", dealer: "DCH Ford of Eatontown", status: "In Stock", hue: 210, features: ["Captain's Chairs", "B&O Audio", "360° Camera"] },
  { id: "3", year: 2026, make: "Lincoln", model: "Navigator", trim: "Black Label", price: 102540, miles: 5, dist: 31, color: "Infinite Black", dealer: "Open Road Lincoln", status: "In Transit", hue: 280, features: ["Massage Seats", "30-Way Power Seats", "Rear Entertainment"] },
  { id: "4", year: 2026, make: "Ford", model: "Expedition", trim: "Platinum", price: 81200, miles: 3, dist: 38, color: "Carbonized Gray", dealer: "All American Ford", status: "In Stock", hue: 210, features: ["Captain's Chairs", "Pano Roof", "Active Park Assist"] },
  { id: "5", year: 2025, make: "Ford", model: "Expedition", trim: "Limited", price: 71850, miles: 4200, dist: 44, color: "Rapid Red", dealer: "Ditschman Ford", status: "In Stock", cpo: true, hue: 210, features: ["Heated Seats", "Tow Pkg", "Wireless CarPlay"] },
  { id: "6", year: 2026, make: "Cadillac", model: "Escalade", trim: "Premium Luxury", price: 94300, miles: 11, dist: 51, color: "Black Raven", dealer: "Cadillac of Mahwah", status: "On Order", hue: 0, features: ["Super Cruise", "AKG Audio", "Night Vision"] },
];

export const PREVIEW_TRIMS = ["All trims", "King Ranch", "Platinum", "Limited", "Black Label", "Premium Luxury"];

export function money(n: number) {
  return "$" + n.toLocaleString("en-US");
}

// Small switcher shown on every styled search preview so Ray can flip between
// the three looks without typing URLs.
export const SEARCH_STYLES = [
  { slug: "editorial", label: "Editorial" },
  { slug: "modern", label: "Modern" },
  { slug: "automotive", label: "Automotive" },
];
