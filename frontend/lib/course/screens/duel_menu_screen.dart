/// С кем играть в перевод.
///
/// Три двери: своя комната по коду, подбор соперника и матч с машиной. Раньше
/// в приложении была только машина, и позвать друга было нечем.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../services/api_client.dart';
import '../../services/auth_service.dart';
import '../services/duel_room_service.dart';
import '../widgets/duel_arena.dart';
import 'duel_room_screen.dart';
import 'translation_duel_screen.dart';

class DuelMenuScreen extends StatefulWidget {
  const DuelMenuScreen({super.key});

  @override
  State<DuelMenuScreen> createState() => _DuelMenuScreenState();
}

class _DuelMenuScreenState extends State<DuelMenuScreen> {
  late final DuelRoomService _service =
      DuelRoomService(context.read<ApiClient>());

  static const _levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  String _level = 'A2';
  String _direction = 'sr-ru';
  int _seats = 2;
  final TextEditingController _name = TextEditingController();
  final TextEditingController _code = TextEditingController();

  String _error = '';
  String _busy = '';

  /// Подбор идёт в фоне: пока ищем, экран остаётся живым.
  Timer? _search;
  DuelQueueState? _queue;

  @override
  void initState() {
    super.initState();
    _service.restore().then((_) async {
      final saved = await _service.savedName();
      if (mounted && saved.isNotEmpty && _name.text.isEmpty) _name.text = saved;
    });
  }

  @override
  void dispose() {
    _search?.cancel();
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _act(String label, Future<void> Function() run) async {
    setState(() {
      _busy = label;
      _error = '';
    });
    try {
      await run();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  void _enterRoom(String code) {
    _search?.cancel();
    Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
      builder: (_) => DuelRoomScreen(code: code, name: _name.text.trim()),
    ));
  }

  Future<void> _createRoom() => _act('room', () async {
        final room = await _service.create(
          level: _level,
          direction: _direction,
          seats: _seats,
          name: _name.text.trim(),
        );
        if (mounted) _enterRoom(room.code);
      });

  Future<void> _joinRoom() {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty) return Future.value();
    return _act('join', () async {
      final room = await _service.join(code, name: _name.text.trim());
      if (mounted) _enterRoom(room.code);
    });
  }

  /// Подбор: очередь опрашивается раз в две секунды, пока не найдётся комната.
  Future<void> _startSearch() => _act('search', () async {
        final state = await _service.enterQueue(
          level: _level,
          direction: _direction,
          seats: _seats,
          name: _name.text.trim(),
        );
        if (!mounted) return;
        setState(() => _queue = state);
        if (state.room.isNotEmpty) {
          _enterRoom(state.room);
          return;
        }
        _search?.cancel();
        _search = Timer.periodic(const Duration(seconds: 2), (_) async {
          try {
            final next = await _service.queueState();
            if (!mounted) return;
            setState(() => _queue = next);
            if (next.room.isNotEmpty) _enterRoom(next.room);
          } catch (_) {
            // Молчим: следующий опрос через две секунды.
          }
        });
      });

  Future<void> _stopSearch() async {
    _search?.cancel();
    _search = null;
    try {
      await _service.leaveQueue();
    } catch (_) {
      // Не нашли себя в очереди — значит, её уже нет.
    }
    if (mounted) setState(() => _queue = null);
  }

  void _playSolo() {
    Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
      builder: (_) => const TranslationDuelScreen(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final account = context.watch<AuthService>().account;
    final queue = _queue;

    return Scaffold(
      appBar: AppBar(title: const Text('Дуэль переводов')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const DuelFighter(pose: DuelPose.taunt, width: 76),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('С кем играешь',
                        style: theme.textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    const Text(
                      'Три раунда по пять фраз. Переводы сравнивает Gemma, '
                      'а если она промолчит — вы сами.',
                      style: TextStyle(height: 1.45),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          if (account == null) ...[
            TextField(
              controller: _name,
              maxLength: 24,
              decoration: const InputDecoration(
                labelText: 'Как тебя звать за столом',
                counterText: '',
              ),
            ),
            const SizedBox(height: 12),
          ],
          const Text('Уровень сербского',
              style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final level in _levels)
                ChoiceChip(
                  label: Text(level),
                  selected: _level == level,
                  onSelected: (_) => setState(() => _level = level),
                ),
            ],
          ),
          const SizedBox(height: 18),
          const Text('Направление', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'sr-ru', label: Text('Сербский → русский')),
              ButtonSegment(value: 'ru-sr', label: Text('Русский → сербский')),
            ],
            selected: {_direction},
            onSelectionChanged: (value) =>
                setState(() => _direction = value.first),
            showSelectedIcon: false,
          ),
          const SizedBox(height: 18),
          const Text('Мест за столом',
              style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 2, label: Text('2')),
              ButtonSegment(value: 3, label: Text('3')),
              ButtonSegment(value: 4, label: Text('4')),
            ],
            selected: {_seats},
            onSelectionChanged: (value) => setState(() => _seats = value.first),
            showSelectedIcon: false,
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(_error),
            ),
          ],
          const SizedBox(height: 24),
          if (queue != null && queue.waiting) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const SizedBox(
                      width: 26,
                      height: 26,
                      child: CircularProgressIndicator(strokeWidth: 3),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      queue.searching > 1
                          ? 'Ищем соперника. Сейчас в поиске: ${queue.searching}'
                          : 'Ищем соперника',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleMedium,
                    ),
                    if (queue.ripe) ...[
                      const SizedBox(height: 8),
                      const Text(
                        'Никто не откликается. Можно сыграть с машиной, а комната '
                        'останется открытой.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 10),
                      FilledButton.tonal(
                        onPressed: _playSolo,
                        child: const Text('Играть с DeepL'),
                      ),
                    ],
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _stopSearch,
                      child: const Text('Отменить поиск'),
                    ),
                  ],
                ),
              ),
            ),
          ] else ...[
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: _busy.isNotEmpty ? null : _startSearch,
              icon: _busy == 'search'
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.search),
              label: const Text('Найти соперника'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(50)),
              onPressed: _busy.isNotEmpty ? null : _createRoom,
              icon: const Icon(Icons.meeting_room_outlined),
              label: const Text('Своя комната по коду'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(50)),
              onPressed: _busy.isNotEmpty ? null : _playSolo,
              icon: const Icon(Icons.smart_toy_outlined),
              label: const Text('Играть с переводчиком'),
            ),
          ],
          const SizedBox(height: 26),
          const Divider(),
          const SizedBox(height: 14),
          const Text('Позвали в комнату?',
              style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [
                    LengthLimitingTextInputFormatter(8),
                    FilteringTextInputFormatter.allow(RegExp('[a-zA-Z0-9]')),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Код комнаты',
                    isDense: true,
                  ),
                  onSubmitted: (_) => _joinRoom(),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton(
                onPressed: _busy.isNotEmpty ? null : _joinRoom,
                child: const Text('Войти'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
