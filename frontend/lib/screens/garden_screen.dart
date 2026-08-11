import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/garden.dart';
import '../services/api_client.dart';
import '../services/garden_service.dart';

/// Башта Читавука — сад за занятия сербским.
///
/// Динары считает сервер, экран только показывает и просит. Рост между
/// ответами досчитывается на месте (см. `models/garden.dart`), поэтому за
/// цветком видно, как он поднимается, а не «стало больше после перезахода».
class GardenScreen extends StatefulWidget {
  const GardenScreen({super.key});

  @override
  State<GardenScreen> createState() => _GardenScreenState();
}

class _GardenScreenState extends State<GardenScreen> {
  late final GardenService _service =
      GardenService(context.read<ApiClient>());

  GardenState? _state;
  String _error = '';
  bool _busy = false;
  int? _watering;
  Timer? _tick;
  Timer? _resync;

  @override
  void initState() {
    super.initState();
    _load();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    // Сверка с сервером: часы клиента и начисления за это время.
    _resync = Timer.periodic(const Duration(minutes: 1), (_) => _load());
  }

  @override
  void dispose() {
    _tick?.cancel();
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
      if (mounted) setState(() => _state = state);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _onBed(int slot, GardenPlant? plant) {
    if (_busy) return;
    final state = _state;
    if (state == null) return;

    if (plant == null) {
      _openShop(slot);
      return;
    }
    final growth = projectedGrowth(plant, DateTime.now().difference(state.fetchedAt));
    final species = state.speciesOf(plant.species);
    if (isBlooming(growth) && species != null) {
      _speak(species);
      return;
    }
    setState(() => _watering = slot);
    Timer(const Duration(milliseconds: 2400), () {
      if (mounted) setState(() => _watering = null);
    });
    _act(() => _service.water(slot));
  }

  /// Распустившийся цветок говорит по-сербски и называет свою тему.
  void _speak(GardenSpecies species) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(species.serbian,
                style: Theme.of(context).textTheme.headlineSmall),
            Text(species.russian,
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 16),
            Text(species.phrase,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            Text('Тема: ${species.theme}',
                style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }

  void _openShop(int slot) {
    final state = _state;
    if (state == null) return;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Продавница семена'),
              subtitle: const Text('магазин семян'),
              trailing: Text('${state.coins}'),
            ),
            for (final species in state.catalog)
              ListTile(
                enabled: state.coins >= species.price,
                leading: _Seed(index: state.catalog.indexOf(species)),
                title: Text(species.serbian),
                subtitle: Text('${species.russian} · ${species.theme}'),
                trailing: Text('${species.price}'),
                onTap: () {
                  Navigator.pop(context);
                  _act(() => _service.plant(slot, species.id));
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = _state;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Башта Читавука'),
        actions: [
          IconButton(
            tooltip: 'Найти садовода',
            icon: const Icon(Icons.search),
            onPressed: state == null
                ? null
                : () => showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      showDragHandle: true,
                      builder: (_) => _GardenerSearch(
                        service: _service,
                        catalog: state.catalog,
                      ),
                    ),
          ),
        ],
      ),
      body: state == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error, textAlign: TextAlign.center),
                    ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  if (_error.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_error,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ),
                  _Wallet(state: state),
                  const SizedBox(height: 16),
                  _Scene(
                    state: state,
                    watering: _watering,
                    onBed: _onBed,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Нажми на пустую лунку, чтобы посадить, на росток — чтобы '
                    'полить, на цветок — чтобы он заговорил.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  const SizedBox(height: 24),
                  _Earnings(state: state),
                  const SizedBox(height: 24),
                  _Profile(
                    state: state,
                    busy: _busy,
                    onSave: (nickname, isPublic) =>
                        _act(() => _service.saveProfile(nickname, isPublic)),
                  ),
                ],
              ),
            ),
    );
  }
}

class _Wallet extends StatelessWidget {
  const _Wallet({required this.state});

