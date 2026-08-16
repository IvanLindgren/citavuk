package com.srbskiread.srbski_read

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    /// Приложение сообщает виджету, что слова дня или сводка изменились.
    /// Сами данные виджет читает из настроек — здесь только команда
    /// перерисоваться.
    override fun configureFlutterEngine(engine: FlutterEngine) {
        super.configureFlutterEngine(engine)
        MethodChannel(engine.dartExecutor.binaryMessenger, DAILY_WIDGET_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "refresh" -> {
                        DailyWidgetProvider.refresh(applicationContext)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    companion object {
        private const val DAILY_WIDGET_CHANNEL = "citavuk/daily_widget"
    }
}
