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

## 리포트 표시와 구간 재생

- 리포트는 `quiet`와 `loud` 문제 구간의 개수, 녹음 내 위치, 시작 시각과 지속 시간만 보여준다.
- 문구는 `이 리허설의 전체 발화보다 작게/크게 말한 구간`처럼 상대 평가임을 명시한다.
- dBFS, RMS, `averageDbfs`, `baselineDbfs`, `variationDb` 수치는 사용자 UI에 노출하지 않는다.
- 측정 성공·문제 없음, 일반 `unmeasured`, `LEGACY_REPORT`를 서로 다른 상태로 안내한다.
- 원본 음성은 업로드 완료 시점부터 14일 보관한다. 분석 실패와 Job enqueue 실패는 즉시 삭제를 요청한다.
- 프로젝트 read 권한이 있는 사용자가 문제 구간을 요청할 때만 최대 15분 signed URL을 발급한다. URL은 보관 만료 시각을 넘지 않는다.
- Web은 하나의 `Audio` 인스턴스로 `startSeconds`부터 `endSeconds`까지만 재생한다. 원본 전체 다운로드 버튼이나 별도 문제 Clip은 만들지 않는다.
- signed URL, 원본 bytes, waveform, 파일명은 DB·리포트·로그에 저장하지 않는다.

## 제외 범위

- 절대적인 적정 음량 판정
- 발화 속도·강세·pitch·떨림 분석
- PracticeGoal 생성
- 문제 구간 오디오 Clip 생성과 원본 전체 다운로드
