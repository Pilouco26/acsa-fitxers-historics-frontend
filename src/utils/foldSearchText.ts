/** Fold text for accent- and case-insensitive substring search. */
export function foldSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[ç]/gi, "c")
    .replace(/[ñ]/gi, "n")
    .replace(/[ß]/g, "ss")
    .replace(/[æ]/gi, "ae")
    .replace(/[ø]/gi, "o")
    .toLocaleLowerCase("ca");
}

/** True when `haystack` contains `needle`, ignoring case and accents. */
export function includesFolded(haystack: string, needle: string): boolean {
  const foldedNeedle = foldSearchText(needle);
  if (!foldedNeedle) return true;
  return foldSearchText(haystack).includes(foldedNeedle);
}
