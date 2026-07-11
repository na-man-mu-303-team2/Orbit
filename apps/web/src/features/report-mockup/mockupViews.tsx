/* 대시보드 · 문서 · 리허설 기록 · 일정 목업 뷰 (전부 정적) */

export function DashboardView({
  onOpenAnalysis
}: {
  onOpenAnalysis: () => void;
}) {
  return (
    <>
      <section className="rm-hero">
        <div>
          <h1>안녕하세요, YB님</h1>
          <div className="rm-hero-chips">
            <button type="button" className="rm-chip active">
              발표까지 D-7
            </button>
            <button type="button" className="rm-chip">
              이번 주 4회 연습
            </button>
          </div>
        </div>
        <div className="rm-page-actions">
          <button type="button" className="rm-button">
            + 새 프로젝트
          </button>
          <button type="button" className="rm-button dark">
            ▶ 리허설 시작
          </button>
        </div>
      </section>

      <div className="rm-grid">
        <article className="rm-card rm-next-card">
          <header className="rm-card-head">
            <h2>다음 발표</h2>
            <span className="rm-pill warn">D-7</span>
          </header>
          <div className="rm-person">
            <span className="rm-avatar large purple">피치</span>
            <span>
              <strong>신규 서비스 피치덱</strong>
              <small>7월 18일 (토) 14:00 · 목표 5분</small>
            </span>
          </div>
          <div className="rm-progress-wrap">
            <div className="rm-progress-row">
              <small>준비도</small>
              <strong>78%</strong>
            </div>
            <span className="rm-session-bar">
              <i style={{ width: "78%" }} />
            </span>
          </div>
          <button
            type="button"
            className="rm-button dark block"
            onClick={onOpenAnalysis}
          >
            최근 리포트 보기 →
          </button>
        </article>

        <article className="rm-card">
          <header className="rm-card-head">
            <h2>이번 주 연습</h2>
            <span className="rm-pill soft">4회 · 52분</span>
          </header>
          <div className="rm-week-dots">
            {["월", "화", "수", "목", "금", "토", "일"].map((day, index) => (
              <div key={day} className="rm-week-dot-col">
                <span
                  className={
                    [1, 2, 4, 5].includes(index)
                      ? "rm-week-dot done"
                      : index === 5
                        ? "rm-week-dot today"
                        : "rm-week-dot"
                  }
                >
                  {[1, 2, 4, 5].includes(index) ? "✓" : ""}
                </span>
                <small>{day}</small>
              </div>
            ))}
          </div>
          <p className="rm-coach-note">
            <strong>3일 연속 연습 중</strong> — 내일도 이어가면 최장 기록이에요.
          </p>
        </article>

        <article className="rm-card">
          <header className="rm-card-head">
            <h2>최근 점수</h2>
            <span className="rm-delta">+8점</span>
          </header>
          <div className="rm-score-hero">
            <strong>86</strong>
            <small>4차 리허설 · A-</small>
          </div>
          <div className="rm-growth-bars short">
            {[54, 66, 78, 86].map((value, index) => (
              <span
                key={index}
                className={index === 3 ? "rm-growth-bar last" : "rm-growth-bar"}
                style={{ height: `${value}%` }}
              />
            ))}
          </div>
        </article>
      </div>

      <div className="rm-two-grid wide-left">
        <article className="rm-card">
          <header className="rm-card-head">
            <h2>내 프로젝트</h2>
            <button type="button" className="rm-chip">
              전체 보기
            </button>
          </header>
          <ul className="rm-project-list">
            {[
              { name: "신규 서비스 피치덱", meta: "12장 · 4회 연습", score: "86", tone: "purple", state: "D-7" },
              { name: "월간 전사 공유회", meta: "8장 · 1회 연습", score: "62", tone: "teal", state: "준비 중" },
              { name: "투자사 IR 덱", meta: "20장 · 연습 전", score: "—", tone: "ink", state: "초안" }
            ].map((project) => (
              <li key={project.name}>
                <span className={`rm-avatar large ${project.tone}`}>
                  {project.name.slice(0, 2)}
                </span>
                <span className="rm-project-body">
                  <strong>{project.name}</strong>
                  <small>{project.meta}</small>
                </span>
                <span className="rm-pill soft">{project.state}</span>
                <span className="rm-project-score">{project.score}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rm-card">
          <header className="rm-card-head">
            <h2>최근 활동</h2>
          </header>
          <ul className="rm-activity">
            {[
              { time: "오늘 14:20", text: "4차 리허설 완료 — 점수 86 (+8)", icon: "🎙" },
              { time: "오늘 14:21", text: "리포트가 생성되었어요", icon: "▥" },
              { time: "어제 21:05", text: "슬라이드 4 대본 수정 반영", icon: "✍️" },
              { time: "어제 20:40", text: "3차 리허설 완료 — 점수 78", icon: "🎙" },
              { time: "7월 9일", text: "팀원 박OO이 피드백 2건 남김", icon: "💬" }
            ].map((activity) => (
              <li key={activity.time + activity.text}>
                <span className="rm-activity-icon">{activity.icon}</span>
                <span className="rm-activity-body">
                  <strong>{activity.text}</strong>
                  <small>{activity.time}</small>
                </span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </>
  );
}

export function DocsView() {
  const docs = [
    { icon: "📊", type: "피치덱", title: "신규 서비스 피치덱 v4", meta: "12장 · 오늘 수정", state: "최신", tone: "pass" },
    { icon: "📝", type: "대본", title: "피치덱 발표 대본", meta: "1,240자 · 오늘 수정", state: "수정 제안 2", tone: "warn" },
    { icon: "▥", type: "리포트", title: "4차 리허설 리포트", meta: "오늘 생성", state: "새 문서", tone: "fit" },
    { icon: "📊", type: "피치덱", title: "월간 전사 공유회", meta: "8장 · 7월 8일", state: "검토 필요", tone: "warn" },
    { icon: "📝", type: "대본", title: "공유회 오프닝 멘트", meta: "480자 · 7월 7일", state: "최신", tone: "pass" },
    { icon: "📊", type: "피치덱", title: "투자사 IR 덱 (초안)", meta: "20장 · 7월 2일", state: "초안", tone: "soft" }
  ] as const;

  return (
    <>
      <section className="rm-hero">
        <div>
          <h1>문서</h1>
          <div className="rm-hero-chips">
            <button type="button" className="rm-chip active">
              전체 6
            </button>
            <button type="button" className="rm-chip">
              피치덱 3
            </button>
            <button type="button" className="rm-chip">
              대본 2
            </button>
            <button type="button" className="rm-chip">
              리포트 1
            </button>
          </div>
        </div>
        <div className="rm-page-actions">
          <input type="search" className="rm-doc-search" placeholder="문서 검색…" />
          <button type="button" className="rm-button dark">
            + 새 문서
          </button>
        </div>
      </section>

      <div className="rm-doc-grid">
        {docs.map((doc) => (
          <article key={doc.title} className="rm-card rm-doc-card">
            <header>
              <span className="rm-doc-icon">{doc.icon}</span>
              <span className={`rm-pill ${doc.tone}`}>{doc.state}</span>
            </header>
            <small className="rm-overline">{doc.type}</small>
            <h3>{doc.title}</h3>
            <footer>
              <small>{doc.meta}</small>
              <button type="button" className="rm-round-button subtle small">
                ⋯
              </button>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}

export function HistoryView({
  onOpenAnalysis
}: {
  onOpenAnalysis: () => void;
}) {
  const runs = [
    { date: "7월 10일 14:20", project: "신규 서비스 피치덱", run: "4차", duration: "4분 46초", coverage: "92%", score: 86, best: true },
    { date: "7월 9일 21:05", project: "신규 서비스 피치덱", run: "3차", duration: "5분 12초", coverage: "84%", score: 78 },
    { date: "7월 9일 10:41", project: "신규 서비스 피치덱", run: "2차", duration: "6분 03초", coverage: "71%", score: 66 },
    { date: "7월 8일 18:30", project: "신규 서비스 피치덱", run: "1차", duration: "6분 40초", coverage: "58%", score: 54 },
    { date: "7월 8일 10:12", project: "월간 전사 공유회", run: "1차", duration: "8분 20초", coverage: "62%", score: 62 },
    { date: "7월 5일 16:44", project: "월간 전사 공유회", run: "드라이런", duration: "9분 02초", coverage: "44%", score: 41 }
  ] as const;

  return (
    <>
      <section className="rm-hero">
        <div>
          <h1>리허설 기록</h1>
          <div className="rm-hero-chips">
            <button type="button" className="rm-chip active">
              전체 프로젝트
            </button>
            <button type="button" className="rm-chip">
              최근 2주 ▾
            </button>
          </div>
        </div>
        <div className="rm-hero-stats">
          {[
            { value: "12", unit: "회", label: "총 리허설" },
            { value: "1:42", unit: "hr", label: "총 연습 시간" },
            { value: "92%", unit: "", label: "최고 커버율" }
          ].map((stat) => (
            <div key={stat.label} className="rm-hero-stat">
              <span className="rm-hero-stat-body">
                <span className="rm-hero-stat-value">
                  {stat.value}
                  <small>{stat.unit}</small>
                </span>
                <small>{stat.label}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <article className="rm-card">
        <table className="rm-table">
          <thead>
            <tr>
              <th>일시</th>
              <th>프로젝트</th>
              <th>회차</th>
              <th>발화 시간</th>
              <th>커버율</th>
              <th>점수</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.date + run.run}>
                <td>{run.date}</td>
                <td>
                  <strong>{run.project}</strong>
                </td>
                <td>
                  {run.run}
                  {"best" in run && run.best && (
                    <span className="rm-pill pass small-pill">BEST</span>
                  )}
                </td>
                <td>{run.duration}</td>
                <td>{run.coverage}</td>
                <td>
                  <span className="rm-score">{run.score}</span>
                </td>
                <td className="rm-cell-end">
                  <button
                    type="button"
                    className="rm-button"
                    onClick={onOpenAnalysis}
                  >
                    리포트 →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

export function ScheduleView() {
  const july1Offset = 3; // 2026년 7월 1일 = 수요일
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  const eventDays: Record<number, "practice" | "deadline" | "feedback"> = {
    8: "practice",
    9: "practice",
    10: "practice",
    14: "feedback",
    15: "practice",
    18: "deadline",
    21: "practice"
  };

  const upcoming = [
    { dday: "D-3", title: "팀 피드백 세션", meta: "7월 14일 (화) 16:00 · 김코치", tone: "fit" },
    { dday: "D-7", title: "최종 발표 — 신규 서비스 피치덱", meta: "7월 18일 (토) 14:00 · 본사 대회의실", tone: "warn" },
    { dday: "매일", title: "연습 리마인더", meta: "21:00 · 슬라이드 4 집중 연습", tone: "soft" }
  ] as const;

  return (
    <>
      <section className="rm-hero">
        <div>
          <h1>일정</h1>
          <div className="rm-hero-chips">
            <button type="button" className="rm-chip">
              ← 6월
            </button>
            <button type="button" className="rm-chip active">
              2026년 7월
            </button>
            <button type="button" className="rm-chip">
              8월 →
            </button>
          </div>
        </div>
        <div className="rm-page-actions">
          <button type="button" className="rm-button dark">
            + 일정 추가
          </button>
        </div>
      </section>

      <div className="rm-two-grid wide-left">
        <article className="rm-card">
          <div className="rm-cal-head">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
              <small key={day}>{day}</small>
            ))}
          </div>
          <div className="rm-cal-grid">
            {Array.from({ length: july1Offset }, (_, index) => (
              <span key={`blank_${index}`} className="rm-cal-cell blank" />
            ))}
            {days.map((day) => {
              const event = eventDays[day];
              return (
                <span
                  key={day}
                  className={`rm-cal-cell${day === 11 ? " today" : ""}`}
                >
                  {day}
                  {event && <i className={`rm-cal-dot ${event}`} />}
                </span>
              );
            })}
          </div>
          <div className="rm-legend-inline rm-cal-legend">
            <i className="ok" /> 연습 <i className="adlib" /> 피드백{" "}
            <i className="miss" /> 발표
          </div>
        </article>

        <div className="rm-coach-side">
          <article className="rm-card">
            <header className="rm-card-head">
              <h2>다가오는 일정</h2>
            </header>
            <ul className="rm-upcoming">
              {upcoming.map((event) => (
                <li key={event.title}>
                  <span className={`rm-pill ${event.tone}`}>{event.dday}</span>
                  <span className="rm-upcoming-body">
                    <strong>{event.title}</strong>
                    <small>{event.meta}</small>
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className="rm-card dark rm-streak-card">
            <h2>연습 스트릭 🔥</h2>
            <p>
              <strong>3일 연속</strong> 연습 중 — 발표 전까지 매일 20분이면
              충분해요.
            </p>
            <button type="button" className="rm-button light block">
              오늘 연습 시작하기
            </button>
          </article>
        </div>
      </div>
    </>
  );
}
