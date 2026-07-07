import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Project, RehearsalRun } from "@orbit/shared";
import { fetchProjects } from "../projects/ProjectAssetWorkspace";
import { fetchProjectRehearsalRuns } from "./RehearsalWorkspace";
import { navigateTo, formatRunDate } from "./rehearsalUtils";

type ProjectWithReport = {
  project: Project;
  latestRun: RehearsalRun;
  totalCount: number;
};

export function RehearsalReportListPage(_props: { projectId?: string }) {
  const [items, setItems] = useState<ProjectWithReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    void fetchProjects()
      .then(async (allProjects) => {
        const runLists = await Promise.all(
          allProjects.map((p) => fetchProjectRehearsalRuns(p.projectId)),
        );

        const result: ProjectWithReport[] = [];
        for (let i = 0; i < allProjects.length; i++) {
          const succeeded = runLists[i]
            .filter((r) => r.status === "succeeded")
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          if (succeeded.length > 0) {
            result.push({
              project: allProjects[i],
              latestRun: succeeded[0],
              totalCount: succeeded.length,
            });
          }
        }

        result.sort(
          (a, b) =>
            Date.parse(b.latestRun.createdAt) -
            Date.parse(a.latestRun.createdAt),
        );

        if (isMounted) {
          setItems(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setItems([]);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="report-list-page">
      <div className="report-list-inner">
        <header className="report-list-header">
          <h1>리허설 리포트</h1>
          <span>{loading ? "" : `${items.length}개 발표자료`}</span>
        </header>

        {loading ? (
          <div className="report-list-loading">
            <Loader2 size={20} />
            <span>불러오는 중</span>
          </div>
        ) : items.length === 0 ? (
          <div className="report-list-empty">
            <FileText size={32} />
            <p>완료된 리허설 리포트가 없습니다.</p>
            <span>리허설을 완료하면 여기에 리포트가 표시됩니다.</span>
          </div>
        ) : (
          <ul className="report-list-items">
            {items.map(({ project, latestRun, totalCount }) => (
              <li key={project.projectId}>
                <button
                  className="report-list-item"
                  type="button"
                  onClick={() =>
                    navigateTo(`/reports/${encodeURIComponent(project.projectId)}`)
                  }
                >
                  <span className="report-list-item-icon">
                    <FileText size={18} />
                  </span>
                  <span className="report-list-item-body">
                    <strong>{project.title}</strong>
                    <span>
                      최근 {formatRunDate(latestRun.createdAt)} · {totalCount}회차
                    </span>
                  </span>
                  <ChevronRight size={16} className="report-list-item-arrow" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
