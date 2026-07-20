import type { CommunityTemplateSourceProject } from "@orbit/shared";

export type CommunityTemplateSourceState = {
  items: CommunityTemplateSourceProject[];
  loading: boolean;
  error: string | null;
};

export function CommunityTemplateSourcePicker(props: {
  disabled: boolean;
  error?: string;
  onChange: (projectId: string) => void;
  onRetry: () => void;
  selectedProjectId: string;
  state: CommunityTemplateSourceState;
}) {
  const helperId = "community-template-publish-source-helper";
  return (
    <fieldset
      aria-describedby={props.error ? helperId : undefined}
      aria-invalid={props.error ? "true" : undefined}
      className="community-template-source-field"
      id="community-template-publish-source"
      tabIndex={-1}
    >
      <legend>공개할 프로젝트</legend>
      <p>서버가 확인한 내 소유 프로젝트만 표시됩니다.</p>

      {props.state.loading ? (
        <div
          aria-label="공개 가능한 프로젝트를 불러오는 중"
          className="community-template-source-loading"
          role="status"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      ) : props.state.error ? (
        <div className="community-template-source-error" role="alert">
          <span>{props.state.error}</span>
          <button onClick={props.onRetry} type="button">
            다시 시도
          </button>
        </div>
      ) : props.state.items.length === 0 ? (
        <p className="community-template-source-empty" role="status">
          공개할 수 있는 프로젝트가 없습니다.
        </p>
      ) : (
        <div className="community-template-source-list">
          {props.state.items.map((source) => (
            <label
              className="community-template-source-option"
              key={source.projectId}
              title={source.title}
            >
              <input
                checked={props.selectedProjectId === source.projectId}
                disabled={props.disabled}
                name="community-template-source-project"
                onChange={() => props.onChange(source.projectId)}
                type="radio"
                value={source.projectId}
              />
              <span>
                <strong>{source.title}</strong>
                <small>{formatSourceDate(source.createdAt)}</small>
              </span>
            </label>
          ))}
        </div>
      )}

      {props.error ? (
        <small id={helperId} role="alert">
          {props.error}
        </small>
      ) : null}
    </fieldset>
  );
}

function formatSourceDate(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? "날짜 없음"
    : `${date.toLocaleDateString("ko-KR")} 생성`;
}
