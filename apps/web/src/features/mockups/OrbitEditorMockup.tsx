import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconCloudCheck,
  IconCopy,
  IconHistory,
  IconLink,
  IconLayoutGrid,
  IconMail,
  IconMessage,
  IconMessageCircle,
  IconMicrophone,
  IconNotes,
  IconPalette,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconPointer,
  IconShare,
  IconSparkles,
  IconStar,
  IconTextSize,
  IconTrash,
  IconUserPlus,
  IconUsers,
  IconWand,
  IconX,
  IconZoomIn,
  IconZoomOut
} from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";
import orbitLogo from "./assets/orbit-logo-selected.png";
import { OrbitButton } from "../../components/ui";
import "./orbit-editor-mockup.css";

type OrbitEditorMockupProps = {
  onNavigate: (path: string) => void;
};

type EditorPanel = "ai" | "design" | "notes";
type EditorTool = "select" | "text" | "image" | "chart" | "layout";
type SharePanel = "members" | "requests";
type ShareRole = "owner" | "editor" | "viewer";

type ShareMember = {
  email: string;
  id: string;
  name: string;
  role: ShareRole;
};

type ShareRequest = {
  email: string;
  id: string;
  name: string;
  role: Exclude<ShareRole, "owner">;
};

type MockSlide = {
  eyebrow: string;
  id: number;
  subtitle: string;
  theme: "lilac" | "lime" | "cream" | "navy" | "white";
  title: string;
};

const initialSlides: MockSlide[] = [
  {
    eyebrow: "PRODUCT STRATEGY 2026",
    id: 1,
    subtitle: "고객 가치 중심의 실행으로 지속 가능한 성장을 가속화합니다.",
    theme: "lilac",
    title: "다음 성장을 만드는\n세 가지 선택"
  },
  {
    eyebrow: "01 · OPPORTUNITY",
    id: 2,
    subtitle: "고객 데이터와 현장 인터뷰에서 반복되는 기회를 찾았습니다.",
    theme: "white",
    title: "시장보다 빠르게\n변하는 고객의 기대"
  },
  {
    eyebrow: "02 · PRIORITIES",
    id: 3,
    subtitle: "선택과 집중을 통해 팀의 실행 속도를 높입니다.",
    theme: "lime",
    title: "2026 핵심 우선순위"
  },
  {
    eyebrow: "03 · ROADMAP",
    id: 4,
    subtitle: "분기별 목표와 책임을 명확하게 연결합니다.",
    theme: "cream",
    title: "전략을 실행으로\n옮기는 로드맵"
  },
  {
    eyebrow: "04 · IMPACT",
    id: 5,
    subtitle: "제품과 시장 지표를 하나의 성장 언어로 정렬합니다.",
    theme: "navy",
    title: "우리가 만들 변화"
  },
  {
    eyebrow: "NEXT STEP",
    id: 6,
    subtitle: "오늘의 합의를 다음 주의 실행으로 연결합니다.",
    theme: "white",
    title: "함께 결정할 세 가지"
  }
];

const editorTools: Array<{ icon: ReactNode; id: EditorTool; label: string }> = [
  { icon: <IconPointer size={19} />, id: "select", label: "선택" },
  { icon: <IconTextSize size={19} />, id: "text", label: "텍스트" },
  { icon: <IconPhoto size={19} />, id: "image", label: "이미지" },
  { icon: <IconChartBar size={19} />, id: "chart", label: "차트" },
  { icon: <IconLayoutGrid size={19} />, id: "layout", label: "레이아웃" }
];

const initialShareMembers: ShareMember[] = [
  { email: "jiyoon.kim@orbit.team", id: "owner", name: "김지윤", role: "owner" },
  { email: "minseo.park@orbit.team", id: "member-1", name: "박민서", role: "editor" },
  { email: "jihoon.lee@orbit.team", id: "member-2", name: "이지훈", role: "viewer" }
];

const initialShareRequests: ShareRequest[] = [
  { email: "sora.choi@orbit.team", id: "request-1", name: "최소라", role: "editor" },
  { email: "hyunwoo.jung@orbit.team", id: "request-2", name: "정현우", role: "viewer" }
];

