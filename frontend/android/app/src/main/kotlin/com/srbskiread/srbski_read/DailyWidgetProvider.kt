package com.srbskiread.srbski_read

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews

/**
 * Большой виджет «На каждый день»: Читавук, слова дня и что пора вспомнить.
 *
 * Данные берутся из слепка, который оставляет приложение ([DailyWidgetData]):
 * в сеть виджет не ходит и работает, даже пока приложение не запущено.
 */
class DailyWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
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

        val views = RemoteViews(context.packageName, layout)
        fill(views, DailyWidgetData.read(context), rowsFor(height, compact), compact)
        views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context))
        manager.updateAppWidget(id, views)
    }

    /**
     * Сколько строк слов поместится.
     *
     * Считать по высоте, а не показывать все шесть всегда: на средней клетке
     * последние строки обрезались на полбуквы, и виджет выглядел сломанным.
     */
    private fun rowsFor(height: Int, compact: Boolean): Int {
        if (compact) return 3
        if (height <= 0) return 6
        return ((height - HEADER_HEIGHT_DP) / ROW_HEIGHT_DP).coerceIn(1, 6)
    }

    private fun fill(
        views: RemoteViews,
        data: DailyWidgetData,
        rows: Int,
        compact: Boolean,
    ) {
        views.setTextViewText(R.id.widget_headline, data.encouragement())
        views.setTextViewText(
            R.id.widget_streak,
            if (data.streak > 0) "${data.streak} дн." else "0",
        )

        if (data.total == 0) {
            // Набора ещё нет — например, человек не вошёл или ни разу не
            // открывал приложение сегодня. Виджет об этом и говорит, а не
            // висит пустой рамкой.
            views.setTextViewText(R.id.widget_stats, "Наберём десять новых слов")
            views.setProgressBar(R.id.widget_progress, 100, 0, false)
            for (index in 0 until MAX_ROWS) hideRow(views, index)
            if (!compact) {
                views.setViewVisibility(R.id.widget_divider, View.GONE)
                views.setViewVisibility(R.id.widget_faded, View.GONE)
            }
            return
        }

        views.setProgressBar(R.id.widget_progress, data.total, data.learnedCount, false)
        // Коротко: строка одна, и полные подписи в ней не помещались даже на
        // широком виджете — конец обрезался многоточием.
        views.setTextViewText(
            R.id.widget_stats,
            "${data.learnedCount} из ${data.total}  ·  повторено ${data.reviewedToday}" +
                "  ·  ждёт ${data.dueNow}",
        )

        for (index in 0 until MAX_ROWS) {
            val word = data.words.getOrNull(index)
            if (word == null || index >= rows) {
                hideRow(views, index)
                continue
            }
            views.setViewVisibility(wordRow(index), View.VISIBLE)
            // Взятое слово получает галочку вместо звёздочки: иначе виджет
            // каждый день выглядит одинаково, сколько ни занимайся.
            views.setImageViewResource(
                wordDot(index),
                if (data.learned.contains(word.lemma)) R.drawable.widget_check
                else R.drawable.widget_dot,
            )
            views.setTextViewText(wordLemma(index), word.lemma)
            views.setTextViewText(wordTranslation(index), word.translation)
        }

        if (compact) return

        if (data.faded.isEmpty()) {
            views.setViewVisibility(R.id.widget_divider, View.GONE)
            views.setViewVisibility(R.id.widget_faded, View.GONE)
        } else {
            views.setViewVisibility(R.id.widget_divider, View.VISIBLE)
            views.setViewVisibility(R.id.widget_faded, View.VISIBLE)
            views.setTextViewText(
                R.id.widget_faded,
                "Пора вспомнить: " + data.faded.take(4).joinToString(", "),
            )
        }
    }

    private fun hideRow(views: RemoteViews, index: Int) {
        views.setViewVisibility(wordRow(index), View.GONE)
    }

    private fun wordRow(index: Int): Int = when (index) {
        0 -> R.id.widget_word_row_0
        1 -> R.id.widget_word_row_1
        2 -> R.id.widget_word_row_2
        3 -> R.id.widget_word_row_3
        4 -> R.id.widget_word_row_4
        else -> R.id.widget_word_row_5
    }

    private fun wordDot(index: Int): Int = when (index) {
        0 -> R.id.widget_word_dot_0
        1 -> R.id.widget_word_dot_1
        2 -> R.id.widget_word_dot_2
        3 -> R.id.widget_word_dot_3
        4 -> R.id.widget_word_dot_4
        else -> R.id.widget_word_dot_5
    }

    private fun wordLemma(index: Int): Int = when (index) {
        0 -> R.id.widget_word_0
        1 -> R.id.widget_word_1
        2 -> R.id.widget_word_2
        3 -> R.id.widget_word_3
        4 -> R.id.widget_word_4
        else -> R.id.widget_word_5
    }

    private fun wordTranslation(index: Int): Int = when (index) {
        0 -> R.id.widget_word_tr_0
        1 -> R.id.widget_word_tr_1
        2 -> R.id.widget_word_tr_2
        3 -> R.id.widget_word_tr_3
        4 -> R.id.widget_word_tr_4
        else -> R.id.widget_word_tr_5
    }

    companion object {
        /** Ниже этой высоты помещаются три слова, а не шесть. */
        private const val COMPACT_HEIGHT_DP = 180

        /**
         * Всё, кроме списка слов: отступы, гирлянда, шапка с Читавуком,
         * полоска, сводка и строка «пора вспомнить».
         */
        private const val HEADER_HEIGHT_DP = 186
        private const val ROW_HEIGHT_DP = 28
        private const val MAX_ROWS = 6

        /** Перерисовывает все копии обоих виджетов. */
        fun refresh(context: Context) {
            notifyProvider(context, DailyWidgetProvider::class.java)
            notifyProvider(context, DailyCompactWidgetProvider::class.java)
        }
    }
}
