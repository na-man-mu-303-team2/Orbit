import type { QualityReport } from "@orbit/shared";

export type PptxImportState =
  | { status: "idle"; warnings: string[]; qualityReport: null; message: string }
  | {
      status: "uploading" | "importing";
      warnings: string[];
      qualityReport: null;
      message: string;
    }
  | {
      status: "succeeded";
      warnings: string[];
      qualityReport: QualityReport;
      message: string;
    }
  | {
      status: "error";
      warnings: string[];
      qualityReport: null;
      message: string;
    };

export function PptxImportQualityPanel(props: { state: PptxImportState }) {
  const { state } = props;
  if (state.status === "idle") return null;

  return (
    <section className="suggestion-card pptx-import-quality" data-testid="pptx-import-quality">
      <strong>PPTX 가져오기</strong>
      <div className="stack-list">
        <div className="stack-item compact">
          <span>{state.message}</span>
          {state.qualityReport ? <strong>{state.qualityReport.compositeScore}/100</strong> : null}
        </div>
        {state.qualityReport ? (
          <div className="stack-item compact">
            <span>편집 가능</span>
            <strong>{Math.round(state.qualityReport.editabilityCoverage * 100)}%</strong>
          </div>
        ) : null}
        {state.qualityReport?.motionDiagnostics ? (
          <div className="stack-item compact" data-testid="pptx-motion-diagnostics">
            <span>모션 진단</span>
            <strong>
              미지원 {state.qualityReport.motionDiagnostics.unsupported} · 저하{" "}
              {state.qualityReport.motionDiagnostics.downgraded} · 미해결{" "}
              {state.qualityReport.motionDiagnostics.unresolved} · 제외{" "}
              {state.qualityReport.motionDiagnostics.excluded}
            </strong>
          </div>
        ) : null}
        {state.warnings.slice(0, 3).map((warning) => (
          <div className="stack-item compact" key={warning}><span>{warning}</span></div>
        ))}
      </div>
    </section>
  );
}