  final GardenState state;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const _Gardener(frame: 0, scale: 0.42),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${state.coins}', style: text.headlineSmall),
                  Text('цветни динари', style: text.bodySmall),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('×${state.speed.toStringAsFixed(1)}',
                    style: text.titleLarge),
                Text('брзина раста', style: text.bodySmall),
                const SizedBox(height: 6),
                Text('${state.bloomed} процветало', style: text.bodySmall),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Scene extends StatelessWidget {
  const _Scene({required this.state, required this.watering, required this.onBed});

  final GardenState state;
  final int? watering;
  final void Function(int slot, GardenPlant? plant) onBed;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final perRow = width < 380 ? 3 : (width < 640 ? 4 : 6);
    final rows = bedRows(state.slots, perRow);
    final bySlot = {for (final plant in state.plants) plant.slot: plant};
    final elapsed = DateTime.now().difference(state.fetchedAt);

    return ClipRRect(
      borderRadius: BorderRadius.circular(20),
      child: Container(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Column(
          children: [
            for (final row in rows)
              SizedBox(
                height: 150,
                child: Stack(
                  children: [
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 14,
                      child: Container(
                        color: Theme.of(context)
                            .colorScheme
                            .onSurface
                            .withValues(alpha: 0.16),
                      ),
                    ),
                    for (var index = 0; index < row.length; index++)
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 14,
                        top: 0,
                        child: Align(
                          alignment: Alignment(
                            row.length == 1
                                ? 0
                                : -1 + 2 * index / (row.length - 1),
                            1,
                          ),
                          child: _Bed(
                            slot: row[index],
                            plant: bySlot[row[index]],
                            state: state,
                            elapsed: elapsed,
                            watering: watering == row[index],
                            onTap: () => onBed(row[index], bySlot[row[index]]),
                          ),
                        ),
                      ),
                    if (watering != null && row.contains(watering))
                      Positioned(
                        bottom: 6,
                        left: 0,
                        right: 0,
                        child: Align(
                          alignment: Alignment(
                            row.length == 1
                                ? 0
                                : -1 + 2 * row.indexOf(watering!) / (row.length - 1),
                            1,
                          ),
                          child: const _Gardener(scale: 0.38, animate: true),
                        ),
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

class _Bed extends StatelessWidget {
  const _Bed({
    required this.slot,
    required this.plant,
    required this.state,
    required this.elapsed,
    required this.watering,
    required this.onTap,
  });

  final int slot;
  final GardenPlant? plant;
  final GardenState state;
  final Duration elapsed;
  final bool watering;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final species = plant == null ? null : state.speciesOf(plant!.species);
    final growth = plant == null ? null : projectedGrowth(plant!, elapsed);

    return SizedBox(
      width: 78,
      height: 132,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          alignment: Alignment.bottomCenter,
          children: [
            if (growth == null || species == null)
              Container(
                width: 34,
                height: 10,
                decoration: BoxDecoration(
                  color:
                      Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
              )
            else if (showsSeed(growth))
              _Seed(index: state.catalog.indexWhere((s) => s.id == species.id))
            else
              _Plant(slot: slot, species: species, growth: growth),
            if (watering)
              const Positioned(bottom: 30, child: _Drops()),
          ],
        ),
      ),
    );
  }
}

class _Plant extends StatefulWidget {
  const _Plant({required this.slot, required this.species, required this.growth});

  final int slot;
  final GardenSpecies species;
  final double growth;

  @override
  State<_Plant> createState() => _PlantState();
}

class _PlantState extends State<_Plant> with SingleTickerProviderStateMixin {
  late final ({double seconds, double tilt, double phase}) _sway =
      swayFor(widget.slot);
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: (_sway.seconds * 1000).round()),
  )..repeat(reverse: true);

  @override
  void initState() {
    super.initState();
    // Соседние грядки качаются вразнобой: одинаковая фаза выглядит как
    // судорога по всему полю, а не как ветер.
    _controller.value = _sway.phase;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final height = 118 * growthHeight(widget.growth) / 100;
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) => Transform.rotate(
        angle: (_controller.value * 2 - 1) * _sway.tilt * 3.14159 / 180,
        alignment: Alignment.bottomCenter,
        child: child,
      ),
      child: AnimatedContainer(
        duration: const Duration(seconds: 1),
        curve: Curves.linear,
        height: height,
        alignment: Alignment.bottomCenter,
        child: Image.asset(
          'assets/imgs/garden/plant_${widget.species.id}.webp',
          fit: BoxFit.contain,
          alignment: Alignment.bottomCenter,
        ),
      ),
    );
  }
}

class _Seed extends StatelessWidget {
  const _Seed({required this.index});

  final int index;

  @override
  Widget build(BuildContext context) {
    const cell = 24.0;
    final safe = index < 0 ? 0 : index;
    return SizedBox(
      width: cell,
      height: cell,
      child: ClipRect(
        child: OverflowBox(
          maxWidth: cell * 4,
          alignment: Alignment(4 == 1 ? 0 : -1 + 2 * safe / 3, 0),
          child: Image.asset(
            'assets/imgs/garden/garden_seeds.webp',
            width: cell * 4,
            height: cell,
            fit: BoxFit.fill,
          ),
        ),
      ),
    );
  }
}

/// Читавук с лейкой: лист из восьми кадров, кадр 150×202.
class _Gardener extends StatefulWidget {
  const _Gardener({this.frame = 0, this.scale = 1, this.animate = false});

  final int frame;
  final double scale;
  final bool animate;

  @override
  State<_Gardener> createState() => _GardenerState();
}

class _GardenerState extends State<_Gardener> {
  static const _frames = 8;
  static const _width = 150.0;
  static const _height = 202.0;

  int _frame = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _frame = widget.frame;
    if (widget.animate) {
      _timer = Timer.periodic(const Duration(milliseconds: 140), (_) {
        if (mounted) setState(() => _frame = (_frame + 1) % _frames);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: _width * widget.scale,
      height: _height * widget.scale,
      child: FittedBox(
        fit: BoxFit.contain,
        child: SizedBox(
          width: _width,
          height: _height,
          child: ClipRect(
            child: OverflowBox(
              maxWidth: _width * _frames,
              alignment: Alignment(-1 + 2 * _frame / (_frames - 1), 0),
              child: Image.asset(
                'assets/imgs/garden/citavuk_garden.webp',
                width: _width * _frames,
                height: _height,
                fit: BoxFit.fill,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Drops extends StatelessWidget {
  const _Drops();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var index = 0; index < 3; index++)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Container(
              width: 5,
              height: 5,
              decoration: const BoxDecoration(
                color: Color(0xFF56B4F2),
                shape: BoxShape.circle,
              ),
            ),
          ),
      ],
    );
  }
}

class _Earnings extends StatelessWidget {
  const _Earnings({required this.state});

  final GardenState state;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Данашња зарада',
                style: Theme.of(context).textTheme.titleMedium),
            Text('заработок за сегодня',
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            for (final line in state.earnings) ...[
              Row(
                children: [
                  Expanded(child: Text(line.title)),
                  Text('${line.today} / ${line.cap}'),
                ],
              ),
              const SizedBox(height: 4),
              LinearProgressIndicator(
                value: line.cap == 0 ? 0 : (line.today / line.cap).clamp(0, 1),
              ),
              const SizedBox(height: 10),
            ],
          ],
        ),
      ),
    );
  }
}

class _Profile extends StatefulWidget {
  const _Profile({required this.state, required this.busy, required this.onSave});

