import {
  IconAlertTriangle, IconArrowRight, IconAward, IconBriefcase, IconBuilding,
  IconBulb, IconCalendar, IconChartBar, IconChartLine, IconCheck,
  IconCircleCheck, IconClock, IconCloud, IconCoin, IconDatabase,
  IconDeviceLaptop, IconFlag, IconGlobe, IconHeart, IconHelpCircle,
  IconInfoCircle, IconLock, IconMail, IconMapPin,
  IconMessageCircle, IconPackage, IconPhone, IconRocket, IconSearch,
  IconSettings, IconShieldCheck, IconShoppingCart, IconSparkles, IconStar,
  IconTarget, IconTools, IconTrendingDown, IconTrendingUp, IconTruck,
  IconUser, IconUserCheck, IconUsers, IconWallet, type TablerIcon
} from "@tabler/icons-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

export type SlideIconDefinition = {
  Icon: TablerIcon;
  keywords: string[];
  label: string;
  name: string;
};

export const slideIconDefinitions: SlideIconDefinition[] = [
  icon("trending-up", "성장", IconTrendingUp, ["상승", "매출", "성과"]),
  icon("trending-down", "하락", IconTrendingDown, ["감소", "하락세"]),
  icon("chart-bar", "막대 차트", IconChartBar, ["통계", "데이터", "지표"]),
  icon("chart-line", "선 차트", IconChartLine, ["추세", "분석", "그래프"]),
  icon("coin", "매출", IconCoin, ["돈", "수익", "금액"]),
  icon("wallet", "예산", IconWallet, ["비용", "자금"]),
  icon("users", "고객", IconUsers, ["사용자", "팀", "구성원"]),
  icon("user", "사용자", IconUser, ["사람", "개인"]),
  icon("user-check", "사용자 확인", IconUserCheck, ["승인", "회원"]),
  icon("target", "목표", IconTarget, ["전략", "핵심", "달성"]),
  icon("bulb", "아이디어", IconBulb, ["인사이트", "혁신"]),
  icon("rocket", "출시", IconRocket, ["시작", "도약", "성장"]),
  icon("flag", "마일스톤", IconFlag, ["단계", "완료"]),
  icon("award", "성과", IconAward, ["수상", "인증"]),
  icon("star", "추천", IconStar, ["중요", "평가"]),
  icon("heart", "만족", IconHeart, ["선호", "고객 만족"]),
  icon("check", "완료", IconCheck, ["확인", "성공"]),
  icon("circle-check", "검증", IconCircleCheck, ["승인", "완료"]),
  icon("alert-triangle", "주의", IconAlertTriangle, ["경고", "위험"]),
  icon("info-circle", "정보", IconInfoCircle, ["안내", "설명"]),
  icon("help-circle", "질문", IconHelpCircle, ["도움", "문의"]),
  icon("calendar", "일정", IconCalendar, ["날짜", "계획"]),
  icon("clock", "시간", IconClock, ["기간", "마감"]),
  icon("map-pin", "위치", IconMapPin, ["장소", "지역"]),
  icon("globe", "글로벌", IconGlobe, ["세계", "시장"]),
  icon("building", "기업", IconBuilding, ["회사", "조직"]),
  icon("briefcase", "비즈니스", IconBriefcase, ["사업", "업무"]),
  icon("shopping-cart", "구매", IconShoppingCart, ["쇼핑", "판매"]),
  icon("package", "제품", IconPackage, ["상품", "배송"]),
  icon("truck", "물류", IconTruck, ["배송", "운송"]),
  icon("settings", "설정", IconSettings, ["관리", "프로세스"]),
  icon("tools", "도구", IconTools, ["작업", "개선"]),
  icon("shield-check", "보안", IconShieldCheck, ["안전", "보호"]),
  icon("lock", "잠금", IconLock, ["보안", "개인정보"]),
  icon("cloud", "클라우드", IconCloud, ["서버", "온라인"]),
  icon("database", "데이터베이스", IconDatabase, ["데이터", "저장"]),
  icon("device-laptop", "디지털", IconDeviceLaptop, ["기술", "서비스"]),
  icon("mail", "이메일", IconMail, ["연락", "메시지"]),
  icon("phone", "전화", IconPhone, ["연락", "상담"]),
  icon("message-circle", "대화", IconMessageCircle, ["채팅", "소통"]),
  icon("search", "검색", IconSearch, ["탐색", "조사"]),
  icon("arrow-right", "다음", IconArrowRight, ["이동", "진행"]),
  icon("sparkles", "강조", IconSparkles, ["AI", "특징"])
];

export function createSlideIconDataUrl(definition: SlideIconDefinition, color: string) {
  const markup = renderToStaticMarkup(createElement(definition.Icon, {
    color, height: 96, stroke: 2, width: 96,
    xmlns: "http://www.w3.org/2000/svg"
  }));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function icon(name: string, label: string, Icon: TablerIcon, keywords: string[]): SlideIconDefinition {
  return { Icon, keywords, label, name };
}
