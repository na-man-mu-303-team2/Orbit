import { OrbitDialog, OrbitInput } from "../../components/ui";

export function CommunityTemplateGalleryDialog(props: {
  onClose: () => void;
  open: boolean;
}) {
  return (
    <OrbitDialog
      className="community-template-gallery-dialog"
      description="디자인과 레이아웃을 골라 바로 시작하세요."
      onClose={props.onClose}
      open={props.open}
      title="커뮤니티 템플릿"
    >
      <label className="community-template-search">
        <span className="community-template-visually-hidden">템플릿 검색</span>
        <OrbitInput
          data-orbit-dialog-initial
          placeholder="템플릿 검색"
          type="search"
        />
      </label>
    </OrbitDialog>
  );
}
