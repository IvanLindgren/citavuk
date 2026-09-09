part of 'book_reader_screen.dart';

/// Нижняя панель настроек чтения: шрифт, размер, межстрочный, трекинг,
/// bionic-режим и тема. Меняет глобальные настройки в реальном времени.
class ReaderSettingsSheet extends StatelessWidget {
  const ReaderSettingsSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final appSettings = context.watch<AppSettings>();
    final s = appSettings.reader;

    void set(ReaderSettings next) => context.read<AppSettings>().update(next);

    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _sheetHandleBar(context, scheme),
              const SizedBox(height: 8),
              Text('Настройки чтения',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: scheme.onSurface)),
              const SizedBox(height: 16),
              _label('Режим чтения', scheme),
              Wrap(
                spacing: 8,
                children: ReaderFlow.values
                    .map((flow) => ChoiceChip(
                          label: Text(flow.label),
                          selected: s.flow == flow,
                          onSelected: (_) => set(s.copyWith(flow: flow)),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 16),
              _label('Шрифт', scheme),
              Wrap(
                spacing: 8,
                children: ReaderFont.values
                    .map((f) => ChoiceChip(
                          label: Text(f.label),
                          selected: s.font == f,
                          onSelected: (_) => set(s.copyWith(font: f)),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 14),
              _slider(
                context,
                'Размер: ${s.fontSize.round()}',
                s.fontSize,
                14,
                32,
                (v) => set(s.copyWith(fontSize: v)),
              ),
              _slider(
                context,
                'Межстрочный: ${s.lineHeight.toStringAsFixed(2)}',
                s.lineHeight,
                1.2,
                2.4,
                (v) => set(s.copyWith(lineHeight: v)),
              ),
              _slider(
                context,
                'Трекинг: ${s.letterSpacing.toStringAsFixed(1)}',
                s.letterSpacing,
                0,
                3,
                (v) => set(s.copyWith(letterSpacing: v)),
              ),
              const SizedBox(height: 6),
              _label('Выделение основы слова (быстрое чтение)', scheme),
              Wrap(
                spacing: 8,
                children: BionicLevel.values
                    .map((b) => ChoiceChip(
                          label: Text(b.label),
                          selected: s.bionic == b,
                          onSelected: (_) => set(s.copyWith(bionic: b)),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 16),
              _label('Тема', scheme),
              Wrap(
                spacing: 8,
                children: AppThemeMode.values
                    .map((m) => ChoiceChip(
                          label: Text(m.label),
                          selected: s.themeMode == m,
                          onSelected: (_) => set(s.copyWith(themeMode: m)),
                        ))
                    .toList(),
              ),
              const SizedBox(height: 16),
              _label('Вёрстка страницы', scheme),
              _slider(
                context,
                s.fullWidth
                    ? 'Ширина колонки: вся ширина'
                    : 'Ширина колонки: ${s.maxWidth.round()}',
                s.maxWidth,
                360,
                1100,
                (v) => set(s.copyWith(maxWidth: v)),
              ),
              _slider(
                context,
                'Отступ между абзацами: ${s.paragraphSpacing.round()}',
                s.paragraphSpacing,
                4,
                40,
                (v) => set(s.copyWith(paragraphSpacing: v)),
              ),
              _slider(
                context,
                'Красная строка: ${s.firstLineIndent.round()}',
                s.firstLineIndent,
                0,
                48,
                (v) => set(s.copyWith(firstLineIndent: v)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Спокойный режим'),
                subtitle: const Text(
                    'Без парения маскота и лишних подсказок. Текст и переводы — как обычно.'),
                value: s.calm,
                onChanged: (v) => set(s.copyWith(calm: v)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Выравнивание по ширине'),
                value: s.justify,
                onChanged: (v) => set(s.copyWith(justify: v)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Шелест при перелистывании'),
                value: s.pageTurnSound,
                onChanged: s.flow == ReaderFlow.pages
                    ? (v) => set(s.copyWith(pageTurnSound: v))
                    : null,
              ),
              // Настройка живёт в AppSettings, а не в ReaderSettings: она
              // действует и в плеере, а тот про настройки чтения не знает.
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Не гасить экран'),
                subtitle: const Text(
                    'В читалке и при прослушивании. Расходует батарею.'),
                value: context.watch<AppSettings>().keepScreenOn,
                onChanged: (v) =>
                    context.read<AppSettings>().setKeepScreenOn(v),
              ),
              const SizedBox(height: 12),
              _label('Фон страницы', scheme),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _bgSwatch(context, s, 0),
                  for (final c in _bgPresets) _bgSwatch(context, s, c),
                ],
              ),
              // Фоны-награды показываются, только когда они открыты текущим
              // аккаунтом: чужая награда на общем устройстве видна быть не должна.
              ..._rewardSection(context, s, scheme),
              const SizedBox(height: 10),
              Text('Свой оттенок',
                  style: TextStyle(
                      fontSize: 13,
                      color: scheme.onSurface.withValues(alpha: 0.7))),
              Slider(
                value: _hueOf(s.bgColor),
                min: 0,
                max: 360,
                onChanged: (h) => set(s.copyWith(
                    bgColor: HSVColor.fromAHSV(1, h, 0.16, 0.97)
                        .toColor()
                        .toARGB32())),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static const _bgPresets = [
    0xFFF3E9D2, // пергамент
    0xFFF4ECD8, // сепия
    0xFFFFFDF7, // тёплый белый
    0xFFE9E9E6, // светло-серый
    0xFFE2EFE3, // мятный
    0xFFE3ECF5, // небесный
    0xFFF5E6E8, // розовый
    0xFFEDE7F4, // лавандовый
    0xFF201A14, // тёмный
    0xFF000000, // чёрный
  ];

  double _hueOf(int argb) =>
      argb == 0 ? 0 : HSVColor.fromColor(Color(argb)).hue;

  /// Фоны-награды. Пустой список — раздела нет вовсе: обещать награду, которой
  /// у человека ещё нет, в настройках незачем, для этого есть экран событий.
  List<Widget> _rewardSection(
      BuildContext context, ReaderSettings s, ColorScheme scheme) {
    final rewards = [
      ...context.watch<EventsController>().rewards,
      for (final entry
          in context.watch<AnnouncementsController>().rewardAssets.entries)
        serverReaderReward(entry.key, entry.value),
    ];
    if (rewards.isEmpty) return const [];
    return [
      const SizedBox(height: 14),
      _label('Фон из события', scheme),
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          for (final reward in rewards) _rewardSwatch(context, s, reward),
        ],
      ),
    ];
  }

  Widget _rewardSwatch(
      BuildContext context, ReaderSettings s, ReaderReward reward) {
    final scheme = Theme.of(context).colorScheme;
    final selected = s.bgTexture == reward.id;
    final rewardImage = reward.image;
    return Tooltip(
      message: reward.label,
      child: GestureDetector(
        onTap: () => context
            .read<AppSettings>()
            .update(s.copyWith(bgTexture: selected ? '' : reward.id)),
        child: Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: reward.background,
            shape: BoxShape.circle,
            image: rewardImage == null
                ? null
                : DecorationImage(
                    image: rewardImage,
                    repeat: ImageRepeat.repeat,
                    alignment: Alignment.topLeft,
                    opacity: reward.opacity < 0.25 ? 0.35 : reward.opacity,
                  ),
            border: Border.all(
              color: selected
                  ? scheme.primary
                  : scheme.onSurface.withValues(alpha: 0.2),
              width: selected ? 3 : 1,
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (reward.isNetworkSvg)
                ClipOval(
                  child: SvgPicture.network(
                    reward.networkAsset,
                    fit: BoxFit.cover,
                    placeholderBuilder: (_) => const SizedBox.shrink(),
                  ),
                ),
              if (selected)
                const Center(
                  child: Icon(Icons.check, size: 18, color: Colors.black87),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _bgSwatch(BuildContext context, ReaderSettings s, int argb) {
    final scheme = Theme.of(context).colorScheme;
    // Текстура рисуется поверх цвета, поэтому выбор обычного фона её снимает —
    // иначе нажатие на цвет выглядело бы как «ничего не произошло».
    final selected = s.bgColor == argb && s.bgTexture.isEmpty;
    final color = argb == 0 ? scheme.surface : Color(argb);
    return GestureDetector(
      onTap: () => context
          .read<AppSettings>()
          .update(s.copyWith(bgColor: argb, bgTexture: '')),
      child: Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(
            color: selected
                ? scheme.primary
                : scheme.onSurface.withValues(alpha: 0.2),
            width: selected ? 3 : 1,
          ),
        ),
        child: argb == 0
            ? Icon(Icons.format_color_reset,
                size: 18, color: scheme.onSurface.withValues(alpha: 0.6))
            : (selected
                ? Icon(Icons.check,
                    size: 18,
                    color: color.computeLuminance() > 0.5
                        ? Colors.black54
                        : Colors.white)
                : null),
      ),
    );
  }

  Widget _label(String text, ColorScheme scheme) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: scheme.onSurface.withValues(alpha: 0.7))),
      );

  Widget _slider(BuildContext context, String label, double value, double min,
      double max, ValueChanged<double> onChanged) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 13, color: scheme.onSurface)),
        Slider(
          value: value.clamp(min, max),
          min: min,
          max: max,
          onChanged: onChanged,
        ),
      ],
    );
  }
}