export function OrbitEditorMockup(props: OrbitEditorMockupProps) {
  const [activePanel, setActivePanel] = useState<EditorPanel>("ai");
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [appliedSuggestion, setAppliedSuggestion] = useState(false);
  const [notice, setNotice] = useState("모든 변경사항이 저장됐어요.");
  const [selectedSlideId, setSelectedSlideId] = useState(1);
  const [shareOpen, setShareOpen] = useState(false);
  const [slides, setSlides] = useState(initialSlides);
  const [zoom, setZoom] = useState(78);

  const selectedSlide = useMemo(
    () => slides.find((slide) => slide.id === selectedSlideId) ?? slides[0],
    [selectedSlideId, slides]
  );
  const selectedIndex = slides.findIndex((slide) => slide.id === selectedSlide.id);

  function addSlide() {
    const nextId = Math.max(...slides.map((slide) => slide.id)) + 1;
    setSlides((current) => [
      ...current,
      {
        eyebrow: "NEW SLIDE",
        id: nextId,
        subtitle: "핵심 메시지를 한 문장으로 입력하세요.",
        theme: "white",
        title: "새 슬라이드"
      }
    ]);
    setSelectedSlideId(nextId);
    setNotice("새 슬라이드를 추가했습니다.");
  }

  function applySuggestion() {
    setSlides((current) =>
      current.map((slide) =>
        slide.id === selectedSlide.id
          ? {
              ...slide,
              subtitle: "고객 가치, 시장 확장, 실행 체계를 하나의 성장 전략으로 연결합니다.",
              title: "성장을 가속하는\n세 가지 전략"
            }
          : slide
      )
    );
    setAppliedSuggestion(true);
    setNotice("AI 제안을 슬라이드에 적용했습니다.");
  }

  return (
    <div className="orbit-editor-mockup">
      <header className="editor-mockup-topbar">
        <div className="editor-mockup-brand">
          <button aria-label="프로젝트 허브로" onClick={() => props.onNavigate("/mockup/home")} type="button">
            <IconArrowLeft size={19} />
          </button>
          <img alt="ORBIT" src={orbitLogo} />
          <div className="editor-mockup-document">
            <div className="editor-mockup-document-title-row">
              <button className="editor-mockup-title" type="button">
                2026 하반기 제품 전략 <IconChevronDown size={16} />
              </button>
              <button aria-label="즐겨찾기" className="editor-mockup-document-icon" type="button">
                <IconStar size={17} />
              </button>
              <span className="editor-mockup-save-state"><IconCloudCheck size={16} /> 저장됨</span>
            </div>
            <nav aria-label="문서 메뉴" className="editor-mockup-menu-row">
              {[
                "파일",
                "수정",
                "보기",
                "삽입",
                "서식",
                "슬라이드",
                "정렬",
                "도구",
                "도움말"
              ].map((menu) => <button key={menu} type="button">{menu}</button>)}
            </nav>
          </div>
        </div>

        <div className="editor-mockup-primary-actions">
          <button aria-label="버전 기록" className="editor-mockup-top-icon" type="button">
            <IconHistory size={19} />
          </button>
          <button aria-label="댓글" className="editor-mockup-top-icon" type="button">
            <IconMessageCircle size={19} />
          </button>
          <OrbitButton icon={<IconShare size={18} />} onClick={() => setShareOpen(true)} variant="secondary">공유</OrbitButton>
          <OrbitButton
            icon={<IconMicrophone size={18} />}
            onClick={() => props.onNavigate("/mockup/microphone-check")}
            variant="secondary"
          >
            리허설
          </OrbitButton>
          <OrbitButton icon={<IconPlayerPlay size={18} />} onClick={() => props.onNavigate("/mockup/live-presenter")}>
            발표하기
          </OrbitButton>
        </div>
      </header>

      <div className="editor-mockup-toolbar">
        <div className="editor-mockup-toolbar-history" aria-label="편집 기록">
          <button aria-label="실행 취소" type="button"><IconArrowBackUp size={19} /></button>
          <button aria-label="다시 실행" disabled type="button"><IconArrowForwardUp size={19} /></button>
          <span />
        </div>
        <div className="editor-mockup-toolset" aria-label="편집 도구">
          {editorTools.map((tool) => (
            <button
              aria-pressed={activeTool === tool.id}
              key={tool.id}
              onClick={() => {
                setActiveTool(tool.id);
                setNotice(`${tool.label} 도구를 선택했습니다.`);
              }}
              type="button"
            >
              {tool.icon}<span>{tool.label}</span>
            </button>
          ))}
        </div>
        <div className="editor-mockup-toolbar-document-actions">
          <span />
          <button type="button">배경</button>
          <button type="button">레이아웃</button>
          <button className="editor-mockup-theme-button" onClick={() => setActivePanel("design")} type="button">
            <IconPalette size={18} /> 테마 <IconChevronDown size={15} />
          </button>
        </div>
      </div>

      <main className="editor-mockup-workspace">
        <aside className="editor-mockup-slides" aria-label="슬라이드 목록">
          <div className="editor-mockup-slides-heading">
            <strong>슬라이드</strong><span>{slides.length}</span>
          </div>
          <div className="editor-mockup-slide-list">
            {slides.map((slide, index) => (
              <button
                aria-current={slide.id === selectedSlide.id ? "true" : undefined}
                key={slide.id}
                onClick={() => setSelectedSlideId(slide.id)}
                type="button"
              >
                <span className="editor-mockup-slide-number">{index + 1}</span>
                <SlideMiniature slide={slide} />
              </button>
            ))}
          </div>
          <button className="editor-mockup-add-slide" onClick={addSlide} type="button">
            <IconPlus size={18} /> 슬라이드 추가
          </button>
        </aside>

        <section className="editor-mockup-stage" aria-label="슬라이드 편집 캔버스">
          <div className="editor-mockup-canvas-wrap" style={{ width: `${zoom}%` }}>
            <SlideCanvas activeTool={activeTool} slide={selectedSlide} />
          </div>
          <div className="editor-mockup-canvas-footer">
            <span>{selectedIndex + 1} / {slides.length}</span>
            <div>
              <button aria-label="축소" onClick={() => setZoom((value) => Math.max(54, value - 8))} type="button">
                <IconZoomOut size={18} />
              </button>
              <span>{zoom}%</span>
              <button aria-label="확대" onClick={() => setZoom((value) => Math.min(100, value + 8))} type="button">
                <IconZoomIn size={18} />
              </button>
            </div>
          </div>
        </section>

        <aside className="editor-mockup-inspector">
          <div className="editor-mockup-panel-tabs" role="tablist" aria-label="편집 패널">
            <PanelTab activePanel={activePanel} icon={<IconSparkles size={18} />} id="ai" label="AI 코치" onSelect={setActivePanel} />
            <PanelTab activePanel={activePanel} icon={<IconPalette size={18} />} id="design" label="디자인" onSelect={setActivePanel} />
            <PanelTab activePanel={activePanel} icon={<IconNotes size={18} />} id="notes" label="메모" onSelect={setActivePanel} />
          </div>
          <div className="editor-mockup-panel-body">
            {activePanel === "ai" ? (
              <AiCoachPanel applied={appliedSuggestion} onApply={applySuggestion} />
            ) : null}
            {activePanel === "design" ? <DesignPanel onNotice={setNotice} /> : null}
            {activePanel === "notes" ? <NotesPanel onNotice={setNotice} /> : null}
          </div>
        </aside>
      </main>

      <div className="editor-mockup-toast" role="status">
        <IconCheck size={16} /> {notice}
      </div>

      {shareOpen ? (
        <EditorShareDialog
          onClose={() => setShareOpen(false)}
          onNotice={setNotice}
        />
      ) : null}

    </div>
  );
}

