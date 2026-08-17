"""Проверка урока до отправки на сервер.

Повторяет правила `server/internal/api/teacher_lesson_handlers.go`. Смысл не в
том, чтобы заменить серверную проверку — она всё равно останется последней, — а
в том, чтобы ИИ-агент увидел все ошибки разом и с понятными словами, а не по
одной в виде HTTP 422 после каждой попытки.

Ошибка (`error`) означает, что сервер урок не примет. Замечание (`warning`) —
что примет, но получится плохо: пустой разбор, задание без объяснения, теория в
одну строку.

    python tools/content_upload/validate_lesson.py lesson.json
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
LESSON_TYPES = {"lexicon", "grammar", "speaking", "writing"}
SCRIPTS = {"latin", "cyrillic", "both"}

# Список дублирует validExercises на сервере. Разойдись он — агент собрал бы
# урок, который сервер молча отвергнет одной строкой без указания места.
EXERCISE_TYPES = {
    "multiple_choice", "ending_picker", "sentence_builder", "letter_unscramble",
    "matching", "fill_blank", "image_description", "reading_qa", "form_hunt",
    "explain_word", "teacher_letter", "word_drill", "translator_duel",
}

THEORY_BLOCKS = {"paragraph", "heading", "quote", "list", "image", "video", "table"}
THEORY_LIMIT = 6000
VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com", "player.vimeo.com",
               "rutube.ru", "vk.com", "vkvideo.ru", "m.vk.com", "m.youtube.com")

def _filled(exercise: dict, name: str) -> bool:
    value = exercise.get(name)
    if isinstance(value, list):
        return any(bool(str(item).strip()) for item in value if item is not None)
    return bool(str(value).strip()) if value is not None else False


# Условия, при которых задание вообще открывается своим интерактивом.
#
# Взяты из `ExerciseBody` в web/src/components/LessonPlayer.tsx. Это важнее
# любых других проверок: не выполнив условие, задание не падает с ошибкой, а
# молча превращается в поле свободного ответа. Урок при этом выглядит целым, и
# заметить подмену можно только пройдя его целиком.
PLAYABLE = {
    "multiple_choice": (
        lambda e: _filled(e, "options") and (_filled(e, "answer") or _filled(e, "referenceAnswer")),
        "нужны options и answer",
    ),
    "ending_picker": (
        lambda e: _filled(e, "options") and (_filled(e, "context") or _filled(e, "stem")),
        "нужны options и context (или stem)",
    ),
    "sentence_builder": (lambda e: _filled(e, "tokens"), "нужен непустой tokens"),
    "letter_unscramble": (lambda e: _filled(e, "answer"), "нужен answer"),
    "matching": (lambda e: _filled(e, "pairs"), "нужен pairs"),
    "fill_blank": (
        lambda e: "___" in str(e.get("context") or ""),
        "нужен context с пропуском ___",
    ),
    "image_description": (lambda e: _filled(e, "prompt"), "нужен prompt"),
    "reading_qa": (
        lambda e: _filled(e, "questions"),
        "нужен questions (и readingText с самим текстом)",
    ),
    "form_hunt": (
        lambda e: _filled(e, "context") and _filled(e, "targetWords"),
        "нужны context и targetWords",
    ),
    "explain_word": (lambda e: _filled(e, "prompt"), "нужен prompt"),
    "teacher_letter": (lambda e: _filled(e, "prompt"), "нужен prompt"),
    "word_drill": (lambda e: _filled(e, "pairs"), "нужен pairs со словами и переводами"),
    "translator_duel": (
        lambda e: _filled(e, "context") and _filled(e, "answer"),
        "нужны context (фраза) и answer (эталонный перевод)",
    ),
}


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def text(self) -> str:
        lines = [f"ОШИБКА: {item}" for item in self.errors]
        lines += [f"замечание: {item}" for item in self.warnings]
        return "\n".join(lines) if lines else "Урок в порядке."


def visible_length(value, total: int = 0) -> int:
    """Знаки теории — так же, как их считает сервер: ссылки не в счёт."""
    if isinstance(value, str):
        return total + len(value)
    if isinstance(value, list):
        for item in value:
            total = visible_length(item, total)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key not in ("url", "embedUrl"):
                total = visible_length(item, total)
    return total


def check_https(url: str, where: str, report: Report) -> None:
    parsed = urlparse(url or "")
    if parsed.scheme != "https" or not parsed.netloc:
        report.error(f"{where}: нужна ссылка по https, а не «{url}»")


def check_meta(lesson: dict, report: Report) -> None:
    title = (lesson.get("title") or "").strip()
    if not 1 <= len(title) <= 160:
        report.error("title: от 1 до 160 знаков")
    if len(lesson.get("summary") or "") > 500:
        report.error("summary: не длиннее 500 знаков")
    topic = (lesson.get("topic") or "").strip()
    if not 1 <= len(topic) <= 80:
        report.error("topic: от 1 до 80 знаков (тема урока обязательна)")
    if lesson.get("level") not in LEVELS:
        report.error(f"level: один из {sorted(LEVELS)}")
    if lesson.get("lessonType") not in LESSON_TYPES:
        report.error(f"lessonType: один из {sorted(LESSON_TYPES)}")
    if lesson.get("script") not in SCRIPTS:
        report.error(f"script: один из {sorted(SCRIPTS)}")
    minutes = lesson.get("estimatedMinutes")
    if not isinstance(minutes, int) or not 1 <= minutes <= 240:
        report.error("estimatedMinutes: целое число от 1 до 240")
    tags = lesson.get("tags") or []
    if not isinstance(tags, list) or len(tags) > 12:
        report.error("tags: список не длиннее 12 элементов")
    else:
        for tag in tags:
            if not isinstance(tag, str) or not tag.strip() or len(tag) > 40:
                report.error(f"tags: пустой или слишком длинный тег «{tag}»")
    if lesson.get("coverUrl"):
        check_https(lesson["coverUrl"], "coverUrl", report)
    if not (lesson.get("summary") or "").strip():
        report.warn("summary пуст: в каталоге урок будет карточкой без описания")


def check_theory(theory, report: Report) -> None:
    if not isinstance(theory, list) or not theory:
        report.error("content.theory: нужен непустой список блоков")
        return
    for index, block in enumerate(theory, 1):
        where = f"theory[{index}]"
        if not isinstance(block, dict):
            report.error(f"{where}: блок должен быть объектом")
            continue
        kind = block.get("type")
        if kind not in THEORY_BLOCKS:
            report.error(f"{where}: неизвестный блок «{kind}», допустимы {sorted(THEORY_BLOCKS)}")
            continue
        if kind == "video":
            url = block.get("url") or ""
            check_https(url, where, report)
            host = urlparse(url).hostname or ""
            if not any(host.lower().lstrip("www.").endswith(h) for h in VIDEO_HOSTS):
                report.error(f"{where}: видео принимается только с YouTube, VK Video, Rutube и Vimeo")
        if kind == "image":
            check_https(block.get("url") or "", where, report)
        if kind in ("paragraph", "quote", "heading") and not (block.get("text") or "").strip():
            report.error(f"{where}: блок «{kind}» без текста")
        if kind == "list" and not block.get("items"):
            report.error(f"{where}: список без пунктов")
        if kind == "table" and not block.get("rows"):
            report.error(f"{where}: таблица без строк")

    length = visible_length(theory)
    if length > THEORY_LIMIT:
        report.error(
            f"теория длиннее {THEORY_LIMIT} знаков ({length}); разделите материал на несколько уроков"
        )
    if length < 200:
        report.warn(f"теория короткая ({length} знаков): читателю почти нечего прочитать")
    if not any(isinstance(b, dict) and b.get("type") == "heading" for b in theory):
        report.warn("в теории нет ни одного заголовка: сплошной текст читают хуже")


def check_exercises(exercises, report: Report) -> None:
    if exercises is None:
        report.warn("в уроке нет упражнений: останется только теория")
        return
    if not isinstance(exercises, list):
        report.error("content.exercises: должен быть списком")
        return
    if not exercises:
        report.warn("список упражнений пуст")
    seen = set()
    for index, exercise in enumerate(exercises, 1):
        where = f"exercises[{index}]"
        if not isinstance(exercise, dict):
            report.error(f"{where}: упражнение должно быть объектом")
            continue
        kind = exercise.get("type")
        if kind not in EXERCISE_TYPES:
            report.error(f"{where}: неизвестный тип «{kind}», допустимы {sorted(EXERCISE_TYPES)}")
            continue
        identifier = exercise.get("id")
        if identifier:
            if identifier in seen:
                report.error(f"{where}: повторяющийся id «{identifier}»")
            seen.add(identifier)
        else:
            report.warn(f"{where}: без id — прогресс по заданию не сохранится между версиями")
        if not (exercise.get("prompt") or "").strip():
            report.error(f"{where}: нет формулировки задания (prompt)")
        playable, expected = PLAYABLE[kind]
        if not playable(exercise):
            report.error(
                f"{where} ({kind}): {expected}. Иначе задание молча станет полем "
                "свободного ответа — урок будет выглядеть целым, а работать не будет"
            )
        if exercise.get("imageUrl"):
            check_https(exercise["imageUrl"], f"{where}.imageUrl", report)
        if kind in ("multiple_choice", "ending_picker"):
            check_options(exercise, where, report)
        if kind == "reading_qa" and not (exercise.get("readingText") or "").strip():
            report.error(f"{where}: нет readingText — вопросы будут без текста")
        if kind == "translator_duel" and not (exercise.get("referenceAnswer") or "").strip():
            report.warn(f"{where}: без referenceAnswer не с чем сравнивать — это перевод машины")
        if kind in ("matching", "word_drill"):
            for number, pair in enumerate(exercise.get("pairs") or [], 1):
                if not isinstance(pair, dict) or not pair.get("left") or not pair.get("right"):
                    report.error(f"{where}.pairs[{number}]: нужны обе стороны (left и right)")
        if not (exercise.get("explanation") or "").strip():
            report.warn(f"{where}: без объяснения — ошибка ученику ничего не даст")


def check_options(exercise: dict, where: str, report: Report) -> None:
    """Варианты ответа у уроков — просто строки, а верный назван в `answer`.

    Отсюда и главная ловушка: `answer`, не совпавший ни с одним вариантом,
    делает задание непроходимым — верного ответа среди вариантов попросту нет.
    """
    options = [str(option).strip() for option in exercise.get("options") or []]
    if len(options) < 2:
        report.error(f"{where}: нужно минимум два варианта ответа")
        return
    if any(not text for text in options):
        report.error(f"{where}: пустой вариант ответа")
    if len(set(options)) != len(options):
        report.error(f"{where}: варианты ответа повторяются")

    answer = str(exercise.get("answer") or exercise.get("referenceAnswer") or "").strip()
    if answer and answer not in options:
        report.error(
            f"{where}: answer «{answer}» не совпадает ни с одним вариантом — "
            "задание нельзя пройти правильно"
        )


def check_dialogue(dialogue, report: Report) -> None:
    """Связность диалога.

    Сервер проверяет то же самое, но ученику важнее другое: не только чтобы
    начало нашлось, а чтобы из него можно было дойти до конца. Недостижимые
    реплики — самая частая беда сгенерированных диалогов.
    """
    if dialogue is None:
        return
    if not isinstance(dialogue, dict):
        report.error("content.dialogue: должен быть объектом")
        return
    nodes = dialogue.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        report.error("dialogue.nodes: у диалога нет реплик")
        return

    ids: set[str] = set()
    for index, node in enumerate(nodes, 1):
        if not isinstance(node, dict):
            report.error(f"dialogue.nodes[{index}]: реплика должна быть объектом")
            continue
        node_id = (node.get("id") or "").strip()
        if not node_id:
            report.error(f"dialogue.nodes[{index}]: у реплики нет id")
            continue
        if node_id in ids:
            report.error(f"dialogue: id реплики «{node_id}» повторяется")
        ids.add(node_id)
        if not (node.get("text") or "").strip():
            report.error(f"dialogue: реплика «{node_id}» без текста")
        if not (node.get("speaker") or "").strip():
            report.warn(f"dialogue: у реплики «{node_id}» нет имени говорящего")
        if node.get("avatar") not in (None, "teacher", "student", "woman", "man"):
            report.error(
                f"dialogue: у реплики «{node_id}» неизвестный avatar «{node['avatar']}»; "
                "допустимы teacher, student, woman, man"
            )
        for number, choice in enumerate(node.get("choices") or [], 1):
            if isinstance(choice, dict) and not (choice.get("label") or "").strip():
                report.error(f"dialogue: у реплики «{node_id}» вариант {number} без подписи")

    start = (dialogue.get("startId") or "").strip()
    if start not in ids:
        report.error(f"dialogue.startId: «{start}» — такой реплики нет")
        return

    reachable = {start}
    queue = [start]
    by_id = {(n.get("id") or "").strip(): n for n in nodes if isinstance(n, dict)}
    while queue:
        node = by_id.get(queue.pop())
        for choice in (node or {}).get("choices") or []:
            if not isinstance(choice, dict):
                report.error("dialogue: повреждённый вариант ответа")
                continue
            nxt = (choice.get("nextId") or "").strip()
            if nxt and nxt not in ids:
                report.warn(f"dialogue: переход на несуществующую реплику «{nxt}» — сервер его обнулит")
            elif nxt and nxt not in reachable:
                reachable.add(nxt)
                queue.append(nxt)

    for node_id in sorted(ids - reachable):
        report.warn(f"dialogue: до реплики «{node_id}» нельзя дойти из начала")


def check_lesson(lesson: dict) -> Report:
    report = Report()
    if not isinstance(lesson, dict):
        report.error("урок должен быть объектом JSON")
        return report
    check_meta(lesson, report)

    content = lesson.get("content")
    if not isinstance(content, dict):
        report.error("content: нужен объект с разделами theory, exercises, dialogue")
        return report
    if len(json.dumps(content, ensure_ascii=False).encode()) > 512 * 1024:
        report.error("content: больше 512 КБ, сервер такой урок не примет")

    check_theory(content.get("theory"), report)
    check_markdown(content, report)
    check_exercises(content.get("exercises"), report)
    check_dialogue(content.get("dialogue"), report)
    return report


def check_markdown(content: dict, report: Report) -> None:
    """`markdown` перекрывает `theory` на сайте.

    Сервер про это ничего не знает: он проверяет только теорию. Поэтому пустой
    или куцый markdown при полной теории проходит проверку, а урок на сайте
    открывается пустым — приложение при этом показывает его целиком, и понять,
    что не так, нельзя без сравнения двух устройств.
    """
    if "markdown" not in content:
        return
    markdown = content.get("markdown")
    if not isinstance(markdown, str):
        report.error("content.markdown: должен быть строкой")
        return
    if not markdown.strip():
        report.error("content.markdown пуст — на сайте урок откроется пустым; "
                     "уберите поле или заполните его")
        return
    theory_length = visible_length(content.get("theory") or [])
    if theory_length and len(markdown) < theory_length / 2:
        report.warn("content.markdown заметно короче теории: на сайте покажется "
                    "он, а не theory — часть материала пропадёт")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    path = Path(argv[1])
    try:
        lesson = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ОШИБКА: не удалось прочитать {path}: {error}")
        return 1
    report = check_lesson(lesson)
    print(report.text())
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
