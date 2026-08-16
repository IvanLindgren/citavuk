/// Путешествие: карта пяти сербских городов.
///
/// Над каждым знакомым местом стоит сербское слово; нажимаешь — Читавук
/// показывает слова, фразы и разговор, которые там понадобятся.
///
/// Карта — не обязательная часть раздела. Тайлы берутся у MapTiler по ключу из
/// `--dart-define=MAPTILER_KEY=...`; ключа нет — раздел показывает те же места
/// списком. Слова к аптеке нужны и тому, у кого карта не открылась.
library;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:latlong2/latlong.dart';

import '../theme/app_theme.dart';
import 'content.dart';
import 'overpass.dart';
import 'place_sheet.dart';

/// Ключ тайлов. Пусто — карта не показывается, остаётся список мест.
const String mapKey = String.fromEnvironment('MAPTILER_KEY');

class TravelScreen extends StatefulWidget {
  const TravelScreen({super.key});

  @override
  State<TravelScreen> createState() => _TravelScreenState();
}

class _TravelScreenState extends State<TravelScreen> {
  final MapController _map = MapController();

  TravelBundle? _bundle;
  String _error = '';
  City? _city;
  TravelScript _script = TravelScript.cyrillic;
  bool _asking = false;

  /// Список всех мест вместо карты: и когда карты нет, и по кнопке.
  bool _listing = mapKey.isEmpty;

  @override
  void initState() {
    super.initState();
    TravelContent.instance.load().then((bundle) {
      if (!mounted) return;
      setState(() {
        _bundle = bundle;
        _city = bundle.cities.isEmpty ? null : bundle.cities.first;
      });
    }).catchError((Object error) {
      if (mounted) setState(() => _error = 'Не удалось открыть справочник мест.');
    });
  }

  Future<void> _tap(LatLng point) async {
    final bundle = _bundle;
    if (bundle == null || _asking) return;
    setState(() => _asking = true);
    try {
      final found = await askOverpass(point.latitude, point.longitude, bundle.kinds);
      if (!mounted) return;
      if (found == null) {
        _say('Тут Читавук не разглядел знакомого места.');
        return;
      }
      // Незнакомое место — тоже место: поздороваться, спросить цену и
      // попрощаться нужно везде.
      _openPlace(found.kind.isEmpty ? 'anywhere' : found.kind, found.name);
    } on TravelUnavailable {
      if (mounted) _say('Карта мест сейчас не отвечает. Попробуй через минуту.');
    } finally {
      if (mounted) setState(() => _asking = false);
    }
  }

  void _openPlace(String kindId, String title) {
    final bundle = _bundle;
    if (bundle == null) return;
    final kind = bundle.kindById(kindId);
    final content = bundle.contentOf(kindId);
    if (kind == null || content == null) {
      _say('Про это место Читавук пока молчит.');
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => PlaceSheet(
        kind: kind,
        content: content,
        title: title,
        script: _script,
      ),
    );
  }

