import 'dart:async';
import 'package:desktop_webview_window/desktop_webview_window.dart';

import 'package:cross_file/cross_file.dart';
import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'events/events_controller.dart';
import 'events/odyssey.dart';
import 'events/odyssey_content.dart';
import 'screens/photo_scan_screen.dart';
import 'services/api_client.dart';
import 'services/micro_feed_service.dart';
import 'services/auth_service.dart';
import 'services/db_init.dart';
import 'services/photo_scan_service.dart';
import 'services/sync_service.dart';
import 'course/services/course_progress_store.dart';
import 'course/services/course_content_loader.dart';
import 'services/user_db.dart';
import 'screens/account_screen.dart';
import 'services/card_io.dart';
import 'services/analysis_repository.dart';
import 'services/announcements_controller.dart';
import 'services/daily_service.dart';
import 'services/study_service.dart';
import 'widgets/study_widgets.dart';
import 'services/document_parser.dart';
import 'services/document_translation_service.dart';
import 'services/local_file.dart';
import 'services/listening_service.dart';
import 'services/level_service.dart';
import 'services/roadmap_service.dart';
import 'services/profile_service.dart';
import 'services/notification_service.dart';
import 'services/interface_sounds.dart';
import 'widgets/update_dialog.dart';
import 'screens/onboarding_screen.dart';
import 'screens/all_cards_screen.dart';
import 'screens/book_reader_screen.dart';
import 'screens/grammar_cards_screen.dart';
import 'screens/home_shell.dart';
import 'screens/events_screen.dart';
import 'screens/materials_screen.dart';
import 'screens/news_screen.dart';
import 'screens/public_library_screen.dart';
import 'screens/community_lessons_screen.dart';
import 'screens/about_screen.dart';
import 'models/reader_settings.dart';
import 'state/app_settings.dart';
import 'theme/app_theme.dart';
import 'widgets/animated_widgets.dart';
import 'widgets/server_announcements.dart';
import 'widgets/import_language_dialog.dart';
import 'screens/palace_screen.dart';
import 'travel/travel_screen.dart';
import 'screens/daily_window.dart';
import 'screens/personal_lessons_screen.dart';
import 'screens/garden_screen.dart';
import 'widgets/more_menu_sheet.dart';
import 'widgets/radio_sheet.dart';
import 'widgets/server_settings_sheet.dart';
import 'widgets/wolf_mascot.dart';
import 'utils/language_detector.dart';
import 'utils/haptics.dart';
import 'utils/seasonal_greetings.dart';
import 'utils/short_text.dart';

part 'screens/dashboard_screen.dart';

Future<void> main(List<String> args) async {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.linux &&
      args.length > 1 && runWebViewTitleBarWidget(args)) {
    return;
  }
  // Контент под системными панелями: на Android иначе остаётся серая полоса
  // навигации, из-за которой приложение выглядит старым.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  // Кросс-платформенная инициализация БД (десктоп — ffi, веб — wasm/IndexedDB,
  // мобильные — штатная фабрика).
  initDatabaseFactory();

  final settings = AppSettings();
  await settings.load();

  // Сервер разбора/перевода — из настроек (по умолчанию публичный HF Space).
  AnalysisRepository.baseUrl = settings.backendUrl;
  AnalysisRepository.translationUrl = settings.syncUrl;
  await ListeningService.instance.loadPreferences();

  // Аккаунт и синхронизация. Сессия восстанавливается из локального хранилища
  // без обращения к сети: приложение обязано открываться офлайн.
  final api = ApiClient(baseUrl: settings.syncUrl);
  final auth = AuthService(api: api);
  StudyService.instance.configure(auth);
  await auth.load();
  MicroFeedService.configure(api: api);
  CourseProgressStore.configure(api: api, auth: auth);
  CourseContentLoader.configure(api: api);
  final sync = SyncService(api: api, auth: auth);
  final events = EventsController(api: api, auth: auth);
  final announcements = AnnouncementsController(api: api, auth: auth);
  // Локальный прогресс события нужен ещё до сети: от него зависит, показывать
  // ли награду-фон в настройках чтения.
  unawaited(events.refresh());
  unawaited(announcements.refresh().catchError(
        (Object error) => debugPrint('announcements: $error'),
      ));

  await NotificationService.instance.init();
  if (settings.notificationsEnabled) {
    await NotificationService.instance
        .scheduleDailyReminder(settings.reminderHour, settings.reminderMinute);
  }

  // Первая синхронизация запускается фоном и не задерживает запуск.
  if (auth.isSignedIn) {
    unawaited(sync.sync().catchError((_) => false));
  }

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: settings),
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: sync),
        ChangeNotifierProvider.value(value: events),
        ChangeNotifierProvider.value(value: announcements),
        // Клиент нужен экранам, которые ходят на сервер напрямую (например,
        // загрузка материалов через прокси документов), а не только через
        // синхронизацию.
        Provider<ApiClient>.value(value: api),
        // Уровень сербского и оценка сложности текста. Живут на аккаунте, а
        // не в разделе: спросили один раз — знают везде.
        Provider<LevelService>.value(value: LevelService(api: api)),
        // Дорожная карта: что учить на каждом уровне и как далеко человек
        // продвинулся. Карта открыта и гостю — вход нужен только для отметок.
        Provider<RoadmapService>.value(value: RoadmapService(api: api)),
        Provider<ProfileService>.value(value: ProfileService(api: api)),
        // Слова дня: набор собирает сервер и хранит сутки, поэтому окно,
        // сайт и виджет на рабочем столе показывают одно и то же.
        Provider<DailyService>.value(value: DailyService(api: api)),
      ],
      child: const ChitavukApp(),
    ),
  );
}

class ChitavukApp extends StatelessWidget {
  const ChitavukApp({super.key});

  @override
  Widget build(BuildContext context) {
    final themeMode = context.watch<AppSettings>().reader.themeMode;
    final accountScope = context.select<AuthService, String>(
        (auth) => auth.isSignedIn ? 'user:${auth.account!.id}' : 'guest');
    return MaterialApp(
      // Смена владельца закрывает и вложенные маршруты с его данными.
      key: ValueKey(accountScope),
      // Интерполяция темы перестраивала все зависящие от цветов экраны
      // каждый кадр. Для тяжёлых читалки и карты меняем палитру атомарно.
      themeAnimationDuration: Duration.zero,
      title: 'Читавук',
      builder:(context,child)=>StudyOverlay(child:child??const SizedBox.shrink()),
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode.material,
      home: HomeShell(
          key: ValueKey(accountScope), reading: const DashboardScreen()),
    );
  }
}
