// Organisation master data (divisions, departments, teams, grades, designations,
// branches, employees) belongs to one company via `company_id`.
// GETs filter only when `?company_id=` is passed, so callers outside the
// Organisation module (Settings, Attendance, …) keep their existing behaviour.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const companyIdFrom = (src) => {
  const v = src?.company_id ?? src?.companyId;
  return v && UUID.test(String(v)) ? String(v) : null;
};

const scopeQuery = (query, req) => {
  const id = companyIdFrom(req.query);
  return id ? query.eq("company_id", id) : query;
};

module.exports = { companyIdFrom, scopeQuery };
