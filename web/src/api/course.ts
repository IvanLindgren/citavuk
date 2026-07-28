import type { CourseBundle, CourseProgress } from '../course/types';
import { ApiError, request } from './client';

interface RemoteCourseProgress {
  courseId: string;
  payload: CourseProgress;
  updatedAt: string;
  applied?: boolean;
}

export async function getRemoteCourseProgress(
  courseId: string,
): Promise<RemoteCourseProgress | null> {
  try {
    return await request<RemoteCourseProgress>(
      `/v1/course/progress/${encodeURIComponent(courseId)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function putRemoteCourseProgress(
  courseId: string,
  payload: CourseProgress,
  updatedAt: number,
): Promise<RemoteCourseProgress> {
  return request<RemoteCourseProgress>(
    `/v1/course/progress/${encodeURIComponent(courseId)}`,
    {
      method: 'PUT',
      body: {
        payload,
        updatedAt: new Date(updatedAt).toISOString(),
      },
    },
  );
}

export async function getPublishedCourse(
  courseId: string,
): Promise<CourseBundle | null> {
  return (
    (await request<CourseBundle | undefined>(
      `/v1/course/bundle/${encodeURIComponent(courseId)}`,
      { anonymous: true },
    )) ?? null
  );
}
