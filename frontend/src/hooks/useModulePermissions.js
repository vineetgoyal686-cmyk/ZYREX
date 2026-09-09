import { useState, useEffect } from "react";

export function useModulePermissions(moduleKey) {
  const read = () => {
    const u = JSON.parse(localStorage.getItem("bms_user") || "{}");
    const isGlobalAdmin    = u.role === "global_admin";
    // Boardroom is executive-only — only global_admin bypasses (matches
    // Sidebar.jsx and permHelper.js). super_admin/admin need every one of
    // these granted explicitly, same as anyone else, on every other module.
    const isBoardroom      = moduleKey.startsWith("boardroom");
    const isSuperOrGlobal  = isBoardroom ? isGlobalAdmin : (isGlobalAdmin || u.role === "super_admin");
    const p = (u.app_permissions || []).find(ap => ap.module_key === moduleKey) || {};
    return { isGlobalAdmin, isSuperOrGlobal, p };
  };

  const [state, setState] = useState(read);

  useEffect(() => {
    setState(read());
    const handler = () => setState(read());
    window.addEventListener("bms_permissions_updated", handler);
    return () => window.removeEventListener("bms_permissions_updated", handler);
  }, [moduleKey]);

  const { isGlobalAdmin, isSuperOrGlobal, p } = state;
  return {
    isGlobalAdmin,
    canView:             isSuperOrGlobal || !!p.can_view,
    canAdd:              isSuperOrGlobal || !!p.can_add,
    canEdit:             isSuperOrGlobal || !!p.can_edit,
    canDelete:           isSuperOrGlobal || !!p.can_delete,
    canExport:           isSuperOrGlobal || !!p.can_export,
    canBulk:             isSuperOrGlobal || !!p.can_bulk_upload,
    canManageColumns:    isSuperOrGlobal || !!p.can_manage_columns,
    canViewLog:          isSuperOrGlobal || !!p.can_log,
    canDownload:         isSuperOrGlobal || !!p.can_download_document,
    canIssue:            isSuperOrGlobal || !!p.can_issue,
    canRecall:           isSuperOrGlobal || !!p.can_recall,
    canReject:           isSuperOrGlobal || !!p.can_reject,
    canRevert:           isSuperOrGlobal || !!p.can_revert,
    canCancel:           isSuperOrGlobal || !!p.can_cancel,
    canManageAmend:      isSuperOrGlobal || !!p.can_manage_amend,
    canTakeAction:       isSuperOrGlobal || !!p.can_take_action,
    canViewOverviewAging: isSuperOrGlobal || !!p.order_overview_aging,
    canViewIntake:        isSuperOrGlobal || !!p.order_intake,
    canViewPayment:        isSuperOrGlobal || !!p.order_payment,
  };
}