function EditorShareDialog(props: { onClose: () => void; onNotice: (notice: string) => void }) {
  const [activePanel, setActivePanel] = useState<SharePanel>("members");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<ShareRole, "owner">>("viewer");
  const [linkRole, setLinkRole] = useState<Exclude<ShareRole, "owner">>("viewer");
  const [members, setMembers] = useState(initialShareMembers);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("success");
  const [requests, setRequests] = useState(initialShareRequests);

  function inviteMember() {
    const normalizedEmail = email.trim().toLocaleLowerCase();
    if (!normalizedEmail.includes("@")) {
      setMessageKind("error");
      setMessage("초대할 사용자의 이메일을 확인해 주세요.");
      return;
    }
    if (members.some((member) => member.email === normalizedEmail)) {
      setMessageKind("error");
      setMessage("이미 이 프로젝트에 참여 중인 사용자예요.");
      return;
    }
    const name = normalizedEmail.split("@")[0]?.split(/[._-]/)[0] || "새 사용자";
    setMembers((current) => [
      ...current,
      { email: normalizedEmail, id: `invite-${normalizedEmail}`, name, role: inviteRole }
    ]);
    setEmail("");
    setMessageKind("success");
    setMessage(`${normalizedEmail}님에게 초대를 보냈어요.`);
    props.onNotice("프로젝트 초대를 보냈습니다.");
  }

  function updateMemberRole(id: string, role: ShareRole) {
    setMembers((current) => current.map((member) => member.id === id ? { ...member, role } : member));
    setMessageKind("success");
    setMessage("사용자 권한을 변경했어요.");
  }

  function removeMember(id: string) {
    setMembers((current) => current.filter((member) => member.id !== id));
    setMessageKind("success");
    setMessage("프로젝트 접근 권한을 회수했어요.");
  }

  function resolveRequest(request: ShareRequest, accepted: boolean) {
    setRequests((current) => current.filter((item) => item.id !== request.id));
    if (accepted) {
      setMembers((current) => [
        ...current,
        { email: request.email, id: `accepted-${request.id}`, name: request.name, role: request.role }
      ]);
    }
    setMessageKind("success");
    setMessage(accepted ? `${request.name}님의 요청을 승인했어요.` : `${request.name}님의 요청을 거절했어요.`);
  }

  function copyShareLink() {
    setMessageKind("success");
    setMessage(`${linkRole === "editor" ? "편집" : "보기"} 권한 링크를 복사했어요.`);
    props.onNotice("프로젝트 공유 링크를 복사했습니다.");
  }

  return (
    <div className="editor-share-backdrop" onMouseDown={props.onClose} role="presentation">
      <section
        aria-label="프로젝트 공유"
        aria-modal="true"
        className="editor-share-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="editor-share-header">
          <div className="editor-share-heading">
            <span><IconShare size={20} /></span>
            <div><h2>프로젝트 공유</h2><p>사람을 초대하고 프로젝트 접근 권한을 관리하세요.</p></div>
          </div>
          <button aria-label="공유 닫기" onClick={props.onClose} type="button"><IconX size={19} /></button>
        </header>

        <section className="editor-share-project">
          <span className="editor-share-project-icon"><IconUsers size={20} /></span>
          <div><span>현재 프로젝트</span><strong>2026 하반기 제품 전략</strong></div>
          <small>소유자 · 김지윤</small>
        </section>

        <div aria-label="공유 설정" className="editor-share-tabs" role="tablist">
          <button aria-selected={activePanel === "members"} onClick={() => setActivePanel("members")} role="tab" type="button">함께 작업 중 <span>{members.length}</span></button>
          <button aria-selected={activePanel === "requests"} onClick={() => setActivePanel("requests")} role="tab" type="button">승인 요청 <span>{requests.length}</span></button>
        </div>

        {activePanel === "members" ? (
          <div className="editor-share-panel">
            <section className="editor-share-invite">
              <div><IconUserPlus size={18} /><span><strong>사람 초대</strong><small>이메일로 프로젝트에 초대합니다.</small></span></div>
              <div className="editor-share-invite-row">
                <label><IconMail size={17} /><input aria-label="초대 이메일" onChange={(event) => setEmail(event.currentTarget.value)} placeholder="name@company.com" type="email" value={email} /></label>
                <select aria-label="초대 권한" onChange={(event) => setInviteRole(event.currentTarget.value as Exclude<ShareRole, "owner">)} value={inviteRole}>
                  <option value="viewer">보기 가능</option>
                  <option value="editor">편집 가능</option>
                </select>
                <button onClick={inviteMember} type="button">초대</button>
              </div>
            </section>

            <section className="editor-share-members" aria-label="프로젝트 참여자">
              <header><strong>프로젝트 참여자</strong><span>{members.length}명</span></header>
              {members.map((member) => (
                <div className="editor-share-member" key={member.id}>
                  <span className="editor-share-avatar">{member.name.slice(0, 1).toUpperCase()}</span>
                  <div><strong>{member.name}{member.role === "owner" ? <small>나</small> : null}</strong><span>{member.email}</span></div>
                  {member.role === "owner" ? <span className="editor-share-owner">소유자</span> : (
                    <select aria-label={`${member.name} 권한`} onChange={(event) => updateMemberRole(member.id, event.currentTarget.value as ShareRole)} value={member.role}>
                      <option value="viewer">보기 가능</option>
                      <option value="editor">편집 가능</option>
                    </select>
                  )}
                  {member.role === "owner" ? <span /> : <button aria-label={`${member.name} 권한 회수`} onClick={() => removeMember(member.id)} type="button"><IconTrash size={17} /></button>}
                </div>
              ))}
            </section>
          </div>
        ) : (
          <div className="editor-share-panel editor-share-request-panel">
            <div className="editor-share-request-heading"><div><strong>승인 대기 중인 요청</strong><small>프로젝트 접근을 요청한 사용자를 확인하세요.</small></div><span>{requests.length}건</span></div>
            {requests.length ? requests.map((request) => (
              <article className="editor-share-request" key={request.id}>
                <span className="editor-share-avatar">{request.name.slice(0, 1)}</span>
                <div><strong>{request.name}</strong><span>{request.email}</span><small>{request.role === "editor" ? "편집 권한" : "보기 권한"} 요청</small></div>
                <div><button onClick={() => resolveRequest(request, false)} type="button">거절</button><button onClick={() => resolveRequest(request, true)} type="button"><IconCheck size={16} />승인</button></div>
              </article>
            )) : <div className="editor-share-empty"><IconCheck size={22} /><strong>대기 중인 요청이 없어요.</strong><span>새 요청이 오면 이곳에 표시됩니다.</span></div>}
          </div>
        )}

        <section className="editor-share-link">
          <div><IconLink size={18} /><span><strong>공유 링크</strong><small>링크를 받은 사용자의 기본 권한을 선택하세요.</small></span></div>
          <div className="editor-share-link-row"><span>orbit.app/project/2026-strategy</span><select aria-label="링크 권한" onChange={(event) => setLinkRole(event.currentTarget.value as Exclude<ShareRole, "owner">)} value={linkRole}><option value="viewer">보기 가능</option><option value="editor">편집 가능</option></select><button onClick={copyShareLink} type="button"><IconCopy size={16} />복사</button></div>
        </section>

        {message ? <p className={`editor-share-message ${messageKind}`} role="status"><IconCheck size={16} />{message}</p> : null}
        <footer><IconLink size={15} /><span>공유 설정은 프로젝트 소유자만 변경할 수 있습니다.</span></footer>
      </section>
    </div>
  );
}

