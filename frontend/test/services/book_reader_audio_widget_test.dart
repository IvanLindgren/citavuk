import 'dart:async';
import 'dart:io';
import 'package:audioplayers_platform_interface/audioplayers_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:srbski_read/events/events_controller.dart';
import 'package:srbski_read/models/reader_settings.dart';
import 'package:srbski_read/screens/book_reader_screen.dart';
import 'package:srbski_read/services/api_client.dart';
import 'package:srbski_read/services/announcements_controller.dart';
import 'package:srbski_read/services/auth_service.dart';
import 'package:srbski_read/services/listening_service.dart';
import 'package:srbski_read/services/level_service.dart';
import 'package:srbski_read/services/public_library_service.dart';
import 'package:srbski_read/services/reader_audiobook.dart';
import 'package:srbski_read/services/sync_service.dart';
import 'package:srbski_read/services/user_db.dart';
import 'package:srbski_read/state/app_settings.dart';
import 'package:srbski_read/utils/pages.dart';

class _Documents extends PathProviderPlatform {
  _Documents(this.path);
  final String path;
  @override
  Future<String?> getApplicationDocumentsPath() async => path;
}

class _Audio extends AudioplayersPlatformInterface {
  final events = <String, StreamController<AudioEvent>>{};
  final urls = <String>[];
  String? playing;
  @override
  Stream<AudioEvent> getEventStream(String id) => events
      .putIfAbsent(id, () => StreamController<AudioEvent>.broadcast())
      .stream;
  @override
  Future<void> setSourceUrl(String id, String url,
      {bool? isLocal, String? mimeType}) async {
    urls.add(url);
    playing = id;
    events[id]!.add(
        const AudioEvent(eventType: AudioEventType.prepared, isPrepared: true));
  }

  @override
  Future<int?> getDuration(String id) async => 10000;
  @override
  Future<int?> getCurrentPosition(String id) async => 2000;
  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
  void complete() => events[playing]!
      .add(const AudioEvent(eventType: AudioEventType.complete));
}

class _GlobalAudio implements GlobalAudioplayersPlatformInterface {
  @override
  Stream<GlobalAudioEvent> getGlobalEventStream() => const Stream.empty();
  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  testWidgets(
      'сценарий из видео: страница 7 остаётся на месте и озвучивается её текст',
      (tester) async {
    final audio = _Audio();
    AudioplayersPlatformInterface.instance = audio;
    GlobalAudioplayersPlatformInterface.instance = _GlobalAudio();
    SharedPreferences.setMockInitialValues(
        {'music_prompted': true, 'keep_screen_on': false});
    final previousPath = PathProviderPlatform.instance;
    final directory =
        Directory.systemTemp.createTempSync('citavuk-reader-audio-');
    PathProviderPlatform.instance = _Documents(directory.path);
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final source = PublicLibraryService.paragraphs(
        File('../web/public/public-library/texts/vodja.txt')
            .readAsStringSync());
    final pages = paginate(source);
    final cues = buildReaderAudioCues(source, pages);
    final first = audioCueForPage(cues, 6);
    final id = await tester.runAsync(
        () => UserDb.instance.insertBook('Вођа', 'public:vodja', source));
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(
        'citavuk_audiobook_v2_guest_${id}_fixture-vodja_enabled', true);
    await prefs.setInt('citavuk_audiobook_v2_guest_${id}_fixture-vodja_cue', 0);
    final settings = AppSettings();
    await settings.load();
    await settings
        .update(const ReaderSettings(calm: true, pageTurnSound: false));
    final api = ApiClient(baseUrl: 'https://example.test');
    final auth = AuthService(api: api);
    final sync = SyncService(api: api, auth: auth);
    final events = EventsController(api: api, auth: auth);
    final announcements = AnnouncementsController(api: api, auth: auth);
    tester.view.physicalSize = const Size(580, 1280);
    tester.view.devicePixelRatio = 1;
    try {
      await tester.pumpWidget(MultiProvider(
          providers: [
            ChangeNotifierProvider.value(value: settings),
            ChangeNotifierProvider.value(value: auth),
            ChangeNotifierProvider.value(value: sync),
            ChangeNotifierProvider.value(value: events),
            ChangeNotifierProvider.value(value: announcements),
            Provider.value(value: LevelService(api: api)),
          ],
          child: MaterialApp(
              home: BookReaderScreen(
                  bookId: id!,
                  title: 'Вођа',
                  paragraphs: source,
                  initialParagraph: pages[6].start,
                  initialOffset: pages[6].offset,
                  contentSha: 'fixture-vodja'))));
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Вођа  (7/${pages.length})'), findsOneWidget);
      expect(audio.urls, isEmpty,
          reason:
              'восстановление панели не запускает звук и не перелистывает книгу');
      await tester.tap(find.byIcon(Icons.headphones_outlined));
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
      await tester.pump(const Duration(milliseconds: 400));
      expect(
          audio.urls.last, ListeningService.instance.ttsUrl(cues[first].text));
      expect(find.text('Вођа  (7/${pages.length})'), findsOneWidget);
      final lastStep = cues.indexWhere((cue) => cue.page > 6) - first + 1;
      for (var step = 1; step <= lastStep; step++) {
        audio.complete();
        await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 100)));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump();
        expect(audio.urls.last,
            ListeningService.instance.ttsUrl(cues[first + step].text));
        expect(
            find.text('Вођа  (${cues[first + step].page + 1}/${pages.length})'),
            findsOneWidget, reason: tester.widgetList<Text>(find.byType(Text))
                .map((text)=>text.data).where((text)=>text?.startsWith('Вођа')??false).join(', '));
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 100)));
    } finally {
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(seconds: 6));
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
      await tester
          .runAsync(() async => (await UserDb.instance.database).close());
      PathProviderPlatform.instance = previousPath;
      directory.deleteSync(recursive: true);
      api.close();
    }
  });
}
