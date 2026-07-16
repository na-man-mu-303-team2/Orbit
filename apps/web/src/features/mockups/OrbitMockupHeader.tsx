import {
  IconBell,
  IconChevronDown,
  IconSearch,
  IconUserCircle
} from "@tabler/icons-react";
import { OrbitButton } from "../../design-system";
import orbitLogo from "./assets/orbit-logo-selected.png";

export function MockupHeader(props: {
  mode: "public" | "app";
  onLoginClick?: () => void;
  onLogoClick: () => void;
  onPrimaryClick?: () => void;
}) {
  return (
    <header className="mockup-header">
      <button aria-label="ORBIT 목업 홈" className="mockup-logo-button" onClick={props.onLogoClick} type="button">
        <img alt="ORBIT" src={orbitLogo} />
      </button>
      <nav aria-label={props.mode === "public" ? "공개 navigation" : "제품 navigation"}>
        {(props.mode === "public"
          ? ["제품", "활용 방법", "리허설", "템플릿"]
          : ["홈", "프로젝트", "리허설", "리포트"]
        ).map((item, index) => (
          <button aria-current={index === 0 ? "page" : undefined} key={item} type="button">
            {item}
          </button>
        ))}
      </nav>
      {props.mode === "public" ? (
        <div className="mockup-header-public-actions">
          <button onClick={props.onLoginClick} type="button">로그인</button>
          <OrbitButton onClick={props.onPrimaryClick}>무료로 시작</OrbitButton>
        </div>
      ) : (
        <div className="mockup-header-app-actions">
          <label>
            <IconSearch size={18} />
            <input aria-label="전체 검색" placeholder="검색" />
          </label>
          <button aria-label="알림" type="button"><IconBell size={20} /></button>
          <span><IconUserCircle size={28} /> 김지윤 <IconChevronDown size={16} /></span>
        </div>
      )}
    </header>
  );
}
