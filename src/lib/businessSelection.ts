export const BUSINESS_SELECTION_KEY = "ikurt:selected-business:v1";

// Existing preferences (including “all”) win over old bookmarked query parameters.
export function initialBusinessSelection(saved: string | null, search: string): string {
  return saved ?? new URLSearchParams(search).get("business") ?? "";
}
let selected: string | undefined;
const listeners = new Set<() => void>();
export function getBusinessSelection(): string {
  if (selected === undefined) {
    try { selected = initialBusinessSelection(localStorage.getItem(BUSINESS_SELECTION_KEY), window.location.search); }
    catch { selected = ""; }
    try { localStorage.setItem(BUSINESS_SELECTION_KEY, selected); } catch { /* In-memory fallback for restricted storage. */ }
  }
  return selected;
}
export function selectBusiness(id: string): void {
  selected = id;
  try { localStorage.setItem(BUSINESS_SELECTION_KEY, id); } catch { /* Keep this tab usable. */ }
  for (const notify of listeners) notify();
}
export function clearDeletedBusiness(id: string): void {
  if (getBusinessSelection() === id) selectBusiness("");
}
export function subscribeBusinessSelection(notify: () => void): () => void {
  listeners.add(notify);
  function onStorage(event: StorageEvent) {
    if (event.key === BUSINESS_SELECTION_KEY) {
      selected = event.newValue ?? "";
      for (const listener of listeners) listener();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(notify); window.removeEventListener("storage", onStorage); };
}
