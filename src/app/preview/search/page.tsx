import { redirect } from "next/navigation";

// The search preview now has one variant per design language. Default to the
// modern one; the StyleSwitcher at the top flips between all three.
export default function SearchPreviewIndex() {
  redirect("/preview/search/modern");
}
