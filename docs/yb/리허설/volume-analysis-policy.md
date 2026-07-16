# 리허설 음량 분석 1차 정책

## 목적

리허설 녹음 안에서 사용자의 평소 발화보다 상대적으로 작거나 큰 구간을 찾는다. 마이크 종류와 거리에 따라 절대 dBFS가 달라지므로 전체 음량을 `적정·작음·큼`으로 평가하지 않는다.

## 입력과 처리 경계

- `/audio/transcribe`가 원본 음성을 한 번 읽고 PyAV로 한 번 디코딩한다. STT는 `AudioContent`, 음량과 침묵 분석은 같은 `DecodedAudio`를 사용한다.
- `/audio/transcribe-private`는 집중 연습과 Q&A를 위한 STT 전용 경로로 유지한다.
- PyAV가 mono float32 16kHz PCM으로 디코딩하고 librosa RMS와 NumPy 통계로 분석한다.
- 원본 bytes, waveform, 전체 프레임 RMS, signed URL은 저장하거나 로그에 남기지 않는다.

## 측정 정책

- RMS 설정: `frame_length=2048`, `hop_length=512`, `center=False`
- 활성 프레임: `max(-55dBFS, 전체 프레임 P95-35dB)` 이상
- 최소 활성 발화: 1초
- 평균 음량: 활성 프레임 RMS 평균을 dBFS로 변환
- 기준선: 활성 프레임 dBFS 중앙값
- 음량 편차: 활성 프레임 `P90-P10`
- 문제 후보: 기준선 대비 `-6dB` 미만은 `quiet`, `+6dB` 초과는 `loud`
- 구간 정책: 최소 1초, 같은 종류 300ms 이하 간격 병합, 시작 시간순 최대 100개

## 실패와 호환 정책

- 음량 분석 실패는 STT와 리포트 생성을 실패시키지 않는다.
- 측정 불가 reason code는 `AUDIO_DECODE_FAILED`, `NO_AUDIO_STREAM`, `EMPTY_AUDIO`, `INSUFFICIENT_ACTIVE_AUDIO`, `ANALYSIS_FAILED`로 제한한다.
- 과거 리포트는 `unmeasured/LEGACY_REPORT`로 읽는다.
- DB migration은 추가하지 않고 `rehearsal_runs.report_json.volumeAnalysis`에 저장한다.

## 제외 범위

- 절대적인 적정 음량 판정
- 발화 속도·강세·pitch·떨림 분석
- UI 표시와 PracticeGoal 생성
- 문제 구간 오디오 Clip 생성 및 재생
