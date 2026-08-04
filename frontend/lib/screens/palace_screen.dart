import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../palace/scenes.dart';
import '../services/palace_store.dart';
import '../services/user_db.dart';
import '../utils/uuid.dart';
import '../widgets/wolf_mascot.dart';

/// Дворец памяти.
///
/// Приём древний: чтобы запомнить список, его раскладывают по предметам
/// знакомого помещения и потом «проходят» по нему мысленно. Слова чужого языка
/// ложатся на него хорошо — вспоминается не строчка из списка, а место.
///
/// Комнаты приходят картинками из `assets/palace/`, а координаты предметов —
/// из `palace/scenes.dart`. И то и другое выгружено из React-версии одним
/// скриптом, поэтому рисунок и места разойтись не могут.
class PalaceScreen extends StatefulWidget {
  const PalaceScreen({super.key});

  @override
  State<PalaceScreen> createState() => _PalaceScreenState();
}

class _PalaceScreenState extends State<PalaceScreen> {
  List<Palace> _palaces = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final palaces = await PalaceStore.instance.list();
    if (!mounted) return;
    setState(() {
      _palaces = palaces;
      _loading = false;
    });
  }

  Future<void> _create() async {
    final scene = await showModalBottomSheet<PalaceScene>(
      context: context,
      showDragHandle: true,
      builder: (_) => const _ScenePicker(),
    );
    if (scene == null || !mounted) return;

    final palace = Palace(
      uuid: newUuid(),
      name: scene.title,
      sceneId: scene.id,
      pins: const {},
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );
    await PalaceStore.instance.save(palace);
    if (!mounted) return;
    await _open(palace);
  }

  Future<void> _open(Palace palace) async {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => PalaceRoomScreen(palaceId: palace.uuid)),
    );
    await _load();
  }

  Future<void> _delete(Palace palace) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Снести «${palace.name}»?'),
        content: const Text('Развеска слов пропадёт. Сами слова останутся.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Оставить'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Снести'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await PalaceStore.instance.remove(palace.uuid);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Дворец памяти')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _create,
        icon: const Icon(Icons.add),
        label: const Text('Новая комната'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _palaces.isEmpty
              ? _empty(context)
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                  itemCount: _palaces.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, index) {
                    final palace = _palaces[index];
                    return _PalaceCard(
                      palace: palace,
                      onOpen: () => _open(palace),
                      onDelete: () => _delete(palace),
                    );
                  },
                ),
    );
  }

  Widget _empty(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const WolfSticker(asset: Wolf.ukaz, size: 140),
            const SizedBox(height: 20),
            Text(
              'Разложите слова по комнате',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            Text(
              'Слова запоминаются местом: на холодильник, на лампу, на стул. '
              'Потом достаточно мысленно пройти по комнате — и они всплывают '
              'сами, в том порядке, в каком вы их расставили.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _PalaceCard extends StatelessWidget {
  const _PalaceCard({
    required this.palace,
    required this.onOpen,
    required this.onDelete,
  });

  final Palace palace;
  final VoidCallback onOpen;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final scene = sceneById(palace.sceneId);
    final filled = palace.pins.length;
    final total = scene?.spots.length ?? 0;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (scene != null)
              AspectRatio(
                aspectRatio: sceneWidth / sceneHeight,
                child: SvgPicture.asset(scene.asset, fit: BoxFit.cover),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          palace.name,
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '$filled из $total мест занято',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Снести комнату',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: onDelete,
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

class _ScenePicker extends StatelessWidget {
  const _ScenePicker();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 4, 12),
            child: Text(
              'Выберите комнату',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          for (final scene in palaceScenes)
            Card(
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => Navigator.pop(context, scene),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    AspectRatio(
                      aspectRatio: sceneWidth / sceneHeight,
                      child: SvgPicture.asset(scene.asset, fit: BoxFit.cover),
                    ),
                    ListTile(
                      title: Text(scene.title),
                      subtitle: Text(
                          '${scene.subtitle} · ${scene.spots.length} мест'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Комната: развеска слов и обход.
class PalaceRoomScreen extends StatefulWidget {
  const PalaceRoomScreen({super.key, required this.palaceId});

  final String palaceId;

  @override
  State<PalaceRoomScreen> createState() => _PalaceRoomScreenState();
}

class _PalaceRoomScreenState extends State<PalaceRoomScreen> {
  Palace? _palace;
  List<Map<String, dynamic>> _words = const [];
  bool _loading = true;

  /// Предмет, подсвеченный перетаскиванием прямо сейчас.
  String? _hovered;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final palace = await PalaceStore.instance.byId(widget.palaceId);
    final words = await UserDb.instance.getAllVocabulary();
    if (!mounted) return;
    setState(() {
      _palace = palace;
      _words = words;
      _loading = false;
    });
  }

  Future<void> _pin(String spotId, PalacePin? pin) async {
    final palace = _palace;
    if (palace == null) return;
    final updated = withPin(palace, spotId, pin);
    setState(() => _palace = updated);
    await PalaceStore.instance.save(updated);
  }

  @override
  Widget build(BuildContext context) {
    final palace = _palace;
    final scene = palace == null ? null : sceneById(palace.sceneId);

    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (palace == null || scene == null) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Комната не найдена')),
      );
    }

    final placed = walkOrder(palace, scene.spots.map((s) => s.id).toList());

    return Scaffold(
      appBar: AppBar(
        title: Text(palace.name),
        actions: [
          IconButton(
            tooltip: 'Пройти по комнате',
            icon: const Icon(Icons.directions_walk),
            onPressed: placed.isEmpty
                ? null
                : () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            PalaceWalkScreen(palace: palace, scene: scene),
                      ),
                    ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: InteractiveViewer(
              maxScale: 3,
              child: _room(scene, palace),
            ),
          ),
          _wordStrip(context, palace),
        ],
      ),
    );
  }

  /// Комната: картинка и места поверх неё.
  ///
  /// Места кладутся долями от размера комнаты, а не пикселями: комната
  /// растягивается под экран, и абсолютные координаты уехали бы с предметов на
  /// первом же другом телефоне.
  Widget _room(PalaceScene scene, Palace palace) {
    return Center(
      child: AspectRatio(
        aspectRatio: sceneWidth / sceneHeight,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth;
            final height = constraints.maxHeight;
            return Stack(
              children: [
                Positioned.fill(
                  child: SvgPicture.asset(scene.asset, fit: BoxFit.fill),
                ),
                for (final spot in scene.spots)
                  Positioned(
                    left: spot.x / sceneWidth * width - 60,
                    top: spot.y / sceneHeight * height - 26,
                    width: 120,
                    height: 52,
                    child: _SpotTarget(
                      spot: spot,
                      pin: palace.pins[spot.id],
                      hovered: _hovered == spot.id,
                      onHover: (over) =>
                          setState(() => _hovered = over ? spot.id : null),
                      onDrop: (pin) => _pin(spot.id, pin),
                      onTap: () => _editSpot(spot, palace.pins[spot.id]),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }

  /// Полоса слов внизу: из неё слова перетаскиваются на предметы.
  Widget _wordStrip(BuildContext context, Palace palace) {
    final used = palace.pins.values.map((pin) => pin.word).toSet();
    final free = _words
        .where((word) => !used.contains((word['word'] as String?) ?? ''))
        .toList();

    return Container(
      height: 92,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest
            .withValues(alpha: 0.45),
        border: Border(
          top: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: free.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  _words.isEmpty
                      ? 'Слов пока нет. Отмечайте их в читалке — и они появятся здесь.'
                      : 'Все слова расставлены.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            )
          : ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              itemCount: free.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, index) {
                final row = free[index];
                final pin = PalacePin(
                  word: (row['word'] as String?) ?? '',
                  translation: (row['translation'] as String?) ?? '',
                  vocabId: (row['uuid'] as String?)?.isEmpty ?? true
                      ? null
                      : row['uuid'] as String,
                );
                return _DraggableWord(pin: pin);
              },
            ),
    );
  }

  /// Правка места руками — для тех, кто не хочет тащить, и для слов, которых
  /// в словаре нет.
  Future<void> _editSpot(PalaceSpot spot, PalacePin? current) async {
    final wordController = TextEditingController(text: current?.word ?? '');
    final translationController =
        TextEditingController(text: current?.translation ?? '');

    final result = await showDialog<PalacePin?>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${spot.label} — ${spot.ru}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: wordController,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'Слово по-сербски'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: translationController,
              decoration: const InputDecoration(labelText: 'Перевод'),
            ),
          ],
        ),
        actions: [
          if (current != null)
            TextButton(
              onPressed: () => Navigator.pop(ctx, const PalacePin(word: '', translation: '')),
              child: const Text('Убрать'),
            ),
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(
              ctx,
              PalacePin(
                word: wordController.text,
                translation: translationController.text,
                vocabId: current?.vocabId,
              ),
            ),
            child: const Text('Повесить'),
          ),
        ],
      ),
    );

    if (result != null) await _pin(spot.id, result);
  }
}

/// Слово, которое можно утащить на предмет.
class _DraggableWord extends StatelessWidget {
  const _DraggableWord({required this.pin});

  final PalacePin pin;

  @override
  Widget build(BuildContext context) {
    final chip = _WordChip(pin: pin);
    return Draggable<PalacePin>(
      data: pin,
      feedback: Material(
        color: Colors.transparent,
        child: Opacity(opacity: 0.9, child: _WordChip(pin: pin, dragging: true)),
      ),
      childWhenDragging: Opacity(opacity: 0.3, child: chip),
      child: chip,
    );
  }
}

class _WordChip extends StatelessWidget {
  const _WordChip({required this.pin, this.dragging = false});

  final PalacePin pin;
  final bool dragging;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: dragging ? scheme.primary : scheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.4)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            pin.word,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: dragging ? scheme.onPrimary : null,
            ),
          ),
          if (pin.translation.isNotEmpty)
            Text(
              pin.translation,
              style: TextStyle(
                fontSize: 11,
                color: dragging
                    ? scheme.onPrimary.withValues(alpha: 0.8)
                    : scheme.onSurfaceVariant,
              ),
            ),
        ],
      ),
    );
  }
}

