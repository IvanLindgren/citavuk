/// Путешествие: карта пяти сербских городов.
///
/// Над каждым знакомым местом стоит сербское слово; нажимаешь — Читавук
/// показывает слова, фразы и разговор, которые там понадобятся.
///
/// Карта — не обязательная часть раздела. Тайлы берутся у MapTiler по ключу из
/// `--dart-define=MAPTILER_KEY=...`; ключа нет — раздел показывает те же места
/// списком. Слова к аптеке нужны и тому, у кого карта не открылась.
///
/// Подписаны не только достопримечательности. Рукописные метки города — это
/// два десятка мест на весь Белград, а нужны те самые пекара, апотека и
/// мењачница, мимо которых ходишь каждый день. Их приносит Overpass по
/// показанному куску карты: в растровом тайле тегов нет, а на сайте ту же
/// работу делает векторный тайл.
library;

import 'dart:async';

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

/// С какого приближения Читавук подписывает заведения. Дальше это уже не
/// город, а его силуэт: подписи слипаются, а ответ Overpass растёт до
/// мегабайтов на пустом месте.
const double _placesZoom = 15;

/// Второстепенные типы появляются ещё ближе — тем же порядком, что и на сайте:
/// сначала пекарня и аптека, лавка ключника — когда до неё дошли.
const double _detailZoom = 16.5;

/// Место рядом с рукописной меткой города второй раз не подписывается.
const double _pinNearM = 45;

