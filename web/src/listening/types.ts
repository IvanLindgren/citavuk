export interface AudioCue {
  text: string;
  start?: number | null;
  end?: number | null;
  speaker?: string;
  words?: Array<{ text: string; start: number; end: number }>;
}

export interface AudioLesson {
  id: string;
  title: string;
  subtitle: string;
  audio_url?: string | null;
  cues: AudioCue[];
  transcript_url?: string | null;
  duration?: number;
  kind?: 'podcast' | 'audiobook' | 'radio' | 'tts';
  category?: string;
  cefr?: string;
  source_title?: string;
  source_url?: string;
  external_url?: string;
}
