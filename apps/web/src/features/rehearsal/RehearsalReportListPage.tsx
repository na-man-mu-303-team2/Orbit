import { ArrowUpRight, FileText, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Project, RehearsalRun } from "@orbit/shared";
import { fetchProjects } from "../projects/ProjectAssetWorkspace";
import { fetchProjectRehearsalReportRuns } from "./reportApi";
import { navigateTo, formatRunDate } from "./rehearsalUtils";
import orbitReportMascot from "../../assets/orbit-report-mascot-transparent.png";

type ProjectWithReport = {
  project: Project;
  latestRun: RehearsalRun;
  totalCount: number;
};

export function RehearsalReportListPage({ projectId }: { projectId?: string }) {
  const [items, setItems] = useState<ProjectWithReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      navigateTo(`/reports/${encodeURIComponent(projectId)}`);
      return;
    }

    let isMounted = true;
    setLoading(true);

    void fetchProjects()
      .then(async (allProjects) => {
        const runLists = await Promise.all(
          allProjects.map((p) => fetchProjectRehearsalReportRuns(p.projectId)),
        );

        const result: ProjectWithReport[] = [];
        for (let i = 0; i < allProjects.length; i++) {
          const { runs, total } = runLists[i];
          if (runs.length > 0) {
            const sorted = [...runs].sort(
              (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
            );
            result.push({
              project: allProjects[i],
              latestRun: sorted[0],
              totalCount: total,
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
  }, [projectId]);

  return (
    <div className="report-list-page">
      <div className="report-list-inner">
        <header className="report-list-hero">
          <div className="report-list-hero-copy">
            <span className="report-page-kicker">
              <Sparkles size={14} /> AI 발표 리포트
            </span>
            <h1>리허설 리포트</h1>
            <p>
              발표를 데이터로 돌아보고,
              <br className="report-list-hero-break" />
              다음 발표의 집중 포인트를 찾아보세요.
            </p>
            <div className="report-list-hero-meta">
              <span>{loading ? "분석 중" : `${items.length}개 발표자료`}</span>
              <span>{loading ? "" : "최근 기록부터 정렬"}</span>
            </div>
          </div>
          <div className="report-mascot-wrap report-list-mascot-wrap">
            <img
              src={orbitReportMascot}
              alt="ORBIT 리포트 캐릭터"
              className="report-mascot report-list-mascot"
            />
            <span className="report-mascot-bubble">발표를 같이 돌아봐요!</span>
          </div>
        </header>

        <div className="report-list-header">
          <div>
            <span className="report-section-kicker">YOUR PRESENTATIONS</span>
            <h2>발표 자료</h2>
          </div>
          <span>{loading ? "" : `${items.length}개`}</span>
        </div>

        {loading ? (
          <div className="report-list-loading">
            <Loader2 size={20} />
            <span>불러오는 중</span>
          </div>
        ) : items.length === 0 ? (
          <div className="report-list-empty">
            <div className="report-list-empty-visual">
              <img src={orbitReportMascot} alt="ORBIT 리포트 캐릭터" />
            </div>
            <FileText size={24} />
            <p>완료된 리허설 리포트가 없습니다.</p>
            <span>리허설을 완료하면 여기에 리포트가 표시됩니다.</span>
          </div>
        ) : (
          <ul className="report-list-items">
            {items.map(({ project, latestRun, totalCount }, index) => (
              <li key={project.projectId}>
                <button
                  className="report-list-item"
                  type="button"
                  onClick={() =>
                    navigateTo(`/reports/${encodeURIComponent(project.projectId)}`)
                  }
                >
                  <span className="report-list-item-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="report-list-item-icon">
                    <FileText size={18} />
                  </span>
                  <span className="report-list-item-body">
                    <strong>{project.title}</strong>
                    <span>최근 업데이트 {formatRunDate(latestRun.createdAt)}</span>
                  </span>
                  <span className="report-list-item-summary">
                    <strong>{totalCount}</strong>
                    <span>회차 기록</span>
                  </span>
                  <span className="report-list-item-arrow-wrap">
                    <ArrowUpRight size={17} className="report-list-item-arrow" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
