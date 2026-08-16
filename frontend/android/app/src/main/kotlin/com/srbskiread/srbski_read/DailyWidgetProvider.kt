package com.srbskiread.srbski_read

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Виджет «На каждый день» на рабочем столе.
 *
 * В сеть не ходит: данные ему оставляет приложение в тех же настройках, что
 * пишет `DailyService` (`shared_preferences` кладёт их в файл
 * `FlutterSharedPreferences` с префиксом `flutter.`). Поэтому виджет работает
 * и без интернета, и пока приложение не запущено, — показывая последний
 * известный набор.
 */
class DailyWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        manager: AppWidgetManager,
        ids: IntArray,
    ) {
        for (id in ids) render(context, manager, id)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        manager: AppWidgetManager,
        id: Int,
        options: Bundle,
    ) {
        // Человек растянул или сжал виджет: разметка выбирается по высоте, и
        // без перерисовки он остался бы обрезанным.
        render(context, manager, id)
    }

    private fun render(context: Context, manager: AppWidgetManager, id: Int) {
        val height = manager.getAppWidgetOptions(id)
            .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
        val compact = height in 1 until COMPACT_HEIGHT_DP
        val layout = if (compact) R.layout.widget_daily_small else R.layout.widget_daily
        val rows = if (compact) 3 else 6

        val views = RemoteViews(context.packageName, layout)
        fill(context, views, rows, compact)

        // Тап по виджету открывает приложение: виджет — витрина, а учат слова
        // всё-таки в окне дня.
        val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            views.setOnClickPendingIntent(
                R.id.widget_root,
                PendingIntent.getActivity(
                    context,
                    0,
                    open,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
        }

        manager.updateAppWidget(id, views)
    }

    private fun fill(context: Context, views: RemoteViews, rows: Int, compact: Boolean) {
        val data = readCache(context)

        val words = data?.optJSONArray("words")
        val learned = data?.optJSONArray("learned")
        val learnedCount = learned?.length() ?: 0
        val total = words?.length() ?: 0

        if (words == null || total == 0) {
            // Набора ещё нет — например, человек не вошёл или ни разу не
            // открывал приложение сегодня. Виджет об этом и говорит, а не
            // висит пустой рамкой.
            views.setTextViewText(R.id.widget_streak, "")
            views.setTextViewText(R.id.widget_headline, "Слова дня ждут в приложении")
            views.setTextViewText(R.id.widget_stats, "Открой Читавука — наберём десять новых")
            views.setProgressBar(R.id.widget_progress, 100, 0, false)
            for (index in 0 until rows) {
                views.setViewVisibility(wordRow(index), android.view.View.GONE)
            }
            if (!compact) {
                views.setViewVisibility(R.id.widget_divider, android.view.View.GONE)
                views.setViewVisibility(R.id.widget_faded, android.view.View.GONE)
            }
            return
        }

        val streak = data.optInt("streak", 0)
        views.setTextViewText(
            R.id.widget_streak,
            if (streak > 0) "$streak дн. подряд" else "Сегодня",
        )
        views.setTextViewText(
            R.id.widget_headline,
            "В карточках $learnedCount из $total",
        )
        views.setProgressBar(R.id.widget_progress, total, learnedCount, false)
        views.setTextViewText(
            R.id.widget_stats,
            "Повторено сегодня: ${data.optInt("reviewedToday", 0)}   ·   " +
                "Ждёт: ${data.optInt("dueNow", 0)}",
        )

        val known = learnedList(learned)
        for (index in 0 until rows) {
            val word = words.optJSONObject(index)
            if (word == null) {
                views.setViewVisibility(wordRow(index), android.view.View.GONE)
                continue
            }
            val lemma = word.optString("lemma")
            val translation = word.optString("translation")
            // Уже добавленное слово помечается галочкой: иначе виджет каждый
            // день выглядит одинаково, сколько ни занимайся.
            val mark = if (known.contains(lemma)) "✓ " else ""
            views.setViewVisibility(wordRow(index), android.view.View.VISIBLE)
            views.setTextViewText(
                wordText(index),
                if (translation.isEmpty()) "$mark$lemma" else "$mark$lemma — $translation",
            )
        }

        if (compact) return

        val faded = data.optJSONArray("faded")
        val names = buildList {
            for (index in 0 until (faded?.length() ?: 0)) {
                val item = faded?.optJSONObject(index) ?: continue
                add(item.optString("word"))
            }
        }.filter { it.isNotEmpty() }

        if (names.isEmpty()) {
            views.setViewVisibility(R.id.widget_divider, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_faded, android.view.View.GONE)
        } else {
            views.setViewVisibility(R.id.widget_divider, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.widget_faded, android.view.View.VISIBLE)
            views.setTextViewText(
                R.id.widget_faded,
                "Пора вспомнить: " + names.take(4).joinToString(", "),
            )
        }
    }

    /**
     * Плоский слепок последнего набора и сводки.
     *
     * Хранится одной строкой JSON, чтобы виджет и приложение не разъезжались
     * по полям при обновлениях.
     */
    private fun readCache(context: Context): JSONObject? {
        val raw = context
            .getSharedPreferences(FLUTTER_PREFS, Context.MODE_PRIVATE)
            .getString(CACHE_KEY, null) ?: return null
        return try {
            val parsed = JSONObject(raw)
            val set = parsed.optJSONObject("set") ?: return null
            val progress = parsed.optJSONObject("progress") ?: JSONObject()
            JSONObject().apply {
                put("words", set.optJSONArray("words"))
                put("learned", set.optJSONArray("learned"))
                put("reviewedToday", progress.optInt("reviewedToday"))
                put("dueNow", progress.optInt("dueNow"))
                put("streak", progress.optInt("streak"))
                put("faded", progress.optJSONArray("faded"))
            }
        } catch (_: Exception) {
            // Слепок испорчен или от старой версии — виджет покажет приглашение
            // открыть приложение, а не пустоту.
            null
        }
    }

    private fun learnedList(array: org.json.JSONArray?): Set<String> {
        if (array == null) return emptySet()
        val items = mutableSetOf<String>()
        for (index in 0 until array.length()) {
            items.add(array.optString(index))
        }
        return items
    }

    private fun wordRow(index: Int): Int = when (index) {
        0 -> R.id.widget_word_row_0
        1 -> R.id.widget_word_row_1
        2 -> R.id.widget_word_row_2
        3 -> R.id.widget_word_row_3
        4 -> R.id.widget_word_row_4
        else -> R.id.widget_word_row_5
    }

    private fun wordText(index: Int): Int = when (index) {
        0 -> R.id.widget_word_0
        1 -> R.id.widget_word_1
        2 -> R.id.widget_word_2
        3 -> R.id.widget_word_3
        4 -> R.id.widget_word_4
        else -> R.id.widget_word_5
    }

    companion object {
        private const val FLUTTER_PREFS = "FlutterSharedPreferences"

        /** Ключ из `DailyService.cacheKey` с префиксом shared_preferences. */
        private const val CACHE_KEY = "flutter.citavuk_daily_cache_v1"

        /** Ниже этой высоты помещаются три слова, а не шесть. */
        private const val COMPACT_HEIGHT_DP = 180

        /** Перерисовывает все копии виджета: слова или сводка изменились. */
        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                android.content.ComponentName(context, DailyWidgetProvider::class.java),
            )
            if (ids.isEmpty()) return
            context.sendBroadcast(
                Intent(context, DailyWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                },
            )
        }
    }
}
