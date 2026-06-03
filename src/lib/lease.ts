// Canonical lease math — ported from the Base44 app's _shared/lease.ts.
// Used by the Lease Calculator and to compute the "est." monthly on cards.

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type LeaseInput = {
  msrp?: number;
  sellingPrice?: number;
  term?: number;
  buyMF?: number;
  mfMarkup?: number;
  priceMarkup?: number;
  acqFee?: number;
  flatFee?: number;
  upfrontFees?: number;
  cashDown?: number;
  rebates?: number;
  taxRate?: number;
  taxMethod?: "monthly" | "payments" | "price";
  residualPct?: number;
};

export type LeaseResult = {
  residual$: number;
  sellMF: number;
  apr: number;
  grossCap: number;
  capReduction: number;
  adjCap: number;
  depreciation: number;
  rentCharge: number;
  baseMonthly: number;
  monthlyTax: number;
  upfrontTax: number;
  customerMonthly: number;
  dueAtSigning: number;
  mfReserve: number;
  totalCut: number;
};

/** Full lease computation from a dealer payment sheet → customer monthly + profit. */
export function computeLease(input: LeaseInput): LeaseResult {
  const msrp = n(input.msrp);
  const sellingPrice = n(input.sellingPrice);
  const term = n(input.term) || 36;
  const buyMF = n(input.buyMF);
  const mfMarkup = n(input.mfMarkup);
  const priceMarkup = n(input.priceMarkup);
  const acqFee = n(input.acqFee);
  const flatFee = n(input.flatFee);
  const upfrontFees = n(input.upfrontFees);
  const cashDown = n(input.cashDown);
  const rebates = n(input.rebates);
  const taxRate = n(input.taxRate) / 100;
  const taxMethod = input.taxMethod || "monthly";

  const residual$ = (n(input.residualPct) / 100) * msrp;
  const sellMF = buyMF + mfMarkup;
  const grossCap = sellingPrice + priceMarkup + acqFee + flatFee;
  const capReduction = cashDown + rebates;
  const adjCap = grossCap - capReduction;
  const depreciation = term ? (adjCap - residual$) / term : 0;
  const rentCharge = (adjCap + residual$) * sellMF;
  const baseMonthly = depreciation + rentCharge;

  let monthlyTax = 0;
  let upfrontTax = 0;
  if (taxMethod === "monthly") monthlyTax = baseMonthly * taxRate;
  else if (taxMethod === "payments") upfrontTax = baseMonthly * term * taxRate;
  else if (taxMethod === "price") upfrontTax = sellingPrice * taxRate;

  const customerMonthly = baseMonthly + monthlyTax;
  const dueAtSigning = cashDown + customerMonthly + upfrontFees + upfrontTax;

  const mfReserve = mfMarkup * (adjCap + residual$) * term;
  const totalCut = priceMarkup + flatFee + mfReserve;

  return {
    residual$, sellMF, apr: sellMF * 2400,
    grossCap, capReduction, adjCap,
    depreciation, rentCharge, baseMonthly,
    monthlyTax, upfrontTax, customerMonthly, dueAtSigning,
    mfReserve, totalCut,
  };
}

/** Display estimate for search cards. */
export function estMonthly(price: number, msrp: number, residualPct = 58, moneyFactor = 0.0015, term = 36) {
  const r = computeLease({
    msrp,
    sellingPrice: price,
    residualPct,
    buyMF: moneyFactor,
    term,
    taxRate: 0,
    taxMethod: "monthly",
  });
  return Math.round(r.baseMonthly);
}

export const TAX_METHODS = [
  { value: "monthly", label: "On monthly payment (NJ & most states)" },
  { value: "payments", label: "On total of payments — upfront (NY typically)" },
  { value: "price", label: "On full selling price — upfront" },
] as const;
