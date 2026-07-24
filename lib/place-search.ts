import { LT_PLACES } from "@/lib/lt-places";

export interface PlaceMatch {
  name: string;
  lat: number;
  lng: number;
}

// Strips Lithuanian diacritics (š, č, ž, ė, ų, ą, į, ū → base letter) via
// Unicode decomposition, so "siauliai" matches "Šiauliai" without a
// hand-written translation table.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Computed once at module load, parallel to LT_PLACES — not per keystroke.
const NORMALIZED = LT_PLACES.map((p) => normalize(p[0]));

const MAX_RESULTS = 20;

function toMatch(i: number): PlaceMatch {
  const [name, lat, lng] = LT_PLACES[i];
  return { name, lat, lng };
}

// Exact/prefix matches rank above plain substring matches; within each
// bucket, LT_PLACES's own rank+name ordering (capital > county seat >
// district seat > ordinary place) breaks ties between same-named places.
export function searchPlaces(query: string): PlaceMatch[] {
  const q = normalize(query.trim());
  if (q.length < 2) return [];

  const exact: number[] = [];
  const prefix: number[] = [];
  const includes: number[] = [];
  for (let i = 0; i < NORMALIZED.length; i++) {
    const n = NORMALIZED[i];
    if (n === q) exact.push(i);
    else if (n.startsWith(q)) prefix.push(i);
    else if (n.includes(q)) includes.push(i);
    if (exact.length + prefix.length + includes.length >= MAX_RESULTS * 8) break;
  }

  return [...exact, ...prefix, ...includes].slice(0, MAX_RESULTS).map(toMatch);
}
