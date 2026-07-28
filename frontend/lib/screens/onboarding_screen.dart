/// Первый запуск: знакомство, выбор «с аккаунтом или без» и офлайн-словарь.
///
/// Раньше это был диалог, и выбор аккаунта выглядел как мелкая кнопка в углу.
/// Теперь экран: человеку сразу видно, что даёт регистрация и что работает без
/// неё, — а отказаться по-прежнему можно одним нажатием.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/lexicon_db.dart';
import '../state/app_settings.dart';
import '../theme/app_theme.dart';
import '../widgets/animated_widgets.dart';
import '../widgets/wolf_mascot.dart';
import 'privacy_screen.dart';

/// Что человек выбрал на последнем шаге.
enum OnboardingChoice { account, withoutAccount }

Future<OnboardingChoice> showOnboarding(BuildContext context) async {
  final settings = context.read<AppSettings>();
  final choice = await Navigator.of(context).push<OnboardingChoice>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => const OnboardingScreen(),
    ),
  );
  await settings.setFirstRunDone(true);
  return choice ?? OnboardingChoice.withoutAccount;
}

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _pages = PageController();
  int _step = 0;

  bool _downloading = false;
  bool? _downloadOk;

  static const _lastStep = 2;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _go(int step) {
    setState(() => _step = step);
    _pages.animateToPage(step,
        duration: const Duration(milliseconds: 260), curve: Curves.easeOutCubic);
  }

  Future<void> _downloadDictionary() async {
    setState(() {
      _downloading = true;
      _downloadOk = null;
    });
    final ok = await LexiconDb.instance
        .downloadDictionary(AppSettings.defaultDictionaryUrl);
    if (!mounted) return;
    setState(() {
      _downloading = false;
      _downloadOk = ok;
    });
  }

  void _finish(OnboardingChoice choice) =>
      Navigator.of(context).pop(choice);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
              child: Row(
                children: [
                  for (var i = 0; i <= _lastStep; i++)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: i == _step ? 22 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: i <= _step
                              ? scheme.primary
                              : scheme.outlineVariant,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => _finish(OnboardingChoice.withoutAccount),
                    child: const Text('Пропустить'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView(
                controller: _pages,
                onPageChanged: (i) => setState(() => _step = i),
                children: [
                  _WelcomeStep(),
                  _AccountStep(
                    onAccount: () => _finish(OnboardingChoice.account),
                    onSkip: () => _go(2),
                  ),
                  _DictionaryStep(
                    downloading: _downloading,
                    ok: _downloadOk,
                    onDownload: _downloadDictionary,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
              child: Row(
                children: [
                  if (_step > 0)
                    TextButton(
                      onPressed: () => _go(_step - 1),
                      child: const Text('Назад'),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _step == _lastStep
                        ? () => _finish(OnboardingChoice.withoutAccount)
                        : () => _go(_step + 1),
                    child: Text(_step == _lastStep ? 'Начать читать' : 'Дальше'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepBody extends StatelessWidget {
  const _StepBody({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}

class _WelcomeStep extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return _StepBody(
      children: [
        const Center(child: WolfSticker(asset: Wolf.zdravo, size: 150)),
        const SizedBox(height: 16),
        Text('Здраво! Я волк Читавук', style: text.headlineSmall),
        const SizedBox(height: 8),
        Text(
          'Помогу читать по-сербски: нажимаешь на слово — получаешь перевод, '
          'разбор и карточку для повторения.',
          style: text.bodyLarge,
        ),
        const SizedBox(height: 20),
        const _Point(Icons.menu_book_rounded,
            'Чтение, грамматика и карточки работают без интернета.'),
        const _Point(Icons.translate_rounded,
            'Перевод слов — онлайн. Переведённое запоминается и потом доступно офлайн.'),
        const _Point(Icons.school_rounded,
            'Курс сербского, аудирование и материалы для поступления — в одном приложении.'),
      ],
    );
  }
}

class _AccountStep extends StatelessWidget {
  const _AccountStep({required this.onAccount, required this.onSkip});

  final VoidCallback onAccount;
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return _StepBody(
      children: [
        Text('Аккаунт нужен не всем', style: text.headlineSmall),
        const SizedBox(height: 8),
        Text(
          'Читать можно сразу. Аккаунт добавляет только одно — общие данные на '
          'всех устройствах.',
          style: text.bodyLarge,
        ),
        const SizedBox(height: 18),
        _Compare(
          title: 'Без аккаунта',
          icon: Icons.phone_android_rounded,
          color: scheme.outline,
          points: const [
            'Книги, слова и карточки — на этом устройстве',
            'Курс, разбор и повторения работают полностью',
            'Ничего не хранится на сервере',
          ],
        ),
        const SizedBox(height: 12),
        _Compare(
          title: 'С аккаунтом',
          icon: Icons.cloud_done_rounded,
          color: scheme.primary,
          points: const [
            'Те же книги и слова на телефоне, компьютере и сайте',
            'Прогресс курса не теряется при смене устройства',
            'Библиотека переживёт переустановку приложения',
          ],
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                icon: const Icon(Icons.login, size: 18),
                label: const Text('Создать аккаунт'),
                onPressed: onAccount,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton(
                onPressed: onSkip,
                child: const Text('Пока без него'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Center(
          child: TextButton(
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const PrivacyScreen()),
            ),
            child: const Text('Какие данные собираются'),
          ),
        ),
      ],
    );
  }
}

class _DictionaryStep extends StatelessWidget {
  const _DictionaryStep({
    required this.downloading,
    required this.ok,
    required this.onDownload,
  });

  final bool downloading;
  final bool? ok;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return _StepBody(
      children: [
        Text('Словарь для офлайна', style: text.headlineSmall),
        const SizedBox(height: 8),
        Text(
          'Девять тысяч слов с переводом и формами — чтобы читать в метро, '
          'самолёте и на даче без интернета. Можно скачать позже в «Ещё → '
          'Сервер и словарь».',
          style: text.bodyLarge,
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: downloading ? null : onDownload,
          icon: downloading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.download_rounded, size: 18),
          label: Text(downloading ? 'Скачиваю…' : 'Скачать словарь'),
        ),
        if (ok != null) ...[
          const SizedBox(height: 12),
          Text(
            ok!
                ? 'Словарь загружен — перевод работает офлайн.'
                : 'Не получилось скачать. Проверь интернет и попробуй позже.',
            style: text.bodyMedium?.copyWith(
              color: ok! ? scheme.success : scheme.error,
            ),
          ),
        ],
        const SizedBox(height: 24),
        const _Point(Icons.file_open_outlined,
            'Свои книги: PDF, DOCX, FB2, EPUB, DjVu и TXT.'),
        const _Point(Icons.keyboard_outlined,
            'На компьютере файл можно просто перетащить в окно.'),
      ],
    );
  }
}

class _Point extends StatelessWidget {
  const _Point(this.icon, this.text);

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 21, color: scheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

class _Compare extends StatelessWidget {
  const _Compare({
    required this.title,
    required this.icon,
    required this.color,
    required this.points,
  });

  final String title;
  final IconData icon;
  final Color color;
  final List<String> points;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return FadeSlideIn(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLow,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 8),
                Text(title,
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(color: color)),
              ],
            ),
            const SizedBox(height: 8),
            ...points.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('·  '),
                      Expanded(
                        child: Text(p,
                            style: Theme.of(context).textTheme.bodySmall),
                      ),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
