# Выбор видеобэкенда Linux

Это собственный адаптер регистрации, не копия исходников стороннего плагина.
`flutter_inappwebview` используется в Windows/Android. Его экспериментальная
Linux-реализация требует новых WebKitNetworkSession/WebKitScriptMessageReply,
которых нет у WPE 2.36 в Ubuntu 22.04. Поэтому Linux-экран явно использует
имеющийся desktop_webview_window (WebKitGTK 4.1), а не вызывает InAppWebView.

При смене выбранного backend необходимо одновременно изменить видеокарточку,
регистрацию title-bar isolate в main и этот override. Не вызывать InAppWebView
на Linux с данным адаптером.
