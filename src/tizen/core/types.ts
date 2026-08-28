export interface Cue {
  start: number;
  end: number;
  text: string;
}

export type DisplayMode = "original" | "translated" | "bilingual";

export interface SubtitleTrack {
  language: string;
  label: string;
  webVtt: string;
  defaultOn: boolean;
}

export interface LoadedProgram {
  programId: string;
  videoUrl: string | null;
  subtitles: SubtitleTrack[];
}
