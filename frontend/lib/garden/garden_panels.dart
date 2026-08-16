/// Окна Башты: семена, украшения, гербарий, заработок, соседи и таблица.
///
/// Каждое окно отвечает на один вопрос человека: «что посадить», «что я уже
/// вырастил», «откуда взялись динары», «кто ещё тут есть». Поэтому это шторки,
/// а не вкладки одного экрана: сад остаётся на виду.
library;

import 'package:flutter/material.dart';

import '../course/services/course_content_loader.dart';
import '../course/screens/trainer_screen.dart';
import '../models/garden.dart';
import '../services/garden_service.dart';
import 'pixel.dart';
import 'strings.dart';

/// Семя из атласа `garden_seeds.webp`: восемь кадров 48×96.
class SeedIcon extends StatelessWidget {
  const SeedIcon({super.key, required this.index, this.size = 32});

  final int index;
  final double size;

  @override
  Widget build(BuildContext context) => SpriteFrame(
        asset: '$gardenArt/garden_seeds.webp',
        frame: index,
        frames: 8,
        width: size,
        height: size * 2,
      );
}

/// Магазин семян. Цена сравнивается с кошельком прямо в строке: недоступное
/// семя видно, но не нажимается — иначе непонятно, к чему копить.
Future<void> showSeedShop(
  BuildContext context, {
  required GardenState state,
  required bool busy,
  required void Function(String species) onPick,
}) {
  return _sheet(
    context,
    title: Garden.shop,
    trailing: _Coins(state.coins),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final species in state.catalog)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: SeedIcon(index: state.catalog.indexOf(species), size: 26),
            title: Text(species.serbian),
            subtitle: Text('${species.russian} · ${species.theme}'),
            trailing: FilledButton.tonal(
              onPressed: busy || state.coins < species.price
                  ? null
                  : () {
                      Navigator.pop(context);
                      onPick(species.id);
                    },
              child: Text('${species.price}'),
            ),
          ),
      ],
    ),
  );
}

/// Украшения двора. Комнатные продаются в самой комнате: покупать диван, стоя
/// на грядке, — это список товаров, а не дом.
Future<void> showYardShop(
  BuildContext context, {
  required GardenState state,
  required bool busy,
  required void Function(String decoration) onBuy,
}) {
  final yard =
      state.decorationCatalog.where((item) => !item.inHouse).toList();
  return _sheet(
    context,
    title: const Phrase('Украси башту', 'украшения сада'),
    trailing: _Coins(state.coins),
    child: yard.isEmpty
        ? const Text('Пока украшать нечем.')
        : Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final item in yard)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(item.serbian),
                  subtitle: Text(item.russian),
                  trailing: state.owns(item.id)
                      ? Text(Garden.owned.sr)
                      : FilledButton.tonal(
                          onPressed: busy || state.coins < item.price
                              ? null
                              : () {
                                  Navigator.pop(context);
                                  onBuy(item.id);
                                },
                          child: Text('${item.price}'),
                        ),
                ),
            ],
          ),
  );
}

/// Гербарий: что уже срезано. Ради него цветок и срезают — иначе жалко.
Future<void> showHerbarium(
  BuildContext context, {
  required GardenState state,
}) {
  return _sheet(
    context,
    title: Garden.herbarium,
    child: state.herbarium.isEmpty
        ? const Text(
            'Гербарий пуст. Срежь распустившийся цветок — он останется здесь.',
          )
        : Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final item in state.herbarium)
                Builder(builder: (context) {
                  final species = state.speciesOf(item.species);
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: PixelImage(
                      '$gardenArt/plant_${item.species}.webp',
                      width: 28,
                      height: 38,
                    ),
                    title: Text(species?.serbian ?? item.species),
                    subtitle: Text(species?.russian ?? ''),
                    trailing: Text('×${item.count}',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                  );
                }),
            ],
          ),
  );
}

