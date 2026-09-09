import type { Question } from '../api/personal';

/** Строковый контракт читают и прежние приложения. Разделитель не встречается в вариантах. */
export function toggleAnswer(question: Question, current: string, option: string): string {
  if (!question.multiple) return option;
  const selected = new Set(current ? current.split('\n') : []);
  if (selected.has(option)) selected.delete(option);
  else {
    if (option === question.exclusive) selected.clear();
    else if (question.exclusive) selected.delete(question.exclusive);
    selected.add(option);
  }
  return question.options.filter(o => selected.has(o)).join('\n');
}
