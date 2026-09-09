import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owner: "a" }));
const remote = vi.hoisted(() => vi.fn());
vi.mock("../lib/db", () => ({ activeStorageName: () => state.owner }));
vi.mock("../api/course", () => ({
  getRemoteCourseProgress: remote,
  getPublishedCourse: vi.fn(),
  putRemoteCourseProgress: vi.fn(),
}));
import {
  emptyProgress,
  loadProgress,
  startCourseFrom,
  syncCourseProgress,
} from "./data";
import type { CourseBundle } from "./types";
const bundle = {
  courseId: "course",
  courseVersion: "1",
  config: { passThreshold: 0.6 },
  units: [
    {
      skills: [
        {
          lessons: [
            { id: "a", prerequisites: [] },
            { id: "b", prerequisites: ["a"] },
          ],
        },
      ],
    },
  ],
} as CourseBundle;
beforeEach(() => {
  state.owner = "a";
  localStorage.clear();
  remote.mockReset();
});
it("пропуски не переходят между аккаунтами, старый общий ключ не присваивается", () => {
  localStorage.setItem("citavuk-course-progress-v1", "legacy-backup");
  startCourseFrom(bundle, "b");
  state.owner = "b";
  expect(loadProgress(bundle).lessons).toEqual({});
  state.owner = "a";
  expect(loadProgress(bundle).lessons.a?.skipped).toBe(true);
  expect(localStorage.getItem("citavuk-course-progress-v1")).toBe(
    "legacy-backup",
  );
});
it("ответ сервера после смены аккаунта не меняет новое хранилище", async () => {
  let resolve!: (value: unknown) => void;
  remote.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const pending = syncCourseProgress(bundle);
  state.owner = "b";
  resolve({
    payload: { ...emptyProgress(bundle), xp: 999 },
    updatedAt: new Date().toISOString(),
  });
  await expect(pending).rejects.toThrow("Аккаунт изменился");
  expect(loadProgress(bundle).xp).toBe(0);
});
