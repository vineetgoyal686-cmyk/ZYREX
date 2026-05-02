import { useState, useEffect } from "react";

export function useModulePermissions(moduleKey) {
  const read = () => {
    const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
    const isGlobalAdmin = u.role === "global_admin";
    const p = (u.app_permissions || []).find(ap => ap.module_key === moduleKey) || {};
    return { isGlobalAdmin, p };
  };

  const [state, setState] = useState(read);

  useEffect(() => {
    setState(read());
    const handler = () => setState(read());
    window.addEventListener("bms_permissions_updated", handler);
    return () => window.removeEventListener("bms_permissions_updated", handler);
  }, [moduleKey]);

  const { isGlobalAdmin, p } = state;
  return {
    isGlobalAdmin,
    canView:             isGlobalAdmin || !!p.can_view,
    canAdd:              isGlobalAdmin || !!p.can_add,
    canEdit:             isGlobalAdmin || !!p.can_edit,
    canDelete:           isGlobalAdmin || !!p.can_delete,
    canExport:           isGlobalAdmin || !!p.can_export,
    canBulk:             isGlobalAdmin || !!p.can_bulk_upload,
    canDownload:         isGlobalAdmin || !!p.can_download_document,
    canIssue:            isGlobalAdmin || !!p.can_issue,
    canRecall:           isGlobalAdmin || !!p.can_recall,
    canReject:           isGlobalAdmin || !!p.can_reject,
    canRevert:           isGlobalAdmin || !!p.can_revert,
    canCancel:           isGlobalAdmin || !!p.can_cancel,
    canManageAmend:      isGlobalAdmin || !!p.can_manage_amend,
  };
}