/// Заработок за сегодня: за что именно капнули динары и где потолок.
Future<void> showEarnings(
  BuildContext context, {
  required GardenState state,
}) {
  return _sheet(
    context,
    title: Garden.earnings,
    trailing: _Coins(state.todayCoins),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final line in state.earnings) ...[
          Row(
            children: [
              Expanded(child: Text(line.title)),
              Text(
                line.cap > 0 ? '${line.today} из ${line.cap}' : '${line.today}',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (line.cap > 0)
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (line.today / line.cap).clamp(0, 1).toDouble(),
                minHeight: 6,
              ),
            ),
          const SizedBox(height: 12),
        ],
        Text(
          'Всего заработано: ${state.earnedTotal} ${coinWord(state.earnedTotal)}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 6),
        Text(
          '${Garden.speed.ru}: ×${state.speed.toStringAsFixed(2)}',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    ),
  );
}

/// Соседи: таблица лучших, поиск по имени и своё имя садовода.
class GardenersPanel extends StatefulWidget {
  const GardenersPanel({
    super.key,
    required this.service,
    required this.state,
    required this.onProfile,
    required this.onOpen,
  });

  final GardenService service;
  final GardenState state;
  final Future<void> Function(String nickname, bool isPublic) onProfile;
  final void Function(String nickname) onOpen;

  @override
  State<GardenersPanel> createState() => _GardenersPanelState();
}

class _GardenersPanelState extends State<GardenersPanel> {
  late final TextEditingController _name =
      TextEditingController(text: widget.state.nickname);
  final TextEditingController _query = TextEditingController();

  List<GardenerCard> _board = [];
  List<GardenerCard>? _found;
  bool _busy = false;
  late bool _public = widget.state.isPublic;

  @override
  void initState() {
    super.initState();
    // Пустая таблица — не повод для ошибки на пол-экрана: окно нужно ради
    // своего имени и поиска, а лидерборд в нём гость.
    widget.service.leaderboard().then((rows) {
      if (mounted) setState(() => _board = rows);
    }).ignore();
  }

  @override
  void dispose() {
    _name.dispose();
    _query.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    setState(() => _busy = true);
    try {
      final rows = await widget.service.search(query: _query.text.trim());
      if (mounted) setState(() => _found = rows);
    } catch (_) {
      if (mounted) setState(() => _found = const []);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _found ?? _board;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: _name,
          maxLength: 24,
          decoration: InputDecoration(
            labelText: '${Garden.myName.sr} — ${Garden.myName.ru}',
            counterText: '',
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _public,
          title: Text(Garden.openGarden.sr),
          subtitle: Text(Garden.openGarden.ru),
          onChanged: (value) => setState(() => _public = value),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            onPressed: _busy
                ? null
                : () => widget.onProfile(_name.text.trim(), _public),
            child: Text(Garden.save.sr),
          ),
        ),
        const Divider(height: 28),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _query,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                  labelText: Garden.find.ru,
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              onPressed: _busy ? null : _search,
              icon: const Icon(Icons.search),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (rows.isEmpty)
          Text('${Garden.nobody.sr} — ${Garden.nobody.ru}')
        else
          for (final row in rows)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: _found == null
                  ? Text('${rows.indexOf(row) + 1}',
                      style: const TextStyle(fontWeight: FontWeight.bold))
                  : const Icon(Icons.local_florist_outlined),
              title: Text(row.nickname),
              subtitle: Text(
                '${Garden.bloomed.ru}: ${row.bloomed} · ${Garden.growing.ru}: ${row.plants}',
              ),
              onTap: () => widget.onOpen(row.nickname),
            ),
      ],
    );
  }
}

/// Что дал срез: награда, фраза цветка и его тема в тренажёрке.
Future<void> showHarvest(
  BuildContext context, {
  required GardenCut cut,
  required GardenState state,
}) {
  final species = state.speciesOf(cut.species);
  return _sheet(
    context,
    title: Garden.cut,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            PixelImage(
              '$gardenArt/plant_${cut.species}.webp',
              width: 44,
              height: 60,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(species?.serbian ?? cut.species,
                      style: Theme.of(context).textTheme.titleMedium),
                  Text(species?.russian ?? '',
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            Text('+${cut.coins}',
                style: const TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        if (cut.first) ...[
          const SizedBox(height: 12),
          const Text('Этот цветок попал в гербарий впервые.'),
        ],
        if (species != null) ...[
          const SizedBox(height: 16),
          Text(species.phrase,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonalIcon(
              onPressed: () => _openTrainer(context, species.topic),
              icon: const Icon(Icons.school_outlined),
              label: Text('${Garden.practise.sr} — ${species.theme}'),
            ),
          ),
        ],
      ],
    ),
  );
}

Future<void> _openTrainer(BuildContext context, String topicId) async {
  final navigator = Navigator.of(context);
  final messenger = ScaffoldMessenger.of(context);
  navigator.pop();
  try {
    final course = await CourseContentLoader().load();
    await navigator.push(MaterialPageRoute<void>(
      builder: (_) => TrainerScreen(course: course, initialTopicId: topicId),
    ));
  } catch (_) {
    messenger.showSnackBar(
      const SnackBar(content: Text('Не удалось открыть Тренажёрку.')),
    );
  }
}

class _Coins extends StatelessWidget {
  const _Coins(this.coins);

  final int coins;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.local_florist, size: 18, color: Color(0xFFC9A24B)),
        const SizedBox(width: 4),
        Text('$coins', style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}

Future<void> _sheet(
  BuildContext context, {
  required Phrase title,
  required Widget child,
  Widget? trailing,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title.sr,
                          style: Theme.of(context).textTheme.titleLarge),
                      Text(title.ru,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                if (trailing != null) trailing,
              ],
            ),
            const SizedBox(height: 16),
            child,
          ],
        ),
      ),
    ),
  );
}

/// Открыть окно соседей: своё имя, поиск и таблица в одной шторке.
Future<void> showGardeners(
  BuildContext context, {
  required GardenService service,
  required GardenState state,
  required Future<void> Function(String nickname, bool isPublic) onProfile,
  required void Function(String nickname) onOpen,
}) {
  return _sheet(
    context,
    title: Garden.neighbours,
    child: GardenersPanel(
      service: service,
      state: state,
      onProfile: onProfile,
      onOpen: onOpen,
    ),
  );
}
