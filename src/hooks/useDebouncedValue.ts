import { useEffect, useState } from "react";
import { SEARCH_DEBOUNCE_MS } from "@/constants/globals";

/**
 * Returns a debounced copy of `value`, updated after `delayMs` of stability.
 */
export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
