import { IconSparkles } from "@tabler/icons-react";

type CreateProjectCardProps = {
  onClick: () => void;
};

export function CreateProjectCard({ onClick }: CreateProjectCardProps) {
  return (
    <button className="workspace-create-project-card" onClick={onClick} type="button">
      <span className="workspace-create-project-icon" aria-hidden="true">
        <IconSparkles size={24} stroke={1.8} />
      </span>
      <span className="workspace-create-project-copy">
        <strong>AI로 발표자료 만들기</strong>
        <small>아이디어를 입력하면 AI가 발표자료 초안을 만들어드려요.</small>
      </span>
    </button>
  );
}
