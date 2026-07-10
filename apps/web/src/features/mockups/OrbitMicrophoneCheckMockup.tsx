import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconInfoCircle,
  IconLock,
  IconMicrophone,
  IconMicrophoneOff,
  IconRefresh,
  IconSettings,
  IconShieldCheck,
  IconVolume
} from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import orbitLogo from "./assets/orbit-logo-selected.png";
import { OrbitButton, OrbitStatus } from "../../design-system";
import "./orbit-microphone-check-mockup.css";

type MicrophoneCheckMockupProps = {
  onNavigate: (path: string) => void;
};

type PermissionState = "idle" | "checking" | "ready" | "blocked";

const inputDevices = [
  "MacBook Pro 마이크",
  "Studio Display 마이크",
  "AirPods Pro 마이크"
];

export function OrbitMicrophoneCheckMockup(props: MicrophoneCheckMockupProps) {
  const [permission, setPermission] = useState<PermissionState>("idle");
  const [device, setDevice] = useState(inputDevices[0]);
  const [isTesting, setIsTesting] = useState(false);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (permission !== "checking") return undefined;
    const timeout = window.setTimeout(() => {
      setPermission("ready");
      setLevel(72);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [permission]);

  useEffect(() => {
    if (!isTesting) return undefined;
    setLevel(38);
    const interval = window.setInterval(() => {
      setLevel((value) => (value >= 82 ? 46 : value + 9));
    }, 260);
    return () => window.clearInterval(interval);
  }, [isTesting]);

  function requestPermission() {
    setPermission("checking");
    setIsTesting(false);
    setLevel(0);
  }

  function showBlockedState() {
    setPermission("blocked");
    setIsTesting(false);
    setLevel(0);
  }

  const isReady = permission === "ready";
  const isBlocked = permission === "blocked";

  return (
    <div className="orbit-microphone-check-mockup">
      <header className="microphone-check-header">
        <div>
          <button aria-label="에디터로 돌아가기" onClick={() => props.onNavigate("/mockup/editor")} type="button">
            <IconArrowLeft size={20} />
          </button>
          <img alt="ORBIT" src={orbitLogo} />
          <span />
          <strong>마이크 확인</strong>
        </div>
        <div>
          <span>2026 하반기 제품 전략</span>
          <OrbitStatus tone="lilac">리허설 준비</OrbitStatus>
        </div>
      </header>

      <main className="microphone-check-main">
        <header className="microphone-check-intro">
          <p className="orbit-ds-eyebrow">PRE-REHEARSAL CHECK</p>
          <h1>내 목소리가 잘 들리는지 확인해요.</h1>
          <p>리허설을 시작하기 전에 마이크 권한과 입력 음량을 한 번만 점검할게요.</p>
        </header>

        <div className="microphone-check-layout">
          <section className={`microphone-check-primary ${isBlocked ? "blocked" : isReady ? "ready" : ""}`}>
            <div className="microphone-check-hero-icon">
              {isBlocked ? <IconMicrophoneOff size={42} /> : <IconMicrophone size={42} />}
            </div>

            {isBlocked ? (
              <>
                <OrbitStatus tone="warning">권한이 차단됐어요</OrbitStatus>
                <h2>브라우저에서 마이크를 허용해 주세요.</h2>
                <p className="microphone-check-description">ORBIT이 음성을 분석하려면 현재 사이트의 마이크 권한이 필요합니다.</p>
                <ol className="microphone-permission-steps">
                  <li><span>1</span><div><strong>주소 표시줄의 권한 아이콘 열기</strong><small>마이크 항목을 찾아 허용으로 변경하세요.</small></div></li>
                  <li><span>2</span><div><strong>이 페이지로 돌아와 다시 확인하기</strong><small>설정이 반영되면 입력 장치와 음량을 확인합니다.</small></div></li>
                </ol>
                <div className="microphone-check-actions">
                  <OrbitButton icon={<IconRefresh size={18} />} onClick={requestPermission}>다시 확인하기</OrbitButton>
                  <button onClick={() => props.onNavigate("/mockup/editor")} type="button">에디터로 돌아가기</button>
                </div>
              </>
            ) : isReady ? (
              <>
                <OrbitStatus tone="success">마이크 연결됨</OrbitStatus>
                <h2>좋아요, 목소리가 선명하게 들려요.</h2>
                <p className="microphone-check-description">평소 발표하듯 한 문장을 말해보고 입력 수준을 확인하세요.</p>

                <div className="microphone-device-field">
                  <label htmlFor="microphone-device">입력 장치</label>
                  <div>
                    <IconMicrophone size={18} />
                    <select id="microphone-device" onChange={(event) => setDevice(event.currentTarget.value)} value={device}>
                      {inputDevices.map((inputDevice) => <option key={inputDevice}>{inputDevice}</option>)}
                    </select>
                    <IconChevronDown size={17} />
                  </div>
                </div>

                <section className="microphone-level-card" aria-label="마이크 입력 테스트">
                  <div>
                    <span><IconVolume size={18} /> 입력 수준</span>
                    <strong>{isTesting ? "말하는 중" : "충분함"}</strong>
                  </div>
                  <progress aria-label="마이크 입력 수준" max="100" value={level} />
                  <p>“안녕하세요, 지금부터 발표를 시작하겠습니다.”</p>
                </section>

                <div className="microphone-check-actions ready-actions">
                  <button aria-pressed={isTesting} onClick={() => setIsTesting((value) => !value)} type="button">
                    {isTesting ? <IconCheck size={18} /> : <IconMicrophone size={18} />}
                    {isTesting ? "테스트 완료" : "다시 테스트"}
                  </button>
                  <OrbitButton onClick={() => props.onNavigate("/mockup/rehearsal")}>리허설로 이동</OrbitButton>
                </div>
              </>
            ) : (
              <>
                <OrbitStatus tone="neutral">마이크 권한 필요</OrbitStatus>
                <h2>먼저 마이크 사용을 허용해 주세요.</h2>
                <p className="microphone-check-description">발표 음성은 리허설 피드백에만 사용되며, 이 목업에서는 실제로 녹음하거나 전송하지 않습니다.</p>
                <div className="microphone-permission-note">
                  <IconShieldCheck size={22} />
                  <div><strong>음성 데이터는 안전하게 다뤄져요.</strong><small>마이크는 리허설 중에만 활성화되고 언제든 끌 수 있습니다.</small></div>
                </div>
                <div className="microphone-check-actions">
                  <OrbitButton disabled={permission === "checking"} icon={<IconMicrophone size={18} />} onClick={requestPermission}>
                    {permission === "checking" ? "권한 확인 중..." : "마이크 권한 허용하기"}
                  </OrbitButton>
                  <button onClick={showBlockedState} type="button">권한 문제 해결 화면 보기</button>
                </div>
              </>
            )}
          </section>

          <aside className="microphone-check-summary">
            <header><span><IconSettings size={20} /></span><div><strong>준비 체크</strong><small>리허설 전 필수 항목</small></div></header>
            <ul>
              <CheckItem
                active={isReady}
                icon={<IconLock size={19} />}
                label="마이크 권한"
                value={isBlocked ? "차단됨" : isReady ? "허용됨" : "확인 전"}
              />
              <CheckItem active={isReady} icon={<IconMicrophone size={19} />} label="입력 장치" value={isReady ? device : "확인 전"} />
              <CheckItem active={isReady && level >= 30} icon={<IconVolume size={19} />} label="입력 음량" value={isReady ? "적절함" : "확인 전"} />
            </ul>
            <div className="microphone-check-tip">
              <IconInfoCircle size={19} />
              <p><strong>조용한 공간이 가장 좋아요.</strong><br />마이크와 20–30cm 거리를 두면 목소리가 더 선명하게 인식됩니다.</p>
            </div>
            <div className="microphone-check-next">
              <span>다음 단계</span>
              <strong>AI 리허설 코치와 연습 시작</strong>
              <small>말하기 속도 · 핵심 키워드 · 발표 흐름을 확인해요.</small>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function CheckItem(props: { active: boolean; icon: ReactNode; label: string; value: string }) {
  return (
    <li className={props.active ? "active" : ""}>
      <span>{props.active ? <IconCircleCheck size={20} /> : props.icon}</span>
      <div><strong>{props.label}</strong><small>{props.value}</small></div>
    </li>
  );
}
