const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

export const logAudit = async (entityType, entityId, entityName, action, changes = null) => {
  try {
    const user = JSON.parse(localStorage.getItem("bms_user") || "{}");
    await fetch(`${API}/api/audit-logs`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        entityId:   String(entityId),
        entityName: entityName || null,
        action,
        userId:     user.id    || null,
        userName:   user.name  || null,
        userEmail:  user.email || null,
        changes:    changes    || null,
      }),
    });
  } catch {
    // Silently fail — don't break the main operation
  }
};
