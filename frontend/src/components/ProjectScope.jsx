import { FolderKanban } from "lucide-react";
import ScopeDropdown from "./ScopeDropdown";

/*
 * Project picker strip shown above pages that work per project (Orders,
 * Intake, Expense Book, Attendance, 3D View). Replaces the old sidebar
 * project selector.
 *  - access.one: may open a single project (the page's project permission)
 *  - access.all: may open "All projects" (the old Master Data permission)
 * With neither a project nor "all" allowed, asks the user to pick one.
 */
export default function ProjectScope({ project, projects, access, onChange, children }) {
  const options = access.one
    ? projects.map(p => ({ id: p.name, title: p.projectName || p.name, code: p.projectCode || "", detail: [p.city, p.state].filter(Boolean).join(", ") }))
    : [];
  const showAll = !project && access.all;

  return (
    <div className="min-h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-5 sm:px-6 py-2 bg-white border-b border-slate-200">
        <span className="text-[12px] font-semibold text-slate-500">Project</span>
        <ScopeDropdown icon={FolderKanban} value={project || ""} align="left"
          placeholder="Select project" countLabel="Total Projects"
          allLabel={access.all ? "All projects" : undefined}
          onChange={id => onChange(id || null)}
          options={options} />
      </div>
      {project || showAll ? children : (
        <div className="flex-1 flex items-center justify-center p-10">
          <p className="text-slate-400 font-bold uppercase tracking-wider text-sm text-center">
            {access.one ? "Select a project to continue" : "You don't have access to this area"}
          </p>
        </div>
      )}
    </div>
  );
}
