/** Ambient declarations for the Samsung TV build. */

declare const __APP_VERSION__: string;

interface TizenTvInputDevice {
  registerKeyBatch(keys: string[], onSuccess?: () => void, onError?: (e: unknown) => void): void;
}

interface TizenApplication {
  exit(): void;
}

interface Tizen {
  tvinputdevice?: TizenTvInputDevice;
  application?: { getCurrentApplication(): TizenApplication };
}

interface SamsungAvplayListener {
  onbufferingstart?(): void;
  onbufferingprogress?(percent: number): void;
  onbufferingcomplete?(): void;
  oncurrentplaytime?(ms: number): void;
  onstreamcompleted?(): void;
  onevent?(type: string, data: string): void;
  onerror?(type: unknown): void;
}

interface SamsungAvplay {
  open(url: string): void;
  close(): void;
  prepareAsync(onSuccess: () => void, onError: (e: unknown) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(ms: number, onSuccess?: () => void, onError?: (e: unknown) => void): void;
  getState(): string;
  getDuration(): number;
  getCurrentTime(): number;
  setDisplayRect(x: number, y: number, w: number, h: number): void;
  setDisplayMethod(method: string): void;
  setListener(listener: SamsungAvplayListener): void;
  suspend(): void;
  restore(): void;
}

interface SamsungWebApis {
  avplay?: SamsungAvplay;
  appcommon?: {
    setScreenSaver(state: number, onSuccess?: () => void, onError?: (e: unknown) => void): void;
    AppCommonScreenSaverState?: { SCREEN_SAVER_OFF: number; SCREEN_SAVER_ON: number };
  };
}

interface Window {
  tizen?: Tizen;
  webapis?: SamsungWebApis;
}
