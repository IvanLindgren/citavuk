import { afterEach, describe, expect, it, vi } from "vitest";
import { personalApi } from "./personal";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});
describe("персональные уроки: контракт", () => {
  it("передаёт ревизию и ответы без клиентского дня серии", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            score: 4,
            total: 4,
            completed: true,
            study: { newDay: true, freezes: 2 },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await personalApi.complete("plan", 2, 7, [
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(fetch.mock.calls[0]![0]).toContain(
      "/v1/personal/plan/days/2/complete",
    );
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      revision: 7,
      answers: ["a", "b", "c", "d"],
    });
    expect(result.study.freezes).toBe(2);
  });
  it("конфликт правок не превращается в успешное сохранение", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: "Урок изменился", code: "conflict" }),
            { status: 409 },
          ),
        ),
    );
    await expect(personalApi.rate("plan", 1, -1)).rejects.toThrow(
      "Урок изменился",
    );
  });
});