/// Место в комнате: принимает слово перетаскиванием и открывает правку нажатием.
class _SpotTarget extends StatelessWidget {
  const _SpotTarget({
    required this.spot,
    required this.pin,
    required this.hovered,
    required this.onHover,
    required this.onDrop,
    required this.onTap,
  });

  final PalaceSpot spot;
  final PalacePin? pin;
  final bool hovered;
  final ValueChanged<bool> onHover;
  final ValueChanged<PalacePin> onDrop;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final occupied = pin != null;

    return DragTarget<PalacePin>(
      onWillAcceptWithDetails: (_) {
        onHover(true);
        return true;
      },
      onLeave: (_) => onHover(false),
      onAcceptWithDetails: (details) {
        onHover(false);
        onDrop(details.data);
      },
      builder: (context, candidate, __) {
        final active = hovered || candidate.isNotEmpty;
        return GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
            decoration: BoxDecoration(
              color: active
                  ? scheme.primary
                  : occupied
                      ? scheme.surface.withValues(alpha: 0.92)
                      : scheme.surface.withValues(alpha: 0.55),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: active
                    ? scheme.primary
                    : scheme.primary.withValues(alpha: occupied ? 0.55 : 0.25),
                width: active ? 2 : 1,
              ),
            ),
            child: FittedBox(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    occupied ? pin!.word : spot.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: occupied ? FontWeight.w700 : FontWeight.w400,
                      color: active
                          ? scheme.onPrimary
                          : occupied
                              ? scheme.onSurface
                              : scheme.onSurfaceVariant,
                    ),
                  ),
                  Text(
                    occupied ? spot.label : spot.ru,
                    style: TextStyle(
                      fontSize: 10,
                      color: active
                          ? scheme.onPrimary.withValues(alpha: 0.85)
                          : scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Обход комнаты: слова показываются в том порядке, в каком их расставили.
class PalaceWalkScreen extends StatefulWidget {
  const PalaceWalkScreen({
    super.key,
    required this.palace,
    required this.scene,
  });

  final Palace palace;
  final PalaceScene scene;

  @override
  State<PalaceWalkScreen> createState() => _PalaceWalkScreenState();
}

class _PalaceWalkScreenState extends State<PalaceWalkScreen> {
  late final List<PalaceStep> _steps = walkOrder(
    widget.palace,
    widget.scene.spots.map((spot) => spot.id).toList(),
  );

  int _index = 0;
  bool _revealed = false;

  PalaceSpot? get _spot {
    if (_index >= _steps.length) return null;
    for (final spot in widget.scene.spots) {
      if (spot.id == _steps[_index].spotId) return spot;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    if (_steps.isEmpty) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('В комнате пока ничего не развешано')),
      );
    }

    final done = _index >= _steps.length;
    final step = done ? null : _steps[_index];
    final spot = _spot;

    return Scaffold(
      appBar: AppBar(
        title: Text(done ? 'Комната пройдена' : '${_index + 1} из ${_steps.length}'),
      ),
      body: done ? _finished(context) : _card(context, step!, spot),
    );
  }

  Widget _card(BuildContext context, PalaceStep step, PalaceSpot? spot) {
    return Column(
      children: [
        Expanded(
          child: Stack(
            children: [
              Positioned.fill(
                child: SvgPicture.asset(widget.scene.asset, fit: BoxFit.contain),
              ),
              // Затемняем комнату целиком и подсвечиваем одно место: обход
              // держится на том, что внимание в каждый момент в одной точке.
              Positioned.fill(
                child: IgnorePointer(
                  child: Container(color: Colors.black.withValues(alpha: 0.45)),
                ),
              ),
              if (spot != null)
                LayoutBuilder(
                  builder: (context, constraints) {
                    // Картинка вписана целиком, поэтому её настоящий размер
                    // меньше отведённого: считаем его, иначе метка уедет.
                    final scale = (constraints.maxWidth / sceneWidth)
                        .clamp(0.0, constraints.maxHeight / sceneHeight);
                    final width = sceneWidth * scale;
                    final height = sceneHeight * scale;
                    final dx = (constraints.maxWidth - width) / 2;
                    final dy = (constraints.maxHeight - height) / 2;
                    return Positioned(
                      left: dx + spot.x * scale - 70,
                      top: dy + spot.y * scale - 30,
                      width: 140,
                      height: 60,
                      child: _Halo(label: spot.label, ru: spot.ru),
                    );
                  },
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            children: [
              Text(
                step.pin.word,
                style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              if (_revealed)
                Text(
                  step.pin.translation.isEmpty ? '—' : step.pin.translation,
                  style: Theme.of(context).textTheme.titleMedium,
                )
              else
                TextButton(
                  onPressed: () => setState(() => _revealed = true),
                  child: const Text('Показать перевод'),
                ),
              const SizedBox(height: 14),
              FilledButton(
                onPressed: () => setState(() {
                  _index++;
                  _revealed = false;
                }),
                child: Text(_index + 1 >= _steps.length ? 'Закончить' : 'Дальше'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _finished(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const WolfSticker(asset: Wolf.povtor, size: 150),
            const SizedBox(height: 20),
            Text('Комната пройдена',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 10),
            Text(
              'Пройдите её ещё раз завтра — маршрут тот же, и слова начнут '
              'всплывать раньше, чем вы дойдёте до места.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => setState(() {
                _index = 0;
                _revealed = false;
              }),
              child: const Text('Ещё раз'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Halo extends StatelessWidget {
  const _Halo({required this.label, required this.ru});

  final String label;
  final String ru;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.primary,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: scheme.primary.withValues(alpha: 0.6),
            blurRadius: 28,
            spreadRadius: 6,
          ),
        ],
      ),
      child: FittedBox(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label,
                style: TextStyle(
                    color: scheme.onPrimary, fontWeight: FontWeight.w700)),
            Text(ru,
                style: TextStyle(
                    fontSize: 11,
                    color: scheme.onPrimary.withValues(alpha: 0.85))),
          ],
        ),
      ),
    );
  }
}
