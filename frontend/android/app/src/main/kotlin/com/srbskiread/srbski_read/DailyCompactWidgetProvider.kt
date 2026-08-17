package com.srbskiread.srbski_read

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * Маленький виджет: Читавук, серия и одно слово дня.
 *
 * Отдельный провайдер, а не разметка внутри большого: в списке виджетов должно
 * быть два разных предложения. Большой помещается не на всякий рабочий стол, и
 * человек, у которого нет для него места, иначе не поставил бы ничего.
 */
class DailyCompactWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val data = DailyWidgetData.read(context)
            val views = RemoteViews(context.packageName, R.layout.widget_compact)

            views.setTextViewText(R.id.widget_streak, "${data.streak}")
            views.setTextViewText(
                R.id.widget_stats,
                // Коротко: справа сидит Читавук, и длинная строка обрезалась бы
                // на полуслове. Сколько слов взято, видно по полоске.
                if (data.streak > 0) {
                    DailyWidgetData.plural(data.streak, "день", "дня", "дней") + " подряд"
                } else {
                    data.shortLine()
                },
            )
            views.setProgressBar(
                R.id.widget_progress,
                data.total.coerceAtLeast(1),
                data.learnedCount,
                false,
            )

            val word = data.nextWord
            views.setTextViewText(R.id.widget_word_0, word?.lemma ?: "Слова дня")
            views.setTextViewText(
                R.id.widget_word_tr_0,
                word?.translation?.takeIf { it.isNotEmpty() } ?: data.encouragement(),
            )

            views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context))
            manager.updateAppWidget(id, views)
        }
    }
}

/**
 * Открыть приложение по нажатию: виджет — витрина, а учат слова всё-таки в
 * окне дня.
 */
internal fun openAppIntent(context: Context): PendingIntent? {
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: return null
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(
        context,
        0,
        open,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

/** Просит систему перерисовать все копии виджета этого класса. */
internal fun notifyProvider(context: Context, provider: Class<out AppWidgetProvider>) {
    val manager = AppWidgetManager.getInstance(context)
    val ids = manager.getAppWidgetIds(ComponentName(context, provider))
    if (ids.isEmpty()) return
    context.sendBroadcast(
        Intent(context, provider).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        },
    )
}
