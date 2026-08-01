import type { OdysseyProgress } from '../events/odyssey';
import { ApiError, request } from './client';

const REMOTE_ID = 'event-odyssey-2026';

interface RemoteEventProgress {
  courseId: string;
  payload: OdysseyProgress;
  updatedAt: string;
  applied?: boolean;
}

export async function getRemoteOdysseyProgress(): Promise<RemoteEventProgress | null> {
  try {
    return await request<RemoteEventProgress>(
      `/v1/course/progress/${REMOTE_ID}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function putRemoteOdysseyProgress(
  progress: OdysseyProgress,
): Promise<RemoteEventProgress> {
  return request<RemoteEventProgress>(`/v1/course/progress/${REMOTE_ID}`, {
    method: 'PUT',
    body: {
      payload: progress,
      updatedAt: new Date(progress.updatedAt || Date.now()).toISOString(),
    },
  });
}