function PanelTab(props: {
  activePanel: EditorPanel;
  icon: ReactNode;
  id: EditorPanel;
  label: string;
  onSelect: (panel: EditorPanel) => void;
}) {
  return (
    <button
      aria-selected={props.activePanel === props.id}
      onClick={() => props.onSelect(props.id)}
      role="tab"
      type="button"
    >
      {props.icon}<span>{props.label}</span>
    </button>
  );
}

function SlideMiniature(props: { slide: MockSlide }) {
  return (
    <span className={`editor-mockup-miniature editor-mockup-slide-${props.slide.theme}`}>
      <small>{props.slide.eyebrow}</small>
      <strong>{props.slide.title.replace("\n", " ")}</strong>
      <i />
    </span>
  );
}

function SlideCanvas(props: { activeTool: EditorTool; slide: MockSlide }) {
  return (
    <article className={`editor-mockup-canvas editor-mockup-slide-${props.slide.theme}`}>
      <span className="editor-mockup-canvas-index">ORBIT / {String(props.slide.id).padStart(2, "0")}</span>
      <div className="editor-mockup-canvas-copy">
        <small>{props.slide.eyebrow}</small>
        <h1>{props.slide.title}</h1>
        <p>{props.slide.subtitle}</p>
      </div>
      <div className="editor-mockup-metrics">
        <span><small>시장 확장</small><strong>+15%</strong></span>
        <span><small>ARR 성장</small><strong>+30%</strong></span>
        <span><small>신제품 출시</small><strong>2</strong></span>
      </div>
      {props.activeTool !== "select" ? (
        <span className="editor-mockup-tool-cursor">{editorTools.find((tool) => tool.id === props.activeTool)?.label} 추가</span>
      ) : null}
    </article>
  );
}

