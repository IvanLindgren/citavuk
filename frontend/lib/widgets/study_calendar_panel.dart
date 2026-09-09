import 'package:flutter/material.dart';
import '../services/study_service.dart';
import '../utils/study_calendar.dart';
import '../course/widgets/course_art.dart';

class StudyCalendarPanel extends StatefulWidget {
  const StudyCalendarPanel({super.key, this.data});
  final Map<String, dynamic>? data;
  @override
  State<StudyCalendarPanel> createState() => _StudyCalendarPanelState();
}

class _StudyCalendarPanelState extends State<StudyCalendarPanel> {
  int _offset = 0;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
      listenable: StudyService.instance,
      builder: (context, _) {
        final s = latestStudyData(widget.data, StudyService.instance.snapshot);
        if (s == null) return const SizedBox.shrink();
        final scheme = Theme.of(context).colorScheme;
        final today = '${s['today'] ?? ''}',
            month = studyMonth('${s['today'] ?? ''}', _offset);
        final marked = {
          for (final d in (s['days'] as List? ?? []).whereType<Map>())
            if (d['date'] is String) d['date'] as String: d['kind']
        };
        final summary = Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
                color: const Color(0xFF742A25),
                borderRadius: BorderRadius.circular(22)),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Твоя серия',
                  style: TextStyle(
                      color: Color(0xFFFFEFDA),
                      fontSize: 23,
                      fontWeight: FontWeight.w600)),
              Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text('${s['current'] ?? 0}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 58,
                              fontWeight: FontWeight.w600)),
                      const Text('дней подряд',
                          style: TextStyle(color: Color(0xFFECCDBC))),
                    ])),
                CourseArt(
                    pose: (s['current'] as num? ?? 0) > 0
                        ? 'celebrate'
                        : 'reading',
                    size: 125)
              ]),
              const SizedBox(height: 12),
              Wrap(spacing: 22, runSpacing: 12, children: [
                for (final pair in [
                  ['Рекорд', '${s['longest'] ?? 0} дн.'],
                  ['Дней занятий', '${s['activeDays'] ?? 0}'],
                  ['Заморозки', '${s['freezes'] ?? 0} из 2']
                ])
                  Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(pair[1],
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w600)),
                        Text(pair[0],
                            style: const TextStyle(
                                color: Color(0xFFECCDBC), fontSize: 11))
                      ])
              ]),
            ]));
        final calendar = Padding(
            padding: const EdgeInsets.all(18),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(
                    child: Text(month?.label ?? 'История занятий',
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w600))),
                IconButton(
                    tooltip: 'Предыдущий месяц',
                    onPressed:
                        _offset > -11 ? () => setState(() => _offset--) : null,
                    icon: const Icon(Icons.chevron_left)),
                IconButton(
                    tooltip: 'Следующий месяц',
                    onPressed:
                        _offset < 0 ? () => setState(() => _offset++) : null,
                    icon: const Icon(Icons.chevron_right))
              ]),
              const SizedBox(height: 12),
              Row(children: [
                for (final day in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])
                  Expanded(
                      child: Center(
                          child: Text(day,
                              style: TextStyle(
                                  color: scheme.onSurfaceVariant,
                                  fontSize: 12))))
              ]),
              const SizedBox(height: 8),
              if (month != null)
                GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: month.padding + month.dayCount,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 7,
                        mainAxisExtent:
                            (MediaQuery.textScalerOf(context).scale(13) * 2 +
                                    14)
                                .clamp(44, 100),
                        mainAxisSpacing: 5,
                        crossAxisSpacing: 5),
                    itemBuilder: (context, index) {
                      final day = index - month.padding + 1;
                      if (day < 1) return const SizedBox.shrink();
                      final date = month.date(day),
                          kind = marked[month.date(day)];
                      final future = date.compareTo(today) > 0,
                          active = !future && kind == 'active',
                          frozen = !future && kind == 'frozen';
                      final label =
                          '$date: ${active ? 'занятие' : frozen ? 'заморозка' : future ? 'впереди' : 'без занятия'}';
                      return Tooltip(
                          message: label,
                          child: Semantics(
                              label: label,
                              child: ExcludeSemantics(
                                  child: Container(
                                      decoration: BoxDecoration(
                                          color: active
                                              ? scheme.primary
                                              : frozen
                                                  ? scheme.tertiaryContainer
                                                  : scheme.surfaceContainerLow,
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          border: Border.all(
                                              color: date == today
                                                  ? scheme.primary
                                                  : Colors.transparent,
                                              width: 2)),
                                      child: Column(
                                          mainAxisAlignment:
                                              MainAxisAlignment.center,
                                          children: [
                                            Text('$day',
                                                maxLines: 1,
                                                softWrap: false,
                                                style: TextStyle(
                                                    color: active
                                                        ? scheme.onPrimary
                                                        : frozen
                                                            ? scheme
                                                                .onTertiaryContainer
                                                            : future
                                                                ? scheme
                                                                    .onSurfaceVariant
                                                                    .withValues(
                                                                        alpha:
                                                                            .5)
                                                                : scheme
                                                                    .onSurface,
                                                    fontWeight: active
                                                        ? FontWeight.w700
                                                        : FontWeight.w400,
                                                    fontSize: 13)),
                                            if (frozen)
                                              Icon(Icons.ac_unit,
                                                  size: 10,
                                                  color: scheme
                                                      .onTertiaryContainer),
                                          ])))));
                    }),
              const SizedBox(height: 15),
              Wrap(spacing: 16, runSpacing: 8, children: [
                Text('Занятие',
                    style: TextStyle(
                        color: scheme.primary,
                        fontWeight: FontWeight.w600,
                        fontSize: 12)),
                Text('Снежинка: заморозка',
                    style:
                        TextStyle(color: scheme.onSurfaceVariant, fontSize: 12))
              ]),
              const SizedBox(height: 10),
              Text(
                  'Часовой пояс: ${s['timezone'] ?? 'UTC'}. Заморозка сохраняет серию, но не добавляет день занятий.',
                  style: TextStyle(
                      fontSize: 11,
                      height: 1.6,
                      color: scheme.onSurfaceVariant)),
            ]));
        return Container(
            decoration: BoxDecoration(
                border: Border.all(color: scheme.outlineVariant),
                borderRadius: BorderRadius.circular(24)),
            padding: const EdgeInsets.all(6),
            child: LayoutBuilder(
                builder: (context, limits) => limits.maxWidth >= 760
                    ? Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                            Expanded(child: summary),
                            Expanded(child: calendar)
                          ])
                    : Column(children: [summary, calendar])));
      });
}
