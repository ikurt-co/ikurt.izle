import { useSyncExternalStore } from "react";
import { getBusinessSelection, selectBusiness, subscribeBusinessSelection } from "./businessSelection";
export function useBusinessSelection() {
  const selectedBusinessId = useSyncExternalStore(subscribeBusinessSelection, getBusinessSelection, () => "");
  return [selectedBusinessId, selectBusiness] as const;
}