function AiCoachPanel(props: { applied: boolean; onApply: () => void }) {
  return (
    <>
      <div className="editor-mockup-panel-heading">
        <span><IconSparkles size={18} /></span>
        <div><strong>슬라이드 완성도</strong><small>메시지와 발표 흐름을 함께 점검해요.</small></div>
        <b>86</b>
      </div>
      <div className="editor-mockup-score-bar"><i /></div>
      <section className="editor-mockup-suggestion-card">
        <span><IconWand size={18} /> 메시지 제안</span>
        <h2>제목을 결과 중심으로 바꿔보세요.</h2>
        <p>현재 제목보다 핵심 성과와 방향이 먼저 드러나면 청중이 흐름을 빠르게 이해할 수 있어요.</p>
        <div className="editor-mockup-suggestion-preview">“성장을 가속하는 세 가지 전략”</div>
        <button disabled={props.applied} onClick={props.onApply} type="button">
          {props.applied ? <><IconCheck size={17} /> 적용됨</> : <><IconSparkles size={17} /> 제안 적용</>}
        </button>
      </section>
      <section className="editor-mockup-panel-list">
        <button type="button"><IconMessage size={18} /><span><strong>문장 다듬기</strong><small>더 짧고 명확하게</small></span><IconChevronDown size={16} /></button>
        <button type="button"><IconLayoutGrid size={18} /><span><strong>레이아웃 추천</strong><small>핵심 수치 강조</small></span><IconChevronDown size={16} /></button>
      </section>
    </>
  );
}

