export type PresentationRecordingSession = {
  stop: () => Promise<File>;
};

export function createPresentationRecordingSession(
  stream: MediaStream,
  recorderCtor: typeof MediaRecorder | undefined = globalThis.MediaRecorder,
): PresentationRecordingSession {
  if (!recorderCtor) {
    throw new Error("이 브라우저에서는 발표 녹음을 지원하지 않습니다.");
  }

  const mimeType = selectPresentationRecordingMimeType(recorderCtor);
  const recorder = new recorderCtor(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start(1000);

  return {
    stop() {
      return new Promise<File>((resolve, reject) => {
        const finish = () => {
          const type = recorder.mimeType || mimeType || "audio/webm";
          resolve(
            new File(chunks, `presentation-${Date.now()}.${fileExtension(type)}`, {
              type,
            }),
          );
        };
        if (recorder.state === "inactive") {
          finish();
          return;
        }
        recorder.addEventListener("stop", finish, { once: true });
        recorder.addEventListener("error", () => reject(new Error("발표 녹음을 저장하지 못했습니다.")), {
          once: true,
        });
        recorder.stop();
      });
    },
  };
}

export function selectPresentationRecordingMimeType(recorderCtor: typeof MediaRecorder) {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    recorderCtor.isTypeSupported(type),
  ) ?? "";
}

function fileExtension(mimeType: string) {
  return mimeType.includes("mp4") ? "m4a" : "webm";
}
