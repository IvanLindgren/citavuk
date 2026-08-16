import 'package:flutter/material.dart';

import '../garden/garden_scene.dart';
import '../garden/strings.dart';
import '../models/garden.dart';
import '../services/api_client.dart';
import '../services/garden_service.dart';

/// Чужой сад.
///
/// Смотреть можно всем, у кого сад открыт, а действие тут одно — полить. За
/// полив соседу платят, но не бесконечно: сервер держит дневной потолок, и
/// повторное нажатие честно говорит, что на сегодня хватит.
class PublicGardenScreen extends StatefulWidget {
  const PublicGardenScreen({
    super.key,
    required this.service,
    required this.nickname,
  });

  final GardenService service;
  final String nickname;

  @override
  State<PublicGardenScreen> createState() => _PublicGardenScreenState();
}

class _PublicGardenScreenState extends State<PublicGardenScreen> {
  PublicGarden? _garden;
  String _error = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final garden = await widget.service.openGarden(widget.nickname);
      if (mounted) {
        setState(() {
          _garden = garden;
          _error = '';
        });
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  Future<void> _help() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final reward = await widget.service.help(widget.nickname);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            reward > 0
                ? 'Полил соседу: +$reward ${coinWord(reward)}'
                : 'Полил соседу. Сегодня за это уже платили.',
          ),
        ),
      );
      await _load();
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final garden = _garden;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.nickname),
        actions: [
          if (garden != null && garden.canWater)
            IconButton(
              onPressed: _busy ? null : _help,
              icon: const Icon(Icons.water_drop_outlined),
              tooltip: '${Garden.helpNeighbour.sr} — ${Garden.helpNeighbour.ru}',
            ),
        ],
      ),
      body: garden == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : Text(_error),
            )
          : Column(
              children: [
                Expanded(
                  child: GardenScene(
                    slots: garden.slots,
                    plants: garden.plants,
                    catalog: garden.catalog,
                    fetchedAt: garden.fetchedAt,
                    decorations: garden.decorations,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Text('${Garden.bloomed.ru}: ${garden.bloomed}'),
                      const Spacer(),
                      if (garden.canWater)
                        FilledButton.icon(
                          onPressed: _busy ? null : _help,
                          icon: const Icon(Icons.water_drop_outlined),
                          label: Text(Garden.helpNeighbour.sr),
                        ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
