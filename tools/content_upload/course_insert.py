"""Вставка упражнения в файл курса без переписывания всего файла.

Соблазнительно прочитать unit целиком, добавить упражнение в структуру и
сохранить `json.dumps(..., indent=2)`. Так делать нельзя: файлы курса
отформатированы не построчно (14 КБ против 26 КБ после такой перезаписи), и
добавление одного упражнения дало бы diff на весь файл. Проверить такую правку
глазами невозможно, а именно её и придётся проверять.

Поэтому текст файла не трогается вовсе, кроме одного места: перед закрывающей
скобкой нужного массива `exercises` дописывается новый элемент. Границы массива
находит сам разборщик JSON (`raw_decode`), а не поиск скобок вручную.
"""

from __future__ import annotations

import json
import re


class InsertError(RuntimeError):
    pass


def _array_span(raw: str, start: int) -> tuple[int, int, list]:
    """Границы массива, начинающегося на первой `[` после start."""
    bracket = raw.find("[", start)
    if bracket < 0:
        raise InsertError("не найден список упражнений")
    array, end = json.JSONDecoder().raw_decode(raw, bracket)
    if not isinstance(array, list):
        raise InsertError("значение exercises — не список")
    return bracket, end, array


def find_exercises_array(raw: str, lesson_id: str, expected: list) -> tuple[int, int, list]:
    """Ищет массив упражнений именно того урока.

    Идентификатор урока может встретиться в файле не один раз, поэтому кандидат
    принимается только если его список упражнений совпал с разобранным из
    структуры. Совпадение по строке без такой сверки однажды дописало бы
    упражнение в чужой урок, и заметили бы это уже на бою.
    """
    pattern = re.compile(r'"id"\s*:\s*"' + re.escape(lesson_id) + r'"')
    for match in pattern.finditer(raw):
        key = raw.find('"exercises"', match.end())
        if key < 0:
            continue
        try:
            bracket, end, array = _array_span(raw, key)
        except (InsertError, json.JSONDecodeError):
            continue
        if array == expected:
            return bracket, end, array
    raise InsertError(f"не удалось найти упражнения урока {lesson_id} в тексте файла")


def _one_line_style(raw: str, bracket: int, close: int) -> bool:
    """Каждый элемент массива записан одной строкой?"""
    lines = [line.strip() for line in raw[bracket + 1:close].splitlines()]
    lines = [line for line in lines if line]
    return bool(lines) and all(line.startswith("{") for line in lines)


def insert_exercise(raw: str, lesson_id: str, expected: list, exercise: dict) -> str:
    """Возвращает текст файла с дописанным упражнением."""
    bracket, end, array = find_exercises_array(raw, lesson_id, expected)
    close = raw.rindex("]", bracket, end)

    line_start = raw.rfind("\n", 0, close) + 1
    closing_indent = raw[line_start:close]
    if closing_indent.strip():
        # Массив закрыт на той же строке, что и последний элемент: отступ
        # вычисляем от строки, на которой массив открыт.
        open_line = raw.rfind("\n", 0, bracket) + 1
        closing_indent = re.match(r"[ \t]*", raw[open_line:]).group(0)
    item_indent = closing_indent + "  "

    block = json.dumps(exercise, ensure_ascii=False, indent=2)
    if _one_line_style(raw, bracket, close):
        # В файлах курса упражнение занимает одну строку. Раскрытый JSON рядом
        # с ними читался бы как чужая вставка, а diff вырос бы на пустом месте.
        block = json.dumps(exercise, ensure_ascii=False)
    else:
        block = "\n".join(
            item_indent + line if index else line
            for index, line in enumerate(block.splitlines())
        )

    head = raw[:close].rstrip()
    if array:
        addition = f",\n{item_indent}{block}\n{closing_indent}"
    else:
        # Пустой массив: убираем «[» из хвоста, чтобы не получить «[\n[».
        head = raw[:bracket + 1]
        addition = f"\n{item_indent}{block}\n{closing_indent}"
    return head + addition + raw[close:]
