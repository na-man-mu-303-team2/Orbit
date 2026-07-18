import { ProjectListPage } from "./ProjectListPage";

export function ProjectExplorerPage(props: {
  onNavigate: (path: string) => void;
}) {
  return <ProjectListPage mode="project" onNavigate={props.onNavigate} />;
}
