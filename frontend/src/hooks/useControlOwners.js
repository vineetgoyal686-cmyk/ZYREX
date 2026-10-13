import { useEffect, useState } from "react";
import api from "../utils/api";

// Control Center owners — { module_key: [user_id, ...] }, shared by every
// permission screen so it's fetched once per screen open, not per card.
let cached = null;
const subscribers = new Set();

export const refreshControlOwners = () =>
  api.get("/api/control-center")
    .then(r => { cached = r.data?.owners || {}; })
    .catch(() => { cached = cached || {}; })
    .finally(() => subscribers.forEach(fn => fn(cached)));

export function useControlOwners() {
  const [owners, setOwners] = useState(cached);
  useEffect(() => {
    subscribers.add(setOwners);
    refreshControlOwners();
    return () => { subscribers.delete(setOwners); };
  }, []);
  return owners;
}

// Can this user grant / change / remove permissions on this module?
export const canGrantModule = (owners, user, key) =>
  user?.role === "global_admin" || !(owners?.[key]?.length) || owners[key].includes(user?.id);
