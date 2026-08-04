import { API_BASE, getToken, request } from './client';

export type TeacherStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'suspended';

export interface TeacherApplication {
  userId?: string;
  serbianLevel?: string;
  nativeSpeaker?: boolean;
  russianLevel?: string;
  certificates?: string;
  teachingExperience?: string;
  socialLinks?: Array<{ label?: string; url: string }>;
  monetizationIntent?: 'free' | 'paid' | 'both';
  status: TeacherStatus;
  adminComment?: string;
  email?: string;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
}
export interface TeacherProfile { userId?:string; publicName:string; bio:string; organization:string; languages:string[]; formats:string[]; website:string; socialLinks:Array<{label?:string;url:string}>; avatarUrl:string }

export type TheoryBlock =
  | { id: string; type: 'paragraph' | 'heading' | 'quote'; text: string }
  | { id: string; type: 'image'; url: string; alt: string; caption?: string }
  | { id: string; type: 'video'; url: string; provider?: string; embedUrl?: string; title?: string }
  | { id: string; type: 'table'; rows: string[][] }
  | { id: string; type: 'list'; items: string[]; ordered?: boolean };

export interface LessonMatchPair {
  left: string;
  right: string;
}

export interface LessonReadingQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
}

export interface LessonExercise {
  id: string;
  type: 'multiple_choice' | 'ending_picker' | 'sentence_builder' | 'letter_unscramble' |
    'matching' | 'fill_blank' | 'image_description' | 'reading_qa' | 'form_hunt' |
    'explain_word' | 'teacher_letter';
  prompt: string;
  options?: string[];
  answer?: string;
  referenceAnswer?: string;
  hint?: string;
  context?: string;
  stem?: string;
  tokens?: string[];
  distractors?: string[];
  pairs?: LessonMatchPair[];
  acceptedAnswers?: string[];
  imageUrl?: string;
  readingText?: string;
  questions?: LessonReadingQuestion[];
  targetWords?: string[];
  criteria?: string;
}

export interface DialogueNode {
  id: string;
  speaker: string;
  avatar: 'teacher' | 'student' | 'woman' | 'man';
  text: string;
  choices?: Array<{ label: string; nextId: string }>;
}

export interface LessonContent {
  theory: TheoryBlock[];
  exercises: LessonExercise[];
  dialogue?: { startId: string; nodes: DialogueNode[] };
  /** Markdown is the editable source; theory remains a fallback for older clients. */
  markdown?: string;
  documentStyle?: {
    fontFamily: 'serif' | 'sans';
    fontSize: number;
    lineHeight: number;
  };
}

export interface Lesson {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  slug: string;
  shareToken?: string;
  title: string;
  summary: string;
  coverUrl?: string;
  level: string;
  lessonType: 'lexicon' | 'grammar' | 'speaking' | 'writing';
  topic: string;
  tags: string[];
  estimatedMinutes: number;
  script: 'latin' | 'cyrillic' | 'both';
  visibility: 'draft' | 'public' | 'unlisted';
  publishedRevisionId?: string;
  revisionId?: string;
  revisionStatus?: 'draft' | 'pending' | 'published' | 'rejected';
  content?: LessonContent;
  updatedAt: string;
}

export type LessonDraft = Pick<Lesson, 'title' | 'summary' | 'coverUrl' | 'level' | 'lessonType' | 'topic' | 'tags' | 'estimatedMinutes' | 'script'> & {
  content: LessonContent;
};

export const getTeacherApplication = () => request<TeacherApplication>('/v1/teachers/application');
export const submitTeacherApplication = (body: Omit<TeacherApplication, 'status'>) =>
  request<TeacherApplication>('/v1/teachers/application', { method: 'PUT', body });
export const getTeacherLessons = async () => (await request<{ items: Lesson[] }>('/v1/teachers/lessons')).items;
export const getTeacherProfile = () => request<Partial<TeacherProfile>>('/v1/teachers/profile');
export const updateTeacherProfile = (body:TeacherProfile) => request<TeacherProfile>('/v1/teachers/profile',{method:'PUT',body});
export const createTeacherLesson = (body: LessonDraft) => request<Lesson>('/v1/teachers/lessons', { method: 'POST', body });
export const updateTeacherLesson = (id: string, body: LessonDraft) => request<Lesson>(`/v1/teachers/lessons/${id}`, { method: 'PUT', body });
export const deleteTeacherLesson = (id: string) => request<void>(`/v1/teachers/lessons/${id}`, { method: 'DELETE' });
export const publishUnlistedLesson = (id: string, revisionId: string) => request(`/v1/teachers/lessons/${id}/publish-unlisted`, { method: 'POST', body: { revisionId } });
export const submitPublicLesson = (id: string, revisionId: string) => request(`/v1/teachers/lessons/${id}/submit`, { method: 'POST', body: { revisionId } });

