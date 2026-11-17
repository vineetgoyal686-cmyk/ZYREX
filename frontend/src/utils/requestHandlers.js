// Request Handlers payload from GET /api/request-handlers:
//   { config: Default handlers, by_company: { [companyId]: same shape } }
// A company's own list wins when it has users; otherwise the Default list applies.

export function handlerUsersFor(payload, moduleKey, actionKey, companyId) {
  const own = companyId ? payload?.by_company?.[companyId]?.[moduleKey]?.[actionKey]?.users : null;
  if (own?.length) return own;
  return payload?.config?.[moduleKey]?.[actionKey]?.users || [];
}

export function isHandlerOf(payload, userId, moduleKey, actionKey, companyId) {
  return handlerUsersFor(payload, moduleKey, actionKey, companyId)
    .some(u => String(u.id) === String(userId));
}
