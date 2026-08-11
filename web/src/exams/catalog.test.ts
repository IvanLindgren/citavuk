import { describe, expect, it } from 'vitest';

import { OFFICIAL_EXAMS, findOfficialExam } from './catalog';

describe('каталог экзаменов', () => {
  it('содержит отдельный официальный и внутренний тест для A1-C1', () => {
    expect(OFFICIAL_EXAMS.map((exam) => exam.level)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1']);
    expect(new Set(OFFICIAL_EXAMS.map((exam) => exam.testUrl)).size).toBe(5);
    expect(new Set(OFFICIAL_EXAMS.map((exam) => exam.nativeQuizId)).size).toBe(5);
    expect(new Set(OFFICIAL_EXAMS.map((exam) => exam.nativeQuizKey)).size).toBe(5);
    for (const exam of OFFICIAL_EXAMS) {
      expect(exam.testUrl).toContain(`/${exam.level}_responsive_design/`);
      expect(exam.nativeQuizKey).toContain(`:${exam.level.toLowerCase()}:`);
    }
  });

  it('не ломает страницу при неизвестном уровне', () => {
    expect(findOfficialExam('Z9').level).toBe('A1');
  });
});