  final GardenState state;
  final bool busy;
  final void Function(String nickname, bool isPublic) onSave;

  @override
  State<_Profile> createState() => _ProfileState();
}

class _ProfileState extends State<_Profile> {
  late final TextEditingController _nickname =
      TextEditingController(text: widget.state.nickname);
  late bool _public = widget.state.isPublic;

  @override
  void dispose() {
    _nickname.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Име баштована',
                style: Theme.of(context).textTheme.titleMedium),
            Text('имя садовода', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            TextField(
              controller: _nickname,
              maxLength: 24,
              decoration: const InputDecoration(border: OutlineInputBorder()),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _public,
              onChanged: (value) => setState(() => _public = value),
              title: const Text('Отвори башту комшијама'),
              subtitle: const Text(
                  'Сад появится в поиске и таблице садоводов. Пока выключено — '
                  'сад видишь только ты.'),
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: widget.busy
                  ? null
                  : () => widget.onSave(_nickname.text.trim(), _public),
              child: const Text('Сачувај'),
            ),
          ],
        ),
      ),
    );
  }
}

class _GardenerSearch extends StatefulWidget {
  const _GardenerSearch({required this.service, required this.catalog});

  final GardenService service;
  final List<GardenSpecies> catalog;

  @override
  State<_GardenerSearch> createState() => _GardenerSearchState();
}

class _GardenerSearchState extends State<_GardenerSearch> {
  final TextEditingController _query = TextEditingController();
  String _species = '';
  List<GardenerCard> _found = const [];
  bool _busy = false;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _search();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  void _schedule() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 320), _search);
  }

  Future<void> _search() async {
    setState(() => _busy = true);
    try {
      final found = await widget.service
          .search(query: _query.text.trim(), species: _species);
      if (mounted) setState(() => _found = found);
    } on ApiException {
      if (mounted) setState(() => _found = const []);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Нађи баштована',
              style: Theme.of(context).textTheme.titleMedium),
          Text('найти садовода по имени или по тому, что растёт',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          TextField(
            controller: _query,
            onChanged: (_) => _schedule(),
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: 'имя садовода',
              prefixIcon: Icon(Icons.search),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                ChoiceChip(
                  label: const Text('что угодно'),
                  selected: _species.isEmpty,
                  onSelected: (_) {
                    setState(() => _species = '');
                    _search();
                  },
                ),
                for (final species in widget.catalog)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: ChoiceChip(
                      label: Text(species.serbian),
                      selected: _species == species.id,
                      onSelected: (_) {
                        setState(() => _species = species.id);
                        _search();
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (_busy) const LinearProgressIndicator(),
          if (!_busy && _found.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('Нема никога — никого не нашлось.'),
            ),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: _found.length,
              itemBuilder: (context, index) {
                final row = _found[index];
                final growing = row.growing
                    .map((id) =>
                        widget.catalog
                            .where((item) => item.id == id)
                            .map((item) => item.serbian)
                            .firstOrNull ??
                        id)
                    .join(', ');
                return ListTile(
                  title: Text(row.nickname),
                  subtitle: Text(growing),
                  trailing: Text('${row.bloomed} / ${row.plants}'),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
