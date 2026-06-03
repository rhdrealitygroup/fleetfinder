import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind class merger — the shadcn/ui convention. Combines clsx
// (conditional classes) with twMerge (conflict resolution).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format a number as US dollars, no decimals ("$45,200")
export const moneyShort = (n: number) =>
  `$${Math.round(Number(n) || 0).toLocaleString()}`;

// Format a number as US dollars with cents ("$45,200.50")
export const money = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
