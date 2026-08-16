/// Корневая оболочка приложения: пять основных разделов в нижней навигации.
///
/// Чтение | Вукоток | Карта | Слушание | Курс. Разделы держатся живыми,
/// поэтому переключение не теряет позицию списка книг, состояние плеера и
/// загруженный курс.
///
/// Вукоток стоит вторым, а не последним: это самый лёгкий вход в язык из всех —
/// карточку читают минуту и без всякой подготовки, — и прятать его за курсом
/// значит показывать его тем, кто и так уже занимается.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../course/screens/course_path_screen.dart';
import '../course/state/course_controller.dart';
import '../course/widgets/mascot_view.dart';
import '../services/auth_service.dart';
import '../services/daily_service.dart';
import '../services/level_service.dart';
import '../services/sync_service.dart';
import '../theme/app_theme.dart';
import 'daily_window.dart';
import 'level_prompt.dart';
import 'listening_screen.dart';
import 'roadmap_screen.dart';
import 'vukotok_screen.dart';

/// Раздел нижней навигации.
enum HomeTab {
  reading('Чтение', Icons.menu_book_outlined, Icons.menu_book),
  vukotok('Вукоток', Icons.bolt_outlined, Icons.bolt),
  roadmap('Карта', Icons.map_outlined, Icons.map),
  listening('Слушание', Icons.headphones_outlined, Icons.headphones),
  // Подпись короткая: «Курс сербского» переносилась на вторую строку, и ряд
  // подписей переставал совпадать по базовой линии.
  course('Курс', Icons.school_outlined, Icons.school);

  const HomeTab(this.label, this.icon, this.selectedIcon);

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, required this.reading});

  /// Страница раздела «Чтение» (библиотека). Передаётся снаружи, чтобы
  /// оболочка не зависела от `main.dart` и не возникал цикл импортов.
  final Widget reading;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  final PageController _pages = PageController();

  /// Вопрос об уровне задаётся один раз за запуск и только вошедшему без
  /// уровня. Флаг нужен потому, что build вызывается многократно, а окно,
  /// открывающееся дважды, — это два окна друг на друге.
  bool _levelAsked = false;

  /// Слова дня показываются раз в сутки; флаг бережёт от второго окна за
  /// один запуск, а сам день помнит DailyService.
  bool _dailyShown = false;

  /// Курс живёт столько же, сколько оболочка: контент и прогресс читаются
  /// один раз, а не при каждом переключении вкладки.
  final CourseController _course = CourseController();

  int _index = 0;

  @override
  void initState() {
    super.initState();
    // После первого кадра: до него нет ни Navigator, ни размеров экрана, а
    // окно уровня — обычная нижняя шторка и требует и того и другого.
    WidgetsBinding.instance.addPostFrameCallback((_) => _greet());
  }

  /// Вопрос об уровне, а следом — слова дня. Именно в таком порядке и по
  /// очереди: два окна друг на друге — это два вопроса разом и ни одного
  /// понятного.
  Future<void> _greet() async {
    await _askLevel();
    await _showDaily();
  }

  @override
  void dispose() {
    _pages.dispose();
    _course.dispose();
    super.dispose();
  }

  /// Спрашивает уровень сербского, если он ещё неизвестен.
  ///
  /// Уровень живёт на аккаунте: спросили один раз — знают и лента, и
  /// предупреждение о тяжёлой книге, и на другом устройстве тоже.
  Future<void> _askLevel() async {
    if (_levelAsked || !mounted) return;
    final auth = context.read<AuthService>();
    final account = auth.account;
    if (!auth.isSignedIn || account == null || account.serbianLevel.isNotEmpty) {
      return;
    }
    _levelAsked = true;
    final chosen = await showLevelPrompt(context, context.read<LevelService>());
    if (chosen != null && chosen.isNotEmpty) auth.rememberLevel(chosen);
  }

  /// Показывает слова дня — один раз в сутки.
  ///
  /// Пока уровень не назван, окно не приходит: набор собирается ровно по нему,
  /// и предлагать слова наугад незачем.
  Future<void> _showDaily() async {
    if (_dailyShown || !mounted) return;
    final auth = context.read<AuthService>();
    if (!auth.isSignedIn || (auth.account?.serbianLevel ?? '').isEmpty) return;

    final daily = context.read<DailyService>();
    if (await daily.shownToday()) {
      // Окно сегодня уже было, но виджет на рабочем столе живёт слепком: без
      // тихого обновления он до завтра показывал бы вчерашнюю сводку.
      unawaited(daily.load().then((_) {}, onError: (_) {}));
      return;
    }
    if (!mounted) return;
    _dailyShown = true;
    await daily.rememberShown();
    if (!mounted) return;
    await showDailyWindow(context, daily, sync: context.read<SyncService>());
  }

  void _select(int next) {
    if (next == _index) return;
    setState(() => _index = next);

    // Прогреваем спрайты Читавука при первом заходе в курс, чтобы первый
    // кадр не мигал.
    if (HomeTab.values[next] == HomeTab.course) {
      MascotSprites.precache();
    }

    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (reduceMotion) {
      _pages.jumpToPage(next);
      return;
    }
    _pages.animateToPage(
      next,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    // Вукоток всегда тёмный, и при светлой теме под ним оставалась светлая
    // панель — на границе получался шов. Панель уходит в ночную тему вместе
    // с разделом.
    final dark = HomeTab.values[_index] == HomeTab.vukotok;
    final navTheme = dark ? AppTheme.dark() : Theme.of(context);
    final scheme = navTheme.colorScheme;

    return Scaffold(
      body: PageView(
        controller: _pages,
        // Свайп между разделами отключён: в читалке и плеере есть свои
        // горизонтальные жесты, они бы конфликтовали.
        physics: const NeverScrollableScrollPhysics(),
        onPageChanged: (i) => setState(() => _index = i),
        children: [
          widget.reading,
          const VukotokScreen(),
          const RoadmapScreen(),
          const ListeningScreen(),
          CoursePathScreen(controller: _course),
        ],
      ),
      // Тема панели меняется плавно: резкая смена на переходе вкладки читалась
      // бы как вспышка.
      bottomNavigationBar: AnimatedTheme(
        data: navTheme,
        duration: const Duration(milliseconds: 280),
        child: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: _select,
          backgroundColor: scheme.surfaceContainerHighest,
          indicatorColor: scheme.primary.withValues(alpha: 0.18),
          height: 68,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: [
            for (final tab in HomeTab.values)
              NavigationDestination(
                icon: Icon(tab.icon),
                selectedIcon: Icon(tab.selectedIcon, color: scheme.primary),
                label: tab.label,
                tooltip:
                    tab == HomeTab.course ? 'Курс сербского — бета' : tab.label,
              ),
          ],
        ),
      ),
    );
  }
}

/// Метка «Бета» рядом с заголовком раздела.
class BetaBadge extends StatelessWidget {
  const BetaBadge({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.40)),
      ),
      child: Text(
        'БЕТА',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.8,
          color: scheme.primary,
        ),
      ),
    );
  }
}
