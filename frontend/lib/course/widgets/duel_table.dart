/// Стол матча: кто уже дописывает пятую фразу, кто думает над первой, а кто
/// закрыл приложение.
///
/// Текста чужих переводов здесь нет и быть не может — только число
/// переведённых фраз. Это главная часть азарта в комнате: без стола ожидание
/// выглядит как зависший экран.
library;

import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import '../services/duel_room_service.dart';

class DuelTable extends StatelessWidget {
  const DuelTable({super.key, required this.room, required this.sentences});

  final DuelRoom room;
  final int sentences;

  @override
  Widget build(BuildContext context) {
    final places = {
      for (var i = 0; i < room.standings.length; i++) room.standings[i].id: i,
    };
    final rows = room.seated.toList()
      ..sort((a, b) {
        final byPlace =
            (places[a.id] ?? 99).compareTo(places[b.id] ?? 99);
        return byPlace != 0 ? byPlace : b.score.compareTo(a.score);
      });
    final free = room.seats - rows.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final player in rows)
          _Seat(player: player, room: room, sentences: sentences),
        for (var index = 0; index < (free < 0 ? 0 : free); index++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                  style: BorderStyle.solid,
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.chair_outlined,
                      size: 18,
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                  const SizedBox(width: 10),
                  // Гибкий: при увеличенном системном шрифте подпись длиннее
                  // ряда, и без этого она вылезала полосой за край стола.
                  Flexible(
                    child: Text('Свободное место',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurfaceVariant)),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Seat extends StatelessWidget {
  const _Seat({
    required this.player,
    required this.room,
    required this.sentences,
  });

  final DuelPlayer player;
  final DuelRoom room;
  final int sentences;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final done = switch (room.phase) {
      DuelPhase.translate => player.ready,
      DuelPhase.vote => player.voted,
      _ => false,
    };

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 300),
        opacity: player.joined ? 1 : 0.55,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            color: player.you
                ? SerbColors.serbRed.withValues(alpha: 0.06)
                : null,
            border: Border.all(
              color: player.you
                  ? SerbColors.serbRed.withValues(alpha: 0.45)
                  : theme.colorScheme.outlineVariant,
            ),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor:
                    player.isMachine ? SerbColors.indigo : SerbColors.serbRed,
                child: player.isMachine
                    ? const Icon(Icons.smart_toy_outlined,
                        size: 16, color: SerbColors.parchment)
                    : Text(
                        _initial(player.name),
                        style: const TextStyle(
                          fontFamily: 'Lora',
                          fontWeight: FontWeight.bold,
                          color: SerbColors.parchment,
                        ),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            player.name,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                        ),
                        if (player.you)
                          Text(' · ты',
                              overflow: TextOverflow.clip,
                              softWrap: false,
                              style: theme.textTheme.bodySmall),
                        if (player.host)
                          const Padding(
                            padding: EdgeInsets.only(left: 4),
                            child: Icon(Icons.workspace_premium,
                                size: 14, color: SerbColors.gold),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    _status(context, done),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text('${player.score}',
                  style: const TextStyle(
                    fontFamily: 'Lora',
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  )),
              if (done)
                const Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Icon(Icons.check_circle,
                      size: 20, color: SerbColors.success),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _status(BuildContext context, bool done) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall;
    if (!player.joined) return Text('Ещё не подтвердил', style: muted);
    if (player.isMachine) return Text('Переводчик', style: muted);
    if (done) {
      return Text('Готов',
          style: muted?.copyWith(
              color: SerbColors.success, fontWeight: FontWeight.bold));
    }
    if (room.phase == DuelPhase.translate) {
      final progress = player.progress.clamp(0, sentences);
      return Row(
        children: [
          for (var index = 0; index < sentences; index++)
            Expanded(
              child: Container(
                height: 5,
                margin: const EdgeInsets.only(right: 3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(3),
                  color: index < progress
                      ? SerbColors.serbRed
                      : theme.colorScheme.surfaceContainerHighest,
                ),
              ),
            ),
          Icon(Icons.edit_outlined,
              size: 12, color: theme.colorScheme.onSurfaceVariant),
        ],
      );
    }
    if (room.phase == DuelPhase.vote) return Text('Выбирает…', style: muted);
    return Text('За столом', style: muted);
  }
}

String _initial(String name) {
  final clean = name.trim();
  return clean.isEmpty ? '?' : clean.characters.first.toUpperCase();
}
