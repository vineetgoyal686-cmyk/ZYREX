import GlobalDashboard from "./GlobalDashboard";
import ProjectDashboard from "./ProjectDashboard";

export default function Dashboard({ project }) {
  const projectName = typeof project === "string" ? project : project?.name;
  const isGlobal = !projectName || projectName === "All Project";

  if (isGlobal) return <GlobalDashboard />;
  return <ProjectDashboard project={projectName} />;
}
