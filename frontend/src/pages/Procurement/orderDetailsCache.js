import { authFetch } from "../../utils/authFetch";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const orderDetailsCache = new Map();
const orderDetailsInflight = new Map();

const getOrderCacheKey = (orderId) => String(orderId || "");

export const seedOrderDetails = (order) => {
  if (!order?.id) return;
  const key = getOrderCacheKey(order.id);
  const existing = orderDetailsCache.get(key);
  if (!existing || existing.__partial) {
    orderDetailsCache.set(key, { order, items: [], __partial: true });
  }
};

export const preloadOrderDetails = async (orderId, options = {}) => {
  const key = getOrderCacheKey(orderId);
  if (!key) return null;

  const force = options.force === true;
  const lean = options.lean !== false;
  // A lean=1 (quick-preview) fetch and a full fetch for the same order must
  // not share an inflight slot — otherwise whichever started first "wins"
  // and the other caller silently gets the wrong (lean) payload.
  const inflightKey = `${key}:${lean ? "lean" : "full"}`;
  const cached = orderDetailsCache.get(key);
  if (cached && !cached.__partial && !force && (lean || !cached.__lean)) return cached;
  if (orderDetailsInflight.has(inflightKey)) return orderDetailsInflight.get(inflightKey);

  const cacheBust = force ? `${lean ? "&" : "?"}t=${Date.now()}` : "";
  const promise = authFetch(`${API}/api/orders/${orderId}${lean ? "?lean=1" : ""}${cacheBust}`, force ? { cache: "no-store" } : {})
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch order");
      const json = await res.json();
      const fullDetails = { ...json, __partial: false, __lean: lean };
      orderDetailsCache.set(key, fullDetails);
      return fullDetails;
    })
    .catch((err) => {
      orderDetailsInflight.delete(inflightKey);
      throw err;
    })
    .finally(() => {
      orderDetailsInflight.delete(inflightKey);
    });

  orderDetailsInflight.set(inflightKey, promise);
  return promise;
};

export const getCachedOrderDetails = (orderId) => orderDetailsCache.get(getOrderCacheKey(orderId)) || null;

export const bustOrderCache = (orderId) => {
  if (orderId) orderDetailsCache.delete(getOrderCacheKey(orderId));
};
