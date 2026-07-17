import { ProjectListPage } from "../projects/ProjectListPage";

export function RehearsalProjectPickerPage(props: {
  onNavigate: (path: string) => void;
}) {
  return <ProjectListPage mode="rehearsal" onNavigate={props.onNavigate} />;
}