/// Карта постояла — можно спрашивать. Overpass общий, и запрос на каждом кадре
/// прокрутки он встречает отказом.
const Duration _settleDelay = Duration(milliseconds: 700);

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

  /// Заведения в показанном куске города.
  List<FoundPlace> _found = const [];
  bool _scanning = false;

  /// Кусок, про который уже спросили: сдвиг внутри него нового не покажет.
  LatLngBounds? _covered;
  Timer? _settle;

  /// Насколько близко карта: см. `_syncZoom`.
  bool _close = false;
  bool _detailed = false;

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

  @override
  void dispose() {
    _settle?.cancel();
    super.dispose();
  }

  /// Карту подвинули: ждём, пока она остановится, и спрашиваем, что вокруг.
  void _onCamera(MapCamera camera) {
    _syncZoom(camera);
    _settle?.cancel();
    _settle = Timer(_settleDelay, _lookAround);
  }

  /// Насколько мы близко. Отдельными признаками, а не числом: перерисовка на
  /// каждом кадре прокрутки не нужна, меняется только подпись внизу и набор
  /// мелких типов.
  void _syncZoom(MapCamera camera) {
    final close = camera.zoom >= _placesZoom;
    final detailed = camera.zoom >= _detailZoom;
    if (close == _close && detailed == _detailed) return;
    setState(() {
      _close = close;
      _detailed = detailed;
    });
  }

  /// Знакомые заведения в границах экрана.
  ///
  /// Молчание при неудаче намеренно: карта уже показана, подписи — добавка к
  /// ней, и ругаться в ответ на обычную прокрутку не за что.
  Future<void> _lookAround() async {
    final bundle = _bundle;
    if (!mounted || bundle == null || _listing || _scanning) return;
    // Карта могла открыться сразу вблизи: onMapReady приходит раньше первого
    // onPositionChanged, и без этого подпись внизу звала бы приблизить уже
    // приближённую карту.
    final camera = _map.camera;
    _syncZoom(camera);
    if (camera.zoom < _placesZoom) {
      _covered = null;
      if (_found.isNotEmpty) setState(() => _found = const []);
      return;
    }

    final bounds = camera.visibleBounds;
    if (_covered?.containsBounds(bounds) ?? false) return;

    setState(() => _scanning = true);
    try {
      final places = await findPlaces(
        bounds.south,
        bounds.west,
        bounds.north,
        bounds.east,
        bundle.kinds,
      );
      if (!mounted) return;
      _covered = bounds;
      setState(() => _found = places);
    } on TravelUnavailable {
      // Оба зеркала молчат. Метки города остаются, нажатие тоже работает.
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  /// Что рисовать метками: мелкие типы — только вблизи, и ничего поверх
  /// рукописных меток города.
  Iterable<FoundPlace> _nearby(TravelBundle bundle, City city) {
    const metres = Distance();
    return _found.where((place) {
      final rank = bundle.kindById(place.kind)?.rank ?? 3;
      if (rank >= 3 && !_detailed) return false;
      for (final pin in city.pins) {
        final away = metres.as(LengthUnit.Meter, LatLng(place.lat, place.lon),
            LatLng(pin.lat, pin.lon));
        if (away < _pinNearM) return false;
      }
      return true;
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
              onPressed: () {
                setState(() => _listing = !_listing);
                if (!_listing) _lookAround();
              },
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
            onMapReady: _lookAround,
            onPositionChanged: (camera, _) => _onCamera(camera),
          ),
          children: [
            TileLayer(
              urlTemplate:
                  'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=$mapKey',
              userAgentPackageName: 'ru.citavuk.app',
              retinaMode: RetinaMode.isHighDensity(context),
            ),
            // Найденные места лежат ниже рукописных: у метки города есть своё
            // имя, и закрывать её словом «музеј» незачем.
            MarkerLayer(
              markers: [
                for (final place in _nearby(bundle, city))
                  Marker(
                    point: LatLng(place.lat, place.lon),
                    width: 122,
                    height: 46,
                    alignment: Alignment.topCenter,
                    child: _Pin(
                      label: inScript(
                          bundle.kindById(place.kind)?.sr ?? '', _script),
                      icon: bundle.kindById(place.kind)?.icon ?? '',
                      accent: SerbColors.indigo,
                      compact: true,
                      onTap: () => _openPlace(place.kind, place.name),
                    ),
                  ),
              ],
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
                      label: inScript(pin.sr, _script),
                      icon: bundle.kindById(pin.kind)?.icon ?? '',
                      accent: SerbColors.serbRed,
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
        if (_asking || _scanning)
          Positioned(
            top: 12,
            left: 0,
            right: 0,
            child: Center(
              child: _Looking(
                text: _asking
                    ? 'Смотрим, что это за место'
                    : 'Смотрим, что тут вокруг',
              ),
            ),
          ),
        Positioned(
          left: 12,
          right: 12,
          bottom: 12,
          child: Text(
            _close
                ? 'Нажми на любое здание — Читавук скажет, что там понадобится.'
                : 'Приблизь карту — Читавук подпишет пекарни, аптеки и кафе.',
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

/// Метка на карте: значок и сербское слово над точкой.
///
/// Одна и та же и для рукописных мест города, и для найденных заведений —
/// разными их делают цвет и размер. Красным подписано имя («Калемегдан»),
/// синим — тип («пекара»), и по цвету видно, что именно написано.
class _Pin extends StatelessWidget {
  const _Pin({
    required this.label,
    required this.icon,
    required this.accent,
    required this.onTap,
    this.compact = false,
  });

  final String label;
  final String icon;
  final Color accent;
  final VoidCallback onTap;

  /// Найденных мест на экране бывает под сотню — им подпись помельче.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: EdgeInsets.symmetric(
                horizontal: compact ? 6 : 8, vertical: compact ? 3 : 4),
            decoration: BoxDecoration(
              color: const Color(0xF2FFFFFF),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: accent, width: compact ? 1 : 1.5),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _Icon(name: icon, size: compact ? 12 : 14),
                SizedBox(width: compact ? 4 : 5),
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: compact ? 11 : 12,
                      fontWeight: FontWeight.bold,
                      color: SerbColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Container(width: 2, height: compact ? 6 : 8, color: accent),
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
  const _Looking({required this.text});

  final String text;

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
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 10),
          Text(text),
        ],
      ),
    );
  }
}
