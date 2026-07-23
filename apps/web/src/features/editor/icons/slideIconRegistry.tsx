import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowBigRight,
  IconArrowBounce,
  IconArrowCurveLeft,
  IconArrowCurveRight,
  IconArrowDown,
  IconArrowDownLeft,
  IconArrowDownRight,
  IconArrowFork,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowLoopLeft,
  IconArrowLoopRight,
  IconArrowMerge,
  IconArrowNarrowRight,
  IconArrowRight,
  IconArrowsExchange,
  IconArrowsJoin,
  IconArrowsLeftRight,
  IconArrowsSplit,
  IconArrowsUpDown,
  IconArrowUp,
  IconArrowUpLeft,
  IconArrowUpRight,
  IconAward, IconBriefcase, IconBuilding,
  IconBulb, IconCalendar, IconChartBar, IconChartLine, IconCheck,
  IconChevronRight,
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

import { presentationArrowAssets } from "../assets/presentationArrowAssets";

export type SlideIconDefinition = {
  category: "arrow" | "general";
  defaultHeight?: number;
  defaultWidth?: number;
  Icon: TablerIcon;
  keywords: string[];
  label: string;
  name: string;
};

export const slideArrowIconDefinitions: SlideIconDefinition[] =
  presentationArrowAssets.map((assetDefinition) => ({
    ...assetDefinition,
    category: "arrow" as const,
    keywords: ["화살표", "장표", "PPT", ...assetDefinition.keywords],
  }));

const directionalIconDefinitions: SlideIconDefinition[] = [
  icon("arrow-right", "오른쪽 방향", IconArrowRight, ["다음", "진행"]),
  icon("arrow-left", "왼쪽 방향", IconArrowLeft, ["이전", "뒤로"]),
  icon("arrow-up", "위쪽 방향", IconArrowUp, ["상단", "상승"]),
  icon("arrow-down", "아래쪽 방향", IconArrowDown, ["하단", "하강"]),
  icon("arrow-up-right", "오른쪽 위 방향", IconArrowUpRight, ["우상향", "성장"]),
  icon("arrow-down-right", "오른쪽 아래 방향", IconArrowDownRight, ["우하향"]),
  icon("arrow-up-left", "왼쪽 위 방향", IconArrowUpLeft, ["좌상향"]),
  icon("arrow-down-left", "왼쪽 아래 방향", IconArrowDownLeft, ["좌하향"]),
  icon("arrow-narrow-right", "가는 방향", IconArrowNarrowRight, ["얇은", "다음"]),
  icon("arrow-big-right", "굵은 방향", IconArrowBigRight, ["강조", "다음"]),
  icon("chevron-right", "꺾쇠 방향", IconChevronRight, ["단계", "프로세스"]),
  icon("arrows-left-right", "좌우 방향", IconArrowsLeftRight, ["양방향", "수평"]),
  icon("arrows-up-down", "상하 방향", IconArrowsUpDown, ["양방향", "수직"]),
  icon("arrows-exchange", "교환 방향", IconArrowsExchange, ["전환", "교체"]),
  icon("arrow-curve-left", "왼쪽 곡선 방향", IconArrowCurveLeft, ["곡선", "회전"]),
  icon("arrow-curve-right", "오른쪽 곡선 방향", IconArrowCurveRight, ["곡선", "회전"]),
  icon("arrow-back-up", "되돌아가기", IconArrowBackUp, ["실행 취소", "복귀"]),
  icon("arrow-forward-up", "다시 실행", IconArrowForwardUp, ["재실행", "복귀"]),
  icon("arrow-loop-left", "왼쪽 순환", IconArrowLoopLeft, ["루프", "반복"]),
  icon("arrow-loop-right", "오른쪽 순환", IconArrowLoopRight, ["루프", "반복"]),
  icon("arrows-split", "분기 방향", IconArrowsSplit, ["분할", "갈래"]),
  icon("arrows-join", "결합 방향", IconArrowsJoin, ["합류", "통합"]),
  icon("arrow-merge", "병합 방향", IconArrowMerge, ["합치기", "통합"]),
  icon("arrow-fork", "포크 방향", IconArrowFork, ["분기", "선택"]),
  icon("arrow-bounce", "전환 방향", IconArrowBounce, ["전환", "흐름"]),
];

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
  icon("sparkles", "강조", IconSparkles, ["AI", "특징"]),
  ...directionalIconDefinitions,
  ...slideArrowIconDefinitions,
];

export function createSlideIconDataUrl(definition: SlideIconDefinition, color: string) {
  const markup = renderToStaticMarkup(createElement(definition.Icon, {
    color,
    height: definition.defaultHeight ?? 96,
    stroke: 2,
    width: definition.defaultWidth ?? 96,
    xmlns: "http://www.w3.org/2000/svg"
  }));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function icon(name: string, label: string, Icon: TablerIcon, keywords: string[]): SlideIconDefinition {
  return { category: "general", Icon, keywords, label, name };
}
