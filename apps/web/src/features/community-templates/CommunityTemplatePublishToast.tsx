import { useEffect } from "react";

export function CommunityTemplatePublishToast(props: {
  onDismiss: () => void;
  title: string;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(props.onDismiss, 4_500);
    return () => window.clearTimeout(timeout);
  }, [props.onDismiss, props.title]);

  return (
    <div
      aria-live="polite"
      className="community-template-publish-toast"
      role="status"
    >
      <span>
        <strong>{props.title}</strong> 템플릿을 커뮤니티에 등록했어요.
      </span>
      <button aria-label="알림 닫기" onClick={props.onDismiss} type="button">
        닫기
      </button>
    </div>
  );
}
