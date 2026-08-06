/// Корневая оболочка приложения: четыре основных раздела в нижней навигации.
///
/// Чтение | Вукоток | Слушание | Курс сербского. Разделы держатся живыми,
/// поэтому переключение не теряет позицию списка книг, состояние плеера и
/// загруженный курс.
///
/// Вукоток стоит вторым, а не последним: это самый лёгкий вход в язык из всех —
/// карточку читают минуту и без всякой подготовки, — и прятать его за курсом
/// значит показывать его тем, кто и так уже занимается.
library;

import 'package:flutter/material.dart';

import '../course/screens/course_path_screen.dart';
import '../course/state/course_controller.dart';
import '../course/widgets/mascot_view.dart';
import 'listening_screen.dart';
import 'vukotok_screen.dart';

/// Раздел нижней навигации.
enum HomeTab {
  reading('Чтение', Icons.menu_book_outlined, Icons.menu_book),
  vukotok('Вукоток', Icons.bolt_outlined, Icons.bolt),
  listening('Слушание', Icons.headphones_outlined, Icons.headphones),
  course('Курс сербского', Icons.school_outlined, Icons.school);

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

  /// Курс живёт столько же, сколько оболочка: контент и прогресс читаются
  /// один раз, а не при каждом переключении вкладки.
  final CourseController _course = CourseController();

  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    _course.dispose();
    super.dispose();
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
    final scheme = Theme.of(context).colorScheme;

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
          const ListeningScreen(),
          CoursePathScreen(controller: _course),
        ],
      ),
      bottomNavigationBar: NavigationBar(
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
