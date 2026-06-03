"use client";

import { useState } from "react";

// Mobile filter panel shown on the design mockups (lg:hidden) so the search
// criteria are visible/usable on phones. Collapsible; purely illustrative —
// the real wiring lives on /search. `tone` adapts it to each design's palette.
type Tone = "dark" | "light" | "terminal";

const TONES: Record<Tone, { wrap: string; label: string; field: string; chip: string; chipOn: string; btn: string }> = {
  dark: {
    wrap: "bg-neutral-900 border-white/10 text-neutral-100",
    label: "text-neutral-500",
    field: "bg-white/5 border-white/10 text-neutral-100",
    chip: "bg-white/5 border-white/10 text-neutral-300",
    chipOn: "bg-blue-500 border-blue-500 text-white",
    btn: "bg-blue-500 text-white",
  },
  light: {
    wrap: "bg-white border-neutral-200 text-neutral-900",
    label: "text-neutral-400",
    field: "bg-neutral-100 border-neutral-200 text-neutral-900",
    chip: "bg-neutral-100 border-neutral-200 text-neutral-600",
    chipOn: "bg-neutral-900 border-neutral-900 text-white",
    btn: "bg-neutral-900 text-white",
  },
  terminal: {
    wrap: "bg-[#0b0e11] border-white/10 text-neutral-200 font-mono",
    label: "text-neutral-600",
    field: "bg-white/5 border-white/10 text-neutral-200",
    chip: "bg-white/5 border-white/10 text-neutral-400",
    chipOn: "bg-emerald-500 border-emerald-500 text-black",
    btn: "bg-emerald-500 text-black",
  },
};

export function MockMobileFilters({ tone = "dark" }: { tone?: Tone }) {
  const [open, setOpen] = useState(false);
  const t = TONES[tone];
  return (
    <div className={`lg:hidden border-b ${t.wrap}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
        <span className="flex items-center gap-2">⚙︎ Search filters</span>
        <span className={t.label}>{open ? "▲ hide" : "▼ GMC Sierra EV · Denali · Max Range"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 text-sm">
          <Field t={t} label="MAKE" value="GMC" />
          <Field t={t} label="MODEL" value="Sierra EV" />
          <div>
            <div className={`text-[10px] uppercase tracking-wide mb-1 ${t.label}`}>TRIM</div>
            <div className="flex flex-wrap gap-1.5">
              {["Elevation", "AT4", "Denali"].map((x, i) => (
                <span key={x} className={`px-2.5 py-1 rounded-full border text-xs ${i === 2 ? t.chipOn : t.chip}`}>{x}</span>
              ))}
            </div>
          </div>
          <div>
            <div className={`text-[10px] uppercase tracking-wide mb-1 ${t.label}`}>DENALI CONFIGURATION</div>
            <div className="flex flex-wrap gap-1.5">
              {["Max Range", "Extended Range", "Standard Range", "Edition 1"].map((x, i) => (
                <span key={x} className={`px-2.5 py-1 rounded-full border text-xs ${i === 0 ? t.chipOn : t.chip}`}>{x}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field t={t} label="YEAR" value="2025 +" />
            <Field t={t} label="PRICE" value="Any" />
          </div>
          <button className={`w-full py-2.5 rounded-lg text-sm font-semibold ${t.btn}`}>Run live search</button>
        </div>
      )}
    </div>
  );
}

function Field({ t, label, value }: { t: (typeof TONES)[Tone]; label: string; value: string }) {
  return (
    <div>
      <div className={`text-[10px] uppercase tracking-wide mb-1 ${t.label}`}>{label}</div>
      <div className={`px-3 py-2 rounded-lg border ${t.field}`}>{value}</div>
    </div>
  );
}