export async function getPublicLessons(filters: Record<string, string> = {}): Promise<Lesson[]> {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return (await request<{ items: Lesson[] }>(`/v1/lessons${query.size ? `?${query}` : ''}`, { anonymous: true })).items;
}
export const getPublicLesson = (slug: string) => request<Lesson>(`/v1/lessons/${encodeURIComponent(slug)}`, { anonymous: true });
export const getUnlistedLesson = (token: string) => request<Lesson>(`/v1/lesson-links/${encodeURIComponent(token)}`, { anonymous: true });

interface UploadPolicy {
  url: string;
  method?: 'PUT' | 'POST';
  headers?: Record<string, string>;
  fields?: Record<string, string>;
  publicUrl: string;
}

export async function uploadLessonImage(file: File): Promise<string> {
  const sha256 = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
  const policy = await request<UploadPolicy>('/v1/teachers/media/upload-policy', {
    method: 'POST', body: { sha256, mimeType: file.type, size: file.size },
  });
  if (policy.method === 'PUT') {
    const internal = policy.url.startsWith('/');
    const token = internal ? getToken() : null;
    const response = await fetch(internal ? API_BASE + policy.url : policy.url, {
      method: 'PUT',
      headers: {
        ...policy.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
    if (!response.ok) await throwUploadError(response);
    return policy.publicUrl;
  }
  const form = new FormData();
  Object.entries(policy.fields ?? {}).forEach(([key, value]) => form.append(key, value));
  form.append('file', file);
  const response = await fetch(policy.url, { method: 'POST', body: form });
  if (!response.ok) await throwUploadError(response);
  return policy.publicUrl;
}

async function throwUploadError(response: Response): Promise<never> {
  let message = `Хранилище отклонило файл (${response.status}).`;
  try {
    const payload = await response.json() as { message?: string };
    if (payload.message) message = payload.message;
  } catch {
    // S3-compatible providers may return an empty or non-JSON error response.
  }
  throw new Error(message);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export const getAdminTeacherApplications = async () => (await request<{ items: TeacherApplication[] }>('/v1/admin/teacher-applications')).items;
export const reviewTeacherApplication = (userId: string, status: 'approved' | 'rejected' | 'suspended', comment: string) => request(`/v1/admin/teacher-applications/${userId}/review`, { method: 'POST', body: { status, comment } });
export const getAdminLessonQueue = async () => (await request<{ items: Lesson[] }>('/v1/admin/lesson-revisions')).items;
export const reviewLessonRevision = (revisionId: string, status: 'approved' | 'rejected', comment: string) => request(`/v1/admin/lesson-revisions/${revisionId}/review`, { method: 'POST', body: { status, comment } });

export interface LessonSubmission {
  id: string; lessonId: string; revisionId: string; exerciseId: string;
  studentName: string; lessonTitle: string; answer: string;
  status: 'submitted' | 'reviewing' | 'reviewed'; feedback: string;
  score?: number; createdAt: string;
}
export const submitTeacherLetter = (lessonId: string, revisionId: string, exerciseId: string, answer: string) =>
  request<LessonSubmission>(`/v1/lessons/${lessonId}/submissions`, { method:'POST', body:{ revisionId, exerciseId, answer } });
export const getTeacherSubmissions = async () => (await request<{items:LessonSubmission[]}>('/v1/teachers/submissions')).items;
export const reviewTeacherSubmission = (id:string, status:'reviewing'|'reviewed', feedback:string, score?:number) =>
  request(`/v1/teachers/submissions/${id}/review`, { method:'POST', body:{status,feedback,score} });
export const reportLesson = (lessonId:string, reason:string, details:string) =>
  request(`/v1/lessons/${lessonId}/reports`, { method:'POST', body:{reason,details} });
export interface LessonReport { id:string; lessonId:string; lessonTitle:string; reporterEmail:string; reason:string; details:string; status:'open'|'resolved'|'dismissed'; createdAt:string }
export const getAdminLessonReports = async () => (await request<{items:LessonReport[]}>('/v1/admin/lesson-reports?status=open')).items;
export const reviewLessonReport = (id:string,status:'resolved'|'dismissed') => request(`/v1/admin/lesson-reports/${id}/review`,{method:'POST',body:{status}});

export const publicLessonURL = (lesson: Lesson) => lesson.visibility === 'unlisted'
  ? `${location.origin}/lesson/link/${lesson.shareToken}`
  : `${location.origin}/lessons/${lesson.slug}`;
