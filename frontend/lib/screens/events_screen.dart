/// Раздел «События»: временные книги и уроки с наградой.
///
/// Пока событие одно, но экран сделан списком: следующее добавляется карточкой,
/// а не переписыванием раздела.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../events/events_controller.dart';
import '../events/odyssey.dart';
import '../events/odyssey_content.dart';
import '../services/auth_service.dart';
import 'account_screen.dart';
import 'odyssey_screen.dart';

class EventsScreen extends StatefulWidget {
  const EventsScreen({super.key});

  @override
  State<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends State<EventsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<EventsController>().refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final events = context.watch<EventsController>();
    final signedIn = context.watch<AuthService>().isSignedIn;
    final progress = events.odyssey;
    final available = odysseyAvailable();

    return Scaffold(
      appBar: AppBar(title: const Text('События')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          _OdysseyCard(
            progress: progress,
            available: available,
            signedIn: signedIn,
            onOpen: () => _open(context, signedIn),
          ),
          const SizedBox(height: 20),
          _RewardCard(unlocked: progress.rewardUnlocked, scheme: scheme),
          const SizedBox(height: 20),
          Text(
            'Текст: Гомер, «Одиссея», перевод Томо Маретича, издание 1915 года '
            '(Public Domain Mark 1.0). Иллюстрации: Уотерхаус, Бёклин, Ластман '
            'и Пинтуриккьо — репродукции Wikimedia Commons, public domain.',
            style: TextStyle(
                fontSize: 11.5,
                height: 1.4,
                color: scheme.onSurface.withValues(alpha: 0.55)),
          ),
        ],
      ),
    );
  }

  /// Событие требует аккаунт: прогресс и награда закрепляются за человеком, а
  /// не за устройством. Гостя ведём на вход, а не показываем пустой экран.
  void _open(BuildContext context, bool signedIn) {
    if (!signedIn) {
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const AccountScreen()),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const OdysseyScreen()),
    );
  }
}

class _OdysseyCard extends StatelessWidget {
  const _OdysseyCard({
    required this.progress,
    required this.available,
    required this.signedIn,
    required this.onOpen,
  });

  final OdysseyProgress progress;
  final bool available;
  final bool signedIn;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final percent = (progress.fraction * 100).round();

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Stack(
        children: [
          Positioned.fill(
            child: Image.asset(
              OdysseyContent.coverAsset,
              fit: BoxFit.cover,
              color: Colors.black.withValues(alpha: 0.45),
              colorBlendMode: BlendMode.darken,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 26, 20, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.event_outlined,
                        size: 16, color: Color(0xFFF2CA81)),
                    const SizedBox(width: 6),
                    Text(
                      available ? 'До 1 сентября 2026' : 'Событие завершено',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                        color: Color(0xFFF2CA81),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                const Text('Одиссея',
                    style: TextStyle(
                        fontSize: 34,
                        fontWeight: FontWeight.bold,
                        color: Colors.white)),
                const SizedBox(height: 8),
                const Text(
                  'Путь от острова Калипсо до Итаки: 24 песни на сербской '
                  'кириллице, перевод слова по нажатию и семь классических '
                  'иллюстраций.',
                  style: TextStyle(
                      fontSize: 14, height: 1.4, color: Color(0xFFE7DDCB)),
                ),
                const SizedBox(height: 18),
                if (!available)
                  const Text('Приём новых участников закрыт',
                      style: TextStyle(color: Color(0xFFE7DDCB)))
                else ...[
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFF2CA81),
                      foregroundColor: const Color(0xFF251A12),
                    ),
                    icon: Icon(signedIn
                        ? Icons.auto_stories_outlined
                        : Icons.lock_outline),
                    label: Text(!signedIn
                        ? 'Войти и участвовать'
                        : progress.rewardUnlocked
                            ? 'Перечитать'
                            : percent > 0
                                ? 'Продолжить · $percent%'
                                : 'Начать путешествие'),
                    onPressed: onOpen,
                  ),
                  if (!signedIn) ...[
                    const SizedBox(height: 8),
                    const Text(
                      'Только для зарегистрированных: аккаунт хранит прогресс '
                      'и закрепляет награду.',
                      style: TextStyle(fontSize: 12, color: Color(0xFFCFC2AC)),
                    ),
                  ],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RewardCard extends StatelessWidget {
  const _RewardCard({required this.unlocked, required this.scheme});

  final bool unlocked;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.25)),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 130,
            decoration: const BoxDecoration(
              color: Color(0xFFEFE3CF),
              image: DecorationImage(
                image: AssetImage(OdysseyContent.helmetsAsset),
                repeat: ImageRepeat.repeat,
                alignment: Alignment.topLeft,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Награда · Спартанские шлемы',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: scheme.onSurface)),
                const SizedBox(height: 6),
                Text(
                  unlocked
                      ? 'Награда получена: фон доступен в настройках чтения '
                          'любой книги.'
                      : 'Закройте все 24 песни, чтобы открыть фон читалки.',
                  style: TextStyle(
                      fontSize: 13,
                      height: 1.35,
                      color: scheme.onSurface.withValues(alpha: 0.75)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
