// Comprehensive make → models catalog for the Live Search stepper.
// Used to build the make/model picker WITHOUT any API calls — only the final
// search is billed. Covers essentially every leasable new car sold in the US
// as of 2025–2026, including EVs, hybrids, and performance variants.
//
// Agents can ALSO type freehand at the model step, so anything missing here
// can still be searched. This list just powers the quick-pick dropdown.
//
// Trims are NOT hardcoded — list_trims pulls them live from MarketCheck per
// (make, model) and caches 30 days, so they stay current automatically.

export const CAR_CATALOG: Record<string, string[]> = {
  // ── Mass-market American ──────────────────────────────────────────────
  "Buick": ["Encore GX", "Envista", "Envision", "Enclave"],
  "Cadillac": [
    "CT4", "CT5", "XT4", "XT5", "XT6",
    "Escalade", "Escalade IQ", "Lyriq", "Optiq", "Vistiq", "Celestiq",
  ],
  "Chevrolet": [
    "Trax", "Trailblazer", "Equinox", "Equinox EV", "Blazer", "Blazer EV",
    "Traverse", "Tahoe", "Suburban", "Malibu", "Camaro", "Corvette",
    "Colorado", "Silverado 1500", "Silverado HD", "Silverado EV",
  ],
  "Chrysler": ["Pacifica", "300", "Voyager"],
  "Dodge": ["Hornet", "Durango", "Charger"],
  "Ford": [
    "Maverick", "Ranger", "F-150", "F-150 Lightning", "F-250 Super Duty", "F-350 Super Duty",
    "Bronco Sport", "Bronco", "Edge", "Escape", "Expedition", "Explorer",
    "Mustang", "Mustang Mach-E", "E-Transit", "Transit", "Transit Connect",
  ],
  "GMC": [
    "Acadia", "Canyon", "Hummer EV", "Hummer EV SUV",
    "Sierra 1500", "Sierra HD", "Sierra EV", "Terrain", "Yukon", "Yukon XL",
  ],
  "Jeep": [
    "Cherokee", "Compass", "Gladiator", "Grand Cherokee", "Grand Cherokee L",
    "Grand Wagoneer", "Renegade", "Wagoneer", "Wagoneer S", "Wrangler", "Wrangler 4xe",
  ],
  "Lincoln": ["Aviator", "Corsair", "Nautilus", "Navigator"],
  "RAM": ["1500", "1500 REV", "2500", "3500", "ProMaster"],

  // ── Mass-market Asian ─────────────────────────────────────────────────
  "Honda": [
    "Accord", "Civic", "Civic Si", "Civic Type R", "CR-V", "HR-V",
    "Odyssey", "Passport", "Pilot", "Prologue", "Ridgeline",
  ],
  "Hyundai": [
    "Elantra", "Ioniq 5", "Ioniq 6", "Ioniq 9",
    "Kona", "Kona Electric", "Palisade", "Santa Cruz", "Santa Fe",
    "Sonata", "Tucson", "Venue",
  ],
  "Kia": [
    "Carnival", "EV6", "EV9", "Forte", "K4", "K5", "Niro", "Niro EV",
    "Seltos", "Sorento", "Soul", "Sportage", "Telluride",
  ],
  "Mazda": [
    "CX-5", "CX-30", "CX-50", "CX-70", "CX-90", "Mazda3", "MX-5 Miata",
  ],
  "Mitsubishi": ["Eclipse Cross", "Outlander", "Outlander PHEV", "Outlander Sport"],
  "Nissan": [
    "Altima", "Ariya", "Armada", "Frontier", "Kicks", "Leaf",
    "Murano", "Pathfinder", "Rogue", "Sentra", "Versa", "Z",
  ],
  "Subaru": [
    "Ascent", "BRZ", "Crosstrek", "Forester", "Impreza",
    "Legacy", "Outback", "Solterra", "Trailseeker", "Uncharted", "WRX",
  ],
  "Toyota": [
    "4Runner", "Camry", "Corolla", "Corolla Cross", "Crown", "Crown Signia",
    "Grand Highlander", "Highlander", "GR86", "GR Corolla", "GR Supra",
    "Land Cruiser", "Mirai", "Prius", "Prius Prime", "RAV4", "RAV4 Prime",
    "Sequoia", "Sienna", "Tacoma", "Tundra", "bZ4X",
  ],

  // ── European mass-market ──────────────────────────────────────────────
  "Volkswagen": [
    "Atlas", "Atlas Cross Sport", "Golf GTI", "Golf R", "ID.4", "ID.Buzz",
    "Jetta", "Taos", "Tiguan",
  ],

  // ── Luxury German ─────────────────────────────────────────────────────
  "Audi": [
    "A3", "A4", "A5", "A6", "A7", "A8", "S3", "S4", "S5", "S6",
    "RS3", "RS5", "RS6", "Q3", "Q4 e-tron", "Q5", "Q5 Sportback",
    "Q6 e-tron", "Q7", "Q8", "RS Q8", "SQ5", "SQ7", "SQ8", "e-tron GT", "RS e-tron GT",
  ],
  "BMW": [
    "2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "8 Series",
    "M2", "M3", "M4", "M5", "M8",
    "X1", "X2", "X3", "X3 M", "X4", "X5", "X5 M", "X6", "X6 M", "X7", "XM",
    "i4", "i5", "i7", "iX", "Z4",
  ],
  "Mercedes-Benz": [
    "C-Class", "CLA", "CLE", "CLS", "E-Class", "S-Class",
    "GLA", "GLB", "GLC", "GLE", "GLS", "G-Class",
    "EQB", "EQE", "EQE SUV", "EQS", "EQS SUV", "EQG", "AMG GT", "Sprinter",
  ],
  "Porsche": [
    "718 Boxster", "718 Cayman", "911", "Cayenne", "Cayenne Coupe",
    "Macan", "Panamera", "Taycan",
  ],

  // ── Luxury Asian ──────────────────────────────────────────────────────
  "Acura": ["MDX", "RDX", "TLX", "Integra", "ADX", "ZDX"],
  "Genesis": ["G70", "G80", "G90", "GV60", "GV70", "GV80", "GV80 Coupe"],
  "Infiniti": ["QX50", "QX55", "QX60", "QX80"],
  "Lexus": ["ES", "GX", "IS", "LC", "LS", "LX", "NX", "RX", "RZ", "TX", "UX"],

  // ── Luxury British / European ─────────────────────────────────────────
  "Aston Martin": ["DB12", "DBX", "Vantage"],
  "Bentley": ["Bentayga", "Continental GT", "Flying Spur"],
  "Jaguar": ["F-Pace", "E-Pace", "I-Pace", "F-Type"],
  "Land Rover": [
    "Defender", "Discovery", "Discovery Sport",
    "Range Rover", "Range Rover Sport", "Range Rover Velar", "Range Rover Evoque",
  ],
  "Maserati": ["Grecale", "GranTurismo", "Levante", "MC20"],
  "Mini": ["Cooper", "Countryman"],

  // ── Italian ───────────────────────────────────────────────────────────
  "Alfa Romeo": ["Stelvio", "Giulia", "Tonale"],
  "Fiat": ["500e"],

  // ── Exotic / ultra-luxury ─────────────────────────────────────────────
  "Ferrari": [
    "296 GTB", "296 GTS", "SF90 Stradale", "SF90 Spider", "Roma",
    "Purosangue", "812 Superfast", "812 GTS", "F8 Tributo", "F8 Spider",
    "488 GTB", "488 Spider", "488 Pista", "Portofino",
    "California", "California T", "GTC4Lusso", "F12berlinetta", "458 Italia",
    "812 Competizione", "Daytona SP3", "F430", "360",
  ],
  "Lamborghini": [
    "Urus", "Huracan", "Revuelto", "Aventador", "Temerario",
    "Gallardo", "Murcielago", "Diablo", "Countach",
  ],
  "Rolls-Royce": ["Cullinan", "Ghost", "Phantom", "Spectre", "Wraith", "Dawn"],
  "McLaren": [
    "Artura", "750S", "720S", "765LT", "GT", "GTS",
    "570S", "570GT", "600LT", "620R", "650S", "P1", "Senna",
  ],
  "Lotus": ["Emira", "Eletre", "Evija", "Evora", "Elise", "Esprit"],

  // ── Other / commercial / discontinued ─────────────────────────────────
  "Ineos": ["Grenadier"],
  "Karma": ["Revero", "GS-6"],
  "Fisker": ["Ocean", "Karma"],
  "Isuzu": ["NPR", "NPR HD", "NRR", "NQR", "FTR", "Ascender", "Rodeo", "Trooper"],
  "Pontiac": [
    "G6", "G8", "Firebird", "Solstice", "Grand Prix", "Vibe", "Torrent",
    "GTO", "Grand Am", "Bonneville", "Fiero", "G5", "Montana", "Aztek",
  ],
  "Suzuki": [
    "SX4", "Grand Vitara", "Kizashi", "XL-7", "Equator",
    "Forenza", "Aerio", "Reno", "Verona", "Swift",
  ],

  // ── Swedish ───────────────────────────────────────────────────────────
  "Volvo": [
    "C40", "EX30", "EX90", "S60", "S90", "V60", "V90",
    "XC40", "XC60", "XC90",
  ],

  // ── EV-first brands ───────────────────────────────────────────────────
  "Tesla": ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"],
  "Rivian": ["R1S", "R1T", "R2", "R3"],
  "Lucid": ["Air", "Gravity"],
  "Polestar": ["Polestar 2", "Polestar 3", "Polestar 4"],
  "VinFast": ["VF 8", "VF 9"],
};

