import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../garden/garden_panels.dart';
import '../garden/garden_scene.dart';
import '../garden/house_room.dart';
import '../garden/strings.dart';
import '../models/garden.dart';
import '../services/api_client.dart';
import '../services/garden_service.dart';
import 'materials_screen.dart';
import 'public_garden_screen.dart';

/// Башта Читавука — сад за занятия сербским.
///
/// Динары и воду считает сервер, экран только показывает и просит. Рост между
/// ответами досчитывается на месте (см. `models/garden.dart`), поэтому за
/// цветком видно, как он поднимается, а не «стало больше после перезахода».
class GardenScreen extends StatefulWidget {
  const GardenScreen({super.key});

  @override
  State<GardenScreen> createState() => _GardenScreenState();
}

class _GardenScreenState extends State<GardenScreen> {
  late final GardenService _service = GardenService(context.read<ApiClient>());

  GardenState? _state;
  String _error = '';
  bool _busy = false;
  int? _watering;

  /// Выбранное семя: пока оно выбрано, нажатие на пустую грядку сажает сразу.
  String? _seed;
  bool _inHouse = false;
  Timer? _resync;

  @override
  void initState() {
    super.initState();
    _load();
    // Сверка с сервером: часы клиента и начисления за это время.
    _resync = Timer.periodic(const Duration(minutes: 1), (_) => _load());
  }

