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
  const cached = orderDetailsCache.get(key);
  if (cached && !cached.__partial && !force) return cached;
  if (orderDetailsInflight.has(key)) return orderDetailsInflight.get(key);

  const promise = fetch(`${API}/api/orders/${orderId}`)
    .then(async (res) => {
      if (!res.ok) throw new Error("Failed to fetch order");
      const json = await res.json();
      const fullDetails = { ...json, __partial: false };
      orderDetailsCache.set(key, fullDetails);
      return fullDetails;
    })
    .catch((err) => {
      orderDetailsInflight.delete(key);
      throw err;
    })
    .finally(() => {
      orderDetailsInflight.delete(key);
    });

  orderDetailsInflight.set(key, promise);
  return promise;
};

export const getCachedOrderDetails = (orderId) => orderDetailsCache.get(getOrderCacheKey(orderId)) || null;
