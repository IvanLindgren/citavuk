package com.srbskiread.srbski_read

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Слепок «На каждый день» для виджетов рабочего стола.
 *
 * В сеть виджеты не ходят: данные им оставляет приложение в тех же настройках,
 * что пишет `DailyService` (`shared_preferences` кладёт их в файл
 * `FlutterSharedPreferences` с префиксом `flutter.`). Поэтому виджет работает и
 * без интернета, и пока приложение не запущено, — показывая последний набор.
 *
 * Читают отсюда оба виджета, большой и маленький: разъезжаться в том, что они
 * показывают, им незачем.
 */
internal data class DailyWidgetData(
    val words: List<Word>,
    val learned: Set<String>,
    val reviewedToday: Int,
    val dueNow: Int,
    val streak: Int,
    val faded: List<String>,
) {
    data class Word(val lemma: String, val translation: String)

    val total: Int get() = words.size
    val learnedCount: Int get() = words.count { learned.contains(it.lemma) }
    val left: Int get() = (total - learnedCount).coerceAtLeast(0)

    /** Первое слово, которое ещё не в карточках, — для маленького виджета. */
    val nextWord: Word? get() = words.firstOrNull { !learned.contains(it.lemma) } ?: words.firstOrNull()

    /**
     * Строка, которой Читавук встречает человека.
     *
     * Виджет висит на экране весь день, и одна и та же надпись превращается в
     * фон. Поэтому она меняется по ходу дела: сначала зовёт начать, потом
     * подгоняет, а к концу хвалит.
     */
    fun encouragement(): String = when {
        total == 0 -> "Открой Читавука — наберём десять новых слов"
        learnedCount == 0 -> "Ни одного слова ещё не взято. Начнём?"
        left == 0 && dueNow == 0 -> "Все слова дня в карточках. Свака част!"
        left == 0 -> "Слова дня взяты, ждут ${plural(dueNow, "повторение", "повторения", "повторений")}"
        left <= 3 -> "Осталось ${plural(left, "слово", "слова", "слов")} — почти всё"
        else -> "Ещё ${plural(left, "слово", "слова", "слов")} до конца дня"
    }

    /** Короткая версия для маленького виджета. */
    fun shortLine(): String = when {
        total == 0 -> "Открой приложение"
        left == 0 -> "День закрыт"
        else -> "$learnedCount из $total слов"
    }

    companion object {
        private const val FLUTTER_PREFS = "FlutterSharedPreferences"

        /** Ключ из `DailyService.cacheKey` с префиксом shared_preferences. */
        private const val CACHE_KEY = "flutter.citavuk_daily_cache_v1"

        /** Пустой слепок: набора ещё нет — например, приложение не открывали. */
        val empty = DailyWidgetData(emptyList(), emptySet(), 0, 0, 0, emptyList())

        fun read(context: Context): DailyWidgetData {
            val raw = context
                .getSharedPreferences(FLUTTER_PREFS, Context.MODE_PRIVATE)
                .getString(CACHE_KEY, null) ?: return empty
            return try {
                parse(JSONObject(raw))
            } catch (_: Exception) {
                // Слепок испорчен или от старой версии: виджет покажет
                // приглашение открыть приложение, а не пустоту.
                empty
            }
        }

        fun parse(parsed: JSONObject): DailyWidgetData {
            val set = parsed.optJSONObject("set") ?: return empty
            val progress = parsed.optJSONObject("progress") ?: JSONObject()
            return DailyWidgetData(
                words = words(set.optJSONArray("words")),
                learned = strings(set.optJSONArray("learned")).toSet(),
                reviewedToday = progress.optInt("reviewedToday"),
                dueNow = progress.optInt("dueNow"),
                streak = progress.optInt("streak"),
                faded = fadedWords(progress.optJSONArray("faded")),
            )
        }

        private fun words(array: JSONArray?): List<Word> = buildList {
            for (index in 0 until (array?.length() ?: 0)) {
                val item = array?.optJSONObject(index) ?: continue
                val lemma = item.optString("lemma")
                if (lemma.isEmpty()) continue
                add(Word(lemma, item.optString("translation")))
            }
        }

        private fun strings(array: JSONArray?): List<String> = buildList {
            for (index in 0 until (array?.length() ?: 0)) {
                val value = array?.optString(index) ?: continue
                if (value.isNotEmpty()) add(value)
            }
        }

        private fun fadedWords(array: JSONArray?): List<String> = buildList {
            for (index in 0 until (array?.length() ?: 0)) {
                val item = array?.optJSONObject(index) ?: continue
                val word = item.optString("word")
                if (word.isNotEmpty()) add(word)
            }
        }

        /** «1 слово», «2 слова», «5 слов» — иначе Читавук говорит как робот. */
        fun plural(count: Int, one: String, few: String, many: String): String {
            val form = when {
                count % 100 in 11..14 -> many
                count % 10 == 1 -> one
                count % 10 in 2..4 -> few
                else -> many
            }
            return "$count $form"
        }
    }
}