export const CATALOG_MAKES = Object.keys(CAR_CATALOG).sort();

// Brands that sell factory-direct, not through franchised dealers — so NEW
// inventory in the MarketCheck dealer feed is ~0. When a search for
// one of these returns nothing in New mode, the UI nudges the user to Used
// instead of showing a generic "no match" diagnosis.
export const DIRECT_SALES_BRANDS = new Set(["Tesla", "Rivian", "Lucid"]);

// Makes that no longer build new cars (defunct in the US). They can never have
// new inventory, so they're hidden from the make picker in NEW mode — but kept
// selectable in USED mode, where real used units still exist.
export const DEFUNCT_MAKES = new Set(["Pontiac", "Suzuki", "Fisker", "Karma"]);

// Ultra-low-volume exotics: sold almost entirely off-feed (allocation/order),
// so franchised-dealer feeds carry ~0 new inventory. Kept selectable for
// coverage, but a New search that comes back empty nudges to Used instead of
// running the zero-result diagnoser (which would imply the search was wrong).
export const LIMITED_NEW_BRANDS = new Set([
  "Ferrari", "McLaren", "Lamborghini", "Rolls-Royce", "Lotus",
]);

// Models that are in the lineup/catalog but NOT yet on sale (pre-production or
// announced-only) — they legitimately return 0 inventory. Keyed "make::model"
// (lowercase) so the picker can flag them "not yet on sale" instead of looking
// broken. Revisit as each launches.
export const PRE_LAUNCH_MODELS = new Set([
  "rivian::r2",
  "rivian::r3",
  "cadillac::celestiq",
  "mercedes-benz::eqg",
]);
