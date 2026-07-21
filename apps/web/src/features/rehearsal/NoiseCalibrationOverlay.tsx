import { Mic } from "lucide-react";

import "./noise-calibration-overlay.css";

export function NoiseCalibrationOverlay() {
  return (
    <div className="rehearsal-noise-calibration-backdrop">
      <section
        aria-busy="true"
        aria-live="polite"
        aria-labelledby="rehearsal-noise-calibration-title"
        className="rehearsal-noise-calibration-card"
        role="status"
      >
        <span aria-hidden="true" className="rehearsal-noise-calibration-icon">
          <Mic size={28} strokeWidth={1.8} />
        </span>
        <div className="rehearsal-noise-calibration-copy">
          <span className="rehearsal-noise-calibration-eyebrow">
            음성 인식 준비
          </span>
          <h2 id="rehearsal-noise-calibration-title">
            주변 소음을 확인하고 있어요
          </h2>
          <p>정확한 음성 감지를 위해 잠시 말하지 말아 주세요.</p>
        </div>
        <div
          aria-label="주변 소음 측정 중"
          aria-valuetext="주변 소음을 측정하고 있습니다"
          className="rehearsal-noise-calibration-progress"
          role="progressbar"
        >
          <span aria-hidden="true" />
        </div>
        <p className="rehearsal-noise-calibration-hint">
          측정이 끝나면 이 안내가 자동으로 사라집니다.
        </p>
      </section>
    </div>
  );
}
