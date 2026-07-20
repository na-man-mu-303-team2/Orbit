export const rehearsalMicrophoneAudioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export const rehearsalRawMicrophoneAudioConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

const liveSttRawMicDebugStorageKey = "orbit.liveStt.debugRawMic";
const microphoneDeviceStorageKey = "orbit.rehearsal.microphoneDeviceId";

export function requestRehearsalMicrophoneStream(
  mediaDevices: Pick<MediaDevices, "getUserMedia"> = navigator.mediaDevices,
) {
  const deviceId = readRehearsalMicrophoneDeviceId();
  return mediaDevices.getUserMedia({
    audio: {
      ...getRehearsalMicrophoneAudioConstraints(),
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    },
  });
}

export function readRehearsalMicrophoneDeviceId(
  storage: Pick<Storage, "getItem"> | null = readBrowserLocalStorage(),
) {
  try {
    return storage?.getItem(microphoneDeviceStorageKey) ?? "";
  } catch {
    return "";
  }
}

export function writeRehearsalMicrophoneDeviceId(
  deviceId: string,
  storage: Pick<Storage, "setItem"> | null = readBrowserLocalStorage(),
) {
  try {
    if (deviceId) storage?.setItem(microphoneDeviceStorageKey, deviceId);
  } catch {
    // Browsers can block storage while still allowing microphone access.
  }
}

export function getRehearsalMicrophoneAudioConstraints(
  storage: Pick<Storage, "getItem"> | null = readBrowserLocalStorage(),
) {
  return isLiveSttRawMicDebugEnabled(storage)
    ? rehearsalRawMicrophoneAudioConstraints
    : rehearsalMicrophoneAudioConstraints;
}

export function isLiveSttRawMicDebugEnabled(
  storage: Pick<Storage, "getItem"> | null = readBrowserLocalStorage(),
) {
  try {
    return storage?.getItem(liveSttRawMicDebugStorageKey) === "1";
  } catch {
    return false;
  }
}

function readBrowserLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