  void _say(String text) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final bundle = _bundle;
    final city = _city;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Путовање'),
        actions: [
          IconButton(
            tooltip: _script == TravelScript.cyrillic
                ? 'Показать латиницей'
                : 'Показать кириллицей',
            onPressed: () => setState(() => _script =
                _script == TravelScript.cyrillic
                    ? TravelScript.latin
                    : TravelScript.cyrillic),
            icon: Text(
              _script == TravelScript.cyrillic ? 'Ћ' : 'Ć',
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.bold),
            ),
          ),
          if (mapKey.isNotEmpty)
            IconButton(
              tooltip: _listing ? 'Показать карту' : 'Все места списком',
              onPressed: () => setState(() => _listing = !_listing),
              icon: Icon(_listing ? Icons.map_outlined : Icons.list),
            ),
        ],
      ),
      body: bundle == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : Text(_error),
            )
          : Column(
              children: [
                _cityBar(bundle),
                Expanded(
                  child: _listing || city == null
                      ? _places(bundle)
                      : _mapView(bundle, city),
                ),
                if (bundle.reviewedAt.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 6, 16, 10),
                    child: Text(
                      'Содержимое сверено ${bundle.reviewedAt}. Цены, '
                      'расписания и часы работы проверяй перед поездкой.',
                      style: Theme.of(context).textTheme.bodySmall,
                      textAlign: TextAlign.center,
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _cityBar(TravelBundle bundle) => SizedBox(
        height: 54,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          children: [
            for (final city in bundle.cities)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(inScript(city.sr, _script)),
                  selected: _city?.id == city.id,
                  onSelected: (_) {
                    setState(() => _city = city);
                    if (!_listing) {
                      // Смена города — это перелёт, а не новая карта: иначе
                      // спиннер «строим город» останется поверх навсегда.
                      _map.move(LatLng(city.lat, city.lon), city.zoom);
                    }
                  },
                ),
              ),
          ],
        ),
      );

  Widget _mapView(TravelBundle bundle, City city) {
    return Stack(
      children: [
        FlutterMap(
          mapController: _map,
          options: MapOptions(
            initialCenter: LatLng(city.lat, city.lon),
            initialZoom: city.zoom,
            minZoom: 11,
            maxZoom: 18,
            onTap: (_, point) => _tap(point),
          ),
          children: [
            TileLayer(
              urlTemplate:
                  'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=$mapKey',
              userAgentPackageName: 'ru.citavuk.app',
              retinaMode: RetinaMode.isHighDensity(context),
            ),
            MarkerLayer(
              markers: [
                for (final pin in city.pins)
                  Marker(
                    point: LatLng(pin.lat, pin.lon),
                    width: 132,
                    height: 54,
                    alignment: Alignment.topCenter,
                    child: _Pin(
                      pin: pin,
                      script: _script,
                      icon: bundle.kindById(pin.kind)?.icon ?? '',
                      onTap: () => _openPlace(pin.kind, inScript(pin.sr, _script)),
                    ),
                  ),
              ],
            ),
            const RichAttributionWidget(
              attributions: [
                TextSourceAttribution('MapTiler'),
                TextSourceAttribution('OpenStreetMap'),
              ],
            ),
          ],
        ),
        if (_asking)
          const Positioned(
            top: 12,
            left: 0,
            right: 0,
            child: Center(child: _Looking()),
          ),
        Positioned(
          left: 12,
          right: 12,
          bottom: 12,
          child: Text(
            'Нажми на любое здание — Читавук скажет, что там понадобится.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              shadows: const [
                Shadow(color: Color(0xCCFFFFFF), blurRadius: 6),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Весь справочник списком: слова к аптеке нужны и без карты.
  Widget _places(TravelBundle bundle) {
    final groups = {
      'place': 'Заведения',
      'road': 'В дороге',
      'basic': 'Везде',
    };
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        if (mapKey.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'Карта в этой сборке не открывается — вот все места списком.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        for (final entry in groups.entries) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Text(entry.value,
                style: const TextStyle(
                    fontFamily: 'Lora',
                    fontSize: 20,
                    fontWeight: FontWeight.bold)),
          ),
          for (final kind in bundle.kinds.where((k) => k.group == entry.key))
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: _Icon(name: kind.icon),
              title: Text(inScript(kind.sr, _script)),
              subtitle: Text(kind.ru),
              onTap: () => _openPlace(kind.id, ''),
            ),
        ],
      ],
    );
  }
}

/// Метка города: значок и сербское название над ним.
class _Pin extends StatelessWidget {
  const _Pin({
    required this.pin,
    required this.script,
    required this.icon,
    required this.onTap,
  });

  final CityPin pin;
  final TravelScript script;
  final String icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xF2FFFFFF),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: SerbColors.serbRed, width: 1.5),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _Icon(name: icon, size: 14),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(
                    inScript(pin.sr, script),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: SerbColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(width: 2, height: 8, color: SerbColors.serbRed),
        ],
      ),
    );
  }
}

/// Значок типа места. Нарисованные, а не эмодзи: эмодзи в каждой системе свои
/// и не знают ни бурека, ни джезвы.
class _Icon extends StatelessWidget {
  const _Icon({required this.name, this.size = 24});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    if (name.isEmpty) {
      return Icon(Icons.place_outlined, size: size);
    }
    return SvgPicture.asset(
      'assets/travel/icons/$name.svg',
      width: size,
      height: size,
      colorFilter: ColorFilter.mode(
        Theme.of(context).colorScheme.onSurface,
        BlendMode.srcIn,
      ),
      placeholderBuilder: (_) => Icon(Icons.place_outlined, size: size),
    );
  }
}

class _Looking extends StatelessWidget {
  const _Looking();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(color: Color(0x33000000), blurRadius: 8),
        ],
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 10),
          Text('Смотрим, что это за место'),
        ],
      ),
    );
  }
}
