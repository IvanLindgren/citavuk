export interface AudioCue {
  text: string;
  start?: number | null;
  end?: number | null;
}

export interface AudioLesson {
  id: string;
  title: string;
  subtitle: string;
  audio_url?: string | null;
  cues: AudioCue[];
  transcript_url?: string | null;
  duration?: number;
}
