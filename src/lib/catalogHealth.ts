import "server-only";
import { MC_HOST, mcKey, resolveModel, fetchWithTimeout } from "@/lib/marketcheck";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type HealthCheck = { make: string; model: string; trims: number; ext: number; int: number };

// One faceted call → the CURRENT trim + exterior/interior color counts for a
// model, mirroring how list-trims/list-colors resolve the model. Returns null on
// a TRANSIENT upstream failure (network/429/5xx) so the caller never records a
// false zero — only a clean 200 with empty facets counts as a real zero.
export async function checkModelHealth(make: string, model: string): Promise<HealthCheck | null> {
  const apiKey = mcKey();
  if (!apiKey) return null;
  const mcModel = model ? await resolveModel(make, model) : "";
  const end = new Date().getFullYear() + 1;

  const u = new URL(`${MC_HOST}/search/car/active`);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("make", make);
  if (mcModel) u.searchParams.set("model", mcModel);
  u.searchParams.set("year_range", `${end - 8}-${end}`);
  u.searchParams.set("rows", "0");
  u.searchParams.set("facets", "trim|0|100|1,exterior_color|0|80|1,interior_color|0|50|1");

  for (let i = 0; i < 3; i++) {
    const r = await fetchWithTimeout(u.toString(), { cache: "no-store" }).catch(() => null);
    if (r && r.ok) {
      const d: any = await r.json().catch(() => null);
      if (d) {
        const f = d.facets || {};
        return {
          make, model,
          trims: (f.trim || []).length,
          ext: (f.exterior_color || []).length,
          int: (f.interior_color || []).length,
        };
      }
    }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return null; // transient — skip this model this run, retry next time
}