function DesignPanel(props: { onNotice: (notice: string) => void }) {
  const [theme, setTheme] = useState("lilac");
  return (
    <>
      <div className="editor-mockup-panel-heading simple">
        <span><IconPalette size={18} /></span>
        <div><strong>디자인</strong><small>현재 슬라이드의 스타일을 조정해요.</small></div>
      </div>
      <section className="editor-mockup-design-section">
        <h2>색상 테마</h2>
        <div className="editor-mockup-theme-grid">
          {["lilac", "lime", "cream", "navy"].map((item) => (
            <button
              aria-label={`${item} 테마`}
              aria-pressed={theme === item}
              className={`editor-mockup-theme-${item}`}
              key={item}
              onClick={() => {
                setTheme(item);
                props.onNotice("색상 테마 미리보기를 변경했습니다.");
              }}
              type="button"
            />
          ))}
        </div>
      </section>
      <section className="editor-mockup-design-section">
        <h2>빠른 작업</h2>
        <button className="editor-mockup-panel-action" onClick={() => props.onNotice("레이아웃을 복제했습니다.")} type="button"><IconCopy size={17} /> 레이아웃 복제</button>
        <button className="editor-mockup-panel-action danger" onClick={() => props.onNotice("삭제 전 확인이 필요합니다.")} type="button"><IconTrash size={17} /> 슬라이드 삭제</button>
      </section>
    </>
  );
}

function NotesPanel(props: { onNotice: (notice: string) => void }) {
  const [notes, setNotes] = useState("세 가지 전략의 우선순위를 설명한 뒤, 각 전략이 고객 가치와 어떻게 연결되는지 강조합니다.");
  return (
    <>
      <div className="editor-mockup-panel-heading simple">
        <span><IconNotes size={18} /></span>
        <div><strong>발표 메모</strong><small>발표자에게만 보이는 스크립트예요.</small></div>
      </div>
      <label className="editor-mockup-notes-field">
        <span>이 슬라이드에서 말할 내용</span>
        <textarea onChange={(event) => setNotes(event.target.value)} value={notes} />
      </label>
      <button className="editor-mockup-panel-save" onClick={() => props.onNotice("발표 메모를 저장했습니다.")} type="button">메모 저장</button>
    </>
  );
}