  @override
  void dispose() {
    _resync?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final state = await _service.load();
      if (!mounted) return;
      setState(() {
        _state = state;
        _error = '';
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _act(Future<GardenState> Function() action) async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final state = await action();
      if (!mounted) return;
      setState(() => _state = state);
      final cut = state.cut;
      if (cut != null) {
        await showHarvest(context, cut: cut, state: state);
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Нажатие на грядку. Пустая — посадить, распустившаяся — срезать, остальные
  /// — полить. Одно нажатие делает то, что человек и так собирался.
  void _onBed(int slot, GardenPlant? plant) {
    if (_busy) return;
    final state = _state;
    if (state == null) return;

    if (plant == null) {
      final seed = _seed;
      if (seed != null) {
        _act(() => _service.plant(slot, seed));
      } else {
        showSeedShop(
          context,
          state: state,
          busy: _busy,
          onPick: (species) => _act(() => _service.plant(slot, species)),
        );
      }
      return;
    }

    final growth =
        projectedGrowth(plant, DateTime.now().difference(state.fetchedAt));
    if (isBlooming(growth)) {
      _act(() => _service.cut(slot));
      return;
    }

    setState(() => _watering = slot);
    Timer(const Duration(milliseconds: 2400), () {
      if (mounted) setState(() => _watering = null);
    });
    _act(() => _service.water(slot));
  }

  /// Набрать воды. Река течёт только в тот день, когда были занятия, — отказ
  /// сервера здесь обычное дело, и человек должен понять почему.
  void _onRiver() {
    final state = _state;
    if (state == null || _busy) return;
    if (!state.river) {
      _say('${Garden.riverDry.sr} — сегодня ещё не было занятий.');
      return;
    }
    if (state.water >= state.waterCap) {
      _say('Лейка полная.');
      return;
    }
    if (state.filledToday >= state.fillLimit) {
      _say('Сегодня воду уже набирали.');
      return;
    }
    _act(_service.fill);
  }

  void _say(String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;

    if (_inHouse && state != null) {
      return HouseRoom(
        decorations: state.decorations,
        catalog: state.decorationCatalog,
        coins: state.coins,
        busy: _busy,
        onBuy: (decoration) => _act(() => _service.buyDecoration(decoration)),
        onBooks: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => const MaterialsScreen()),
        ),
        onClose: () => setState(() => _inHouse = false),
      );
    }

    return Scaffold(
      body: state == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : _ErrorNote(text: _error, onRetry: _load),
            )
          : Stack(
              children: [
                Positioned.fill(
                  child: GardenScene(
                    slots: state.slots,
                    plants: state.plants,
                    catalog: state.catalog,
                    fetchedAt: state.fetchedAt,
                    watering: _watering,
                    decorations: state.decorations,
                    weather: state.weather,
                    river: state.river,
                    onBed: _onBed,
                    onRiver: _onRiver,
                    onHouse: () => setState(() => _inHouse = true),
                  ),
                ),
                SafeArea(
                  child: Column(
                    children: [
                      _Hud(
                        state: state,
                        busy: _busy,
                        onExit: () => Navigator.of(context).maybePop(),
                      ),
                      if (state.task != null) _TaskBadge(task: state.task!),
                      if (_error.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: _ErrorNote(text: _error, onRetry: _load),
                        ),
                      const Spacer(),
                      if (_seed != null) _SeedHint(
                        species: state.speciesOf(_seed!),
                        onCancel: () => setState(() => _seed = null),
                      ),
                      _Toolbar(
                        state: state,
                        onSeeds: () => showSeedShop(
                          context,
                          state: state,
                          busy: _busy,
                          onPick: (species) => setState(() => _seed = species),
                        ),
                        onYard: () => showYardShop(
                          context,
                          state: state,
                          busy: _busy,
                          onBuy: (decoration) =>
                              _act(() => _service.buyDecoration(decoration)),
                        ),
                        onHerbarium: () => showHerbarium(context, state: state),
                        onEarnings: () => showEarnings(context, state: state),
                        onNeighbours: () => showGardeners(
                          context,
                          service: _service,
                          state: state,
                          onProfile: (nickname, isPublic) async {
                            Navigator.pop(context);
                            await _act(() =>
                                _service.saveProfile(nickname, isPublic));
                          },
                          onOpen: (nickname) {
                            Navigator.pop(context);
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => PublicGardenScreen(
                                  service: _service,
                                  nickname: nickname,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

/// Плашка состояния: динары, вода и сколько уже распустилось.
class _Hud extends StatelessWidget {
  const _Hud({required this.state, required this.busy, required this.onExit});

  final GardenState state;
  final bool busy;
  final VoidCallback onExit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
      child: Row(
        children: [
          _Plaque(
            child: IconButton(
              onPressed: onExit,
              icon: const Icon(Icons.arrow_back),
              tooltip: 'Выйти из сада',
              visualDensity: VisualDensity.compact,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _Plaque(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _Value(
                      icon: Icons.local_florist,
                      value: '${state.coins}',
                      label: Garden.coins.ru,
                      busy: busy,
                    ),
                    _Value(
                      icon: Icons.water_drop_outlined,
                      value: '${state.water}/${state.waterCap}',
                      label: Garden.can.ru,
                      busy: busy,
                      dim: state.water == 0,
                    ),
                    _Value(
                      icon: Icons.emoji_events_outlined,
                      value: '${state.bloomed}',
                      label: Garden.bloomed.ru,
                      busy: busy,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Value extends StatelessWidget {
  const _Value({
    required this.icon,
    required this.value,
    required this.label,
    required this.busy,
    this.dim = false,
  });

  final IconData icon;
  final String value;
  final String label;
  final bool busy;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    final colour = dim
        ? Theme.of(context).colorScheme.outline
        : const Color(0xFF6B4423);
    return Tooltip(
      message: label,
      child: Opacity(
        opacity: busy ? 0.6 : 1,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: colour),
            const SizedBox(width: 5),
            // Гибкий: три счётчика делят одну плашку, и при увеличенном
            // системном шрифте «3/5» с иконкой выходит за её край.
            Flexible(
              child: Text(
                value,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.bold, color: colour),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Задание дня. Одна строка: что сделать и сколько осталось.
class _TaskBadge extends StatelessWidget {
  const _TaskBadge({required this.task});

  final GardenTask task;

  @override
  Widget build(BuildContext context) {
    final phrase = taskPhrase(task.kind, task.target);
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
      child: _Plaque(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              Icon(
                task.done ? Icons.check_circle : Icons.assignment_outlined,
                size: 18,
                color: task.done
                    ? const Color(0xFF3F7A43)
                    : const Color(0xFF6B4423),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      phrase.sr,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF3F2A1D),
                      ),
                    ),
                    Text(
                      task.done
                          ? '${Garden.done.ru} · +${task.reward}'
                          : '${phrase.ru} · ${task.progress} из ${task.target}',
                      style: const TextStyle(
                          fontSize: 11, color: Color(0xFF7A5B43)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Выбранное семя: подсказка, куда его теперь сажать.
class _SeedHint extends StatelessWidget {
  const _SeedHint({required this.species, required this.onCancel});

  final GardenSpecies? species;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final species = this.species;
    if (species == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
      child: _Plaque(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 6, 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '${species.serbian}: нажми на пустую грядку',
                  style: const TextStyle(color: Color(0xFF3F2A1D)),
                ),
              ),
              IconButton(
                onPressed: onCancel,
                icon: const Icon(Icons.close, size: 18),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Пояс с инструментами: всё, что не делается нажатием по саду.
class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.state,
    required this.onSeeds,
    required this.onYard,
    required this.onHerbarium,
    required this.onEarnings,
    required this.onNeighbours,
  });

  final GardenState state;
  final VoidCallback onSeeds;
  final VoidCallback onYard;
  final VoidCallback onHerbarium;
  final VoidCallback onEarnings;
  final VoidCallback onNeighbours;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
      child: _Plaque(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _Tool(
                icon: Icons.grass,
                label: Garden.shop.ru,
                onTap: onSeeds,
              ),
              _Tool(
                icon: Icons.deck_outlined,
                label: 'украшения сада',
                onTap: onYard,
              ),
              _Tool(
                icon: Icons.auto_stories_outlined,
                label: Garden.herbarium.ru,
                onTap: onHerbarium,
              ),
              _Tool(
                icon: Icons.savings_outlined,
                label: Garden.earnings.ru,
                onTap: onEarnings,
              ),
              _Tool(
                icon: Icons.groups_outlined,
                label: Garden.neighbours.ru,
                onTap: onNeighbours,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tool extends StatelessWidget {
  const _Tool({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: Icon(icon, color: const Color(0xFF6B4423)),
      tooltip: label,
    );
  }
}

/// Деревянная табличка: весь интерфейс сада написан на ней.
class _Plaque extends StatelessWidget {
  const _Plaque({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF5DFAA),
        border: Border.all(color: const Color(0xFF8C5B37), width: 2),
        boxShadow: const [
          BoxShadow(color: Color(0xFF5A3B22), offset: Offset(0, 3)),
        ],
      ),
      child: child,
    );
  }
}

class _ErrorNote extends StatelessWidget {
  const _ErrorNote({required this.text, required this.onRetry});

  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(child: Text(text)),
          TextButton(onPressed: onRetry, child: const Text('Ещё раз')),
        ],
      ),
    );
  }
}
