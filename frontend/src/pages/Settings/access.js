// Which Settings sections a user may open. Shared by the Settings page and
// the main Sidebar so both always agree.

const SUPER_ADMIN_PP = {
  manage_user:     { view: true, add: true, edit: true, delete: true, manage_permissions: true },
  manage_project:  { view: true, add: true, edit: true, delete: true },
  designation:     { view: true, add: true, edit: true, delete: true },
  approval_flow:   { view: true, add: true, edit: true, delete: true },
  serialization:   { view: true, add: true, edit: true, delete: true },
  request_handler: { view: true, edit: true },
  delegation:      { view: true, add: true, edit: true, delete: true },
  mail_management: { view: true, add: true, edit: true, delete: true },
};

// super_admin gets every Settings section; everyone else uses their own flags
export const effectiveProfilePerms = (user) =>
  user?.role === "super_admin" ? SUPER_ADMIN_PP : (user?.profile_permissions || {});

export function settingsAccess(user) {
  const pp = effectiveProfilePerms(user);
  const isGlobalAdmin   = user?.role === "global_admin";
  const isSuperOrGlobal = isGlobalAdmin || user?.role === "super_admin";
  return {
    profile:          true,
    security:         true,
    delegation:       isSuperOrGlobal || !!pp.delegation?.view,
    projects:         isSuperOrGlobal || !!pp.manage_project?.view,
    team:             isSuperOrGlobal || !!pp.manage_user?.view,
    roles:            isGlobalAdmin || !!user?.can_manage_roles,
    designations:     isSuperOrGlobal,
    user_analytics:   isGlobalAdmin || !!pp.user_analytics?.view,
    control_center:   isGlobalAdmin || !!user?.can_manage_control_center,
    approval_flow:    isSuperOrGlobal || !!pp.approval_flow?.view,
    serialization:    isSuperOrGlobal || !!pp.serialization?.view,
    request_handler:  isSuperOrGlobal || !!pp.request_handler?.view,
    mail_management:  isSuperOrGlobal || !!pp.mail_management?.view,
  };
}
