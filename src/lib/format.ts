// Small formatting helpers shared across pages. Ported from the Base44 app.

export const money = (n: number | string | null | undefined) =>
  `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const moneyShort = (n: number | string | null | undefined) =>
  `$${Number(n || 0).toLocaleString()}`;

export const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
