import 'dart:async';

import 'package:flutter/material.dart';
import '../widgets/personal_playing_card.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:provider/provider.dart';

import '../models/personal_lesson.dart';
import '../services/auth_service.dart';
import '../services/api_client.dart';
import '../services/personal_service.dart';
import 'personal_lesson_screen.dart';

class PersonalLessonsScreen extends StatefulWidget {
  const PersonalLessonsScreen({super.key});
  @override
  State<PersonalLessonsScreen> createState() => _PersonalLessonsScreenState();
}

class _PersonalLessonsScreenState extends State<PersonalLessonsScreen>
    with WidgetsBindingObserver {
  late final PersonalService _service;
  late String _level;
  PersonalState? _state;
  PersonalPlan? _archive;
  String? _selectedPlanID;
  String? _error;
  bool _busy = false, _loading = false, _newPlan = false, _visible = true;
  Timer? _poll;
  final _feedback = TextEditingController();
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final auth = context.read<AuthService>();
    _service = PersonalService(auth.api);
    _level = auth.account?.serbianLevel ?? 'A1';
    if (_level.isEmpty) _level = 'A1';
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_visible &&
          (_archive ?? _state?.plan)?.generating == true &&
          !_loading &&
          ModalRoute.of(context)?.isCurrent == true) {
        unawaited(_load());
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _visible = state == AppLifecycleState.resumed;
  }

  @override
  void dispose() {
    _poll?.cancel();
    _feedback.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading) return;
    _loading = true;
    final selected = _selectedPlanID;
    try {
      final data = await _service.load();
      final archive = selected != null && selected != data.plan?.id
          ? await _service.plan(selected)
          : null;
      if (mounted && selected == _selectedPlanID) {
        setState(() {
          _state = data;
          _archive = archive;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      _loading = false;
      if (mounted && selected != _selectedPlanID) unawaited(_load());
    }
  }

  Future<void> _act(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _message(Object e) => e is ApiException
      ? e.message
      : 'Не удалось загрузить колоду. Попробуй ещё раз.';
  Future<void> _open(int day) async {
    final plan = _archive ?? _state?.plan;
    if (plan == null) return;
    await Navigator.push<void>(
        context,
        MaterialPageRoute(
            builder: (_) =>
                PersonalLessonScreen(service: _service, plan: plan, day: day)));
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final p = _archive ?? _state?.plan;
    return Scaffold(
        appBar: AppBar(title: const Text('Урок дня'), actions: [
          IconButton(
              onPressed: _loading ? null : _load,
              tooltip: 'Обновить колоду',
              icon: const Icon(Icons.refresh))
        ]),
        body: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 1440),
                child: CustomScrollView(slivers: [
                  SliverPadding(
                      padding: const EdgeInsets.all(24),
                      sliver: SliverToBoxAdapter(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text('Колода сербского. Ого!',
                                style:
                                    Theme.of(context).textTheme.headlineLarge),
                            const SizedBox(height: 12),
                            const Text(
                                'Волк Читавук разрисовал игральные карты, и теперь с помощью колоды вы можете самостоятельно создать себе уроки... На каждый день!'),
                            if (_error != null)
                              Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 16),
                                  child: Text(_error!,
                                      semanticsLabel: 'Ошибка: $_error')),
                            if (_state == null && _error == null)
                              const Padding(
                                  padding: EdgeInsets.all(32),
                                  child: Center(
                                      child: CircularProgressIndicator())),
                            if (!_newPlan && (_state?.history.length ?? 0) > 1)
                              DropdownButtonFormField<String>(
                                key: ValueKey(p?.id),
                                initialValue: p?.id,
                                isExpanded: true,
                                decoration: const InputDecoration(
                                    labelText: 'Моя колода'),
                                items: _state!.history
                                    .map((h) => DropdownMenuItem(
                                        value: h.id,
                                        child: Text(
                                            '${h.startedAt.toLocal().day}.${h.startedAt.toLocal().month}.${h.startedAt.toLocal().year} (${h.level})')))
                                    .toList(),
                                onChanged: _busy || _loading
                                    ? null
                                    : (id) {
                                        if (_loading) return;
                                        setState(() => _selectedPlanID = id);
                                        unawaited(_load());
                                      },
                              ),
                            if (_state != null && (p == null || _newPlan))
                              PersonalQuestionnaire(
                                  questions: _state!.questions,
                                  level: _level,
                                  disabled: _busy || !_state!.available,
                                  onSubmit: (level, zone, answers) =>
                                      _act(() async {
                                        await _service.create(
                                            level, zone, answers);
                                        if (mounted) {
                                          setState(() {
                                            _newPlan = false;
                                            _selectedPlanID = null;
                                            _archive = null;
                                          });
                                        }
                                      })),
                            if (_state != null && !_state!.available)
                              const Text(
                                  'Новые колоды сейчас не составляются. Сохранённые уроки доступны.'),
                            if (p != null && !_newPlan) ...[
                              const SizedBox(height: 20),
                              Text(
                                  'Уровень ${p.level}\nПройдено ${p.lessons.where((l) => l.completedAt != null).length} из 30\n${p.timezone}'),
                              if (p.generating)
                                Padding(
                                    padding: const EdgeInsets.only(top: 12),
                                    child: Text(
                                        'Составлено ${p.lessons.length} из 30. Готовый урок можно открыть сразу.')),
                              if (p.status == 'error') ...[
                                Text(p.error ??
                                    'Не все занятия удалось составить.'),
                                FilledButton(
                                    onPressed: _busy
                                        ? null
                                        : () =>
                                            _act(() => _service.retry(p.id)),
                                    child: const Text('Досоставить колоду'))
                              ],
                            ],
                          ]))),
                  if (p != null && !_newPlan)
                    SliverPadding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        sliver: SliverLayoutBuilder(
                            builder: (context, constraints) {
                          final columns = (constraints.crossAxisExtent / 220)
                              .floor()
                              .clamp(1, 6);
                          return SliverGrid.builder(
                              gridDelegate:
                                  SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: columns,
                                      mainAxisSpacing: 20,
                                      crossAxisSpacing: 20,
                                      childAspectRatio: .67),
                              itemCount: 30,
                              itemBuilder: (context, i) {
                                final day = i + 1,
                                    meta = p.outline
                                        .where((o) => o.day == day)
                                        .firstOrNull,
                                    card = p.lessons
                                        .where((l) => l.day == day)
                                        .firstOrNull;
                                return _LessonCard(
                                    kind: meta?.kind ?? 'vocabulary',
                                    today: day == p.today,
                                    monthNumber: p.month,
                                    day: day,
                                    title: meta?.title ?? 'Урок $day',
                                    subtitle: card?.completedAt != null
                                        ? 'Пройдено: ${card!.score}/${card.total}'
                                        : (personalKinds[meta?.kind] ?? 'Урок'),
                                    ready: card != null && day <= p.today,
                                    onTap: () => _open(day));
                              });
                        })),
                  if (p != null && !_newPlan)
                    SliverPadding(
                        padding: const EdgeInsets.all(24),
                        sliver: SliverToBoxAdapter(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              if (p.suggestRegeneration &&
                                  p.status == 'ready') ...[
                                Text('Сделаем уроки полезнее?',
                                    style: Theme.of(context)
                                        .textTheme
                                        .headlineSmall),
                                const SizedBox(height: 12),
                                Text(
                                    'Расскажи, что изменить. Пройденные уроки и твои правки останутся. Пересоставлений: ${p.regenerations} из 3.'),
                                TextField(
                                    controller: _feedback,
                                    maxLength: 1500,
                                    minLines: 3,
                                    maxLines: 6,
                                    decoration: const InputDecoration(
                                        labelText: 'Что не подошло?'),
                                    onChanged: (_) => setState(() {})),
                                FilledButton(
                                    onPressed: _busy ||
                                            _feedback.text.trim().length < 5 ||
                                            p.regenerations >= 3
                                        ? null
                                        : () => _act(() => _service.regenerate(
                                            p.id, _feedback.text)),
                                    child: const Text(
                                        'Пересоставить оставшиеся уроки')),
                              ],
                              if (p.today > 30)
                                FilledButton(
                                    onPressed: _state?.available == true
                                        ? () => setState(() => _newPlan = true)
                                        : null,
                                    child: const Text(
                                        'Составить следующий месяц')),
                            ]))),
                ]))));
  }
}

class _LessonCard extends StatelessWidget {
  const _LessonCard(
      {required this.monthNumber,
      required this.today,
      required this.day,
      required this.title,
      required this.subtitle,
      required this.ready,
      required this.onTap,
      required this.kind});
  final int day, monthNumber;
  final String title, subtitle, kind;
  final bool ready, today;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => PersonalPlayingCard(
      day: day,
      month: monthNumber,
      title: title,
      subtitle: subtitle,
      kind: kind,
      ready: ready,
      today: today,
      onTap: onTap);
}

class PersonalQuestionnaire extends StatefulWidget {
  const PersonalQuestionnaire(
      {super.key,
      required this.questions,
      required this.level,
      required this.disabled,
      required this.onSubmit});
  final List<PersonalQuestion> questions;
  final String level;
  final bool disabled;
  final Future<void> Function(String, String, Map<String, String>) onSubmit;
  @override
  State<PersonalQuestionnaire> createState() => _PersonalQuestionnaireState();
}

class _PersonalQuestionnaireState extends State<PersonalQuestionnaire> {
  late String _level = widget.level;
  int _step = 0;
  final _answers = <String, String>{};
  String? _error;
  Future<void> _submit() async {
    try {
      final zone = await FlutterTimezone.getLocalTimezone();
      if (!mounted) return;
      await widget.onSubmit(_level, zone.identifier, Map.of(_answers));
    } catch (_) {
      if (mounted) {
        setState(() => _error =
            'Не удалось определить часовой пояс устройства. Проверь системные настройки.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.questions.isEmpty) return const SizedBox.shrink();
    final q = widget.questions[_step];
    final colors = Theme.of(context).colorScheme;
    return Container(
        margin: const EdgeInsets.symmetric(vertical: 24),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
            color: colors.surfaceContainerLow,
            border: Border.all(color: colors.outlineVariant),
            borderRadius: BorderRadius.circular(24)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Настроим твою колоду',
              style: TextStyle(
                  color: colors.primary, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text('Вопрос ${_step + 1} из ${widget.questions.length}'),
          const SizedBox(height: 12),
          LinearProgressIndicator(value: (_step + 1) / widget.questions.length),
          const SizedBox(height: 20),
          if (_step == 0)
            DropdownButtonFormField<String>(
                initialValue: _level,
                decoration: const InputDecoration(labelText: 'Твой уровень'),
                items: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
                    .map((l) => DropdownMenuItem(value: l, child: Text(l)))
                    .toList(),
                onChanged: widget.disabled
                    ? null
                    : (v) => setState(() => _level = v!)),
          const SizedBox(height: 20),
          Text(q.title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(
              q.multiple
                  ? 'Можно выбрать несколько вариантов'
                  : 'Выбери один вариант',
              style: TextStyle(color: colors.onSurfaceVariant)),
          const SizedBox(height: 12),
          ...q.options.map((o) {
            final selected = (_answers[q.id] ?? '').split('\n').contains(o);
            return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Semantics(
                    selected: selected,
                    child: Material(
                      color:
                          selected ? colors.primaryContainer : colors.surface,
                      borderRadius: BorderRadius.circular(14),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: widget.disabled
                            ? null
                            : () => setState(() => _answers[q.id] =
                                q.toggle(_answers[q.id] ?? '', o)),
                        child: Container(
                          constraints: const BoxConstraints(minHeight: 56),
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                              border: Border.all(
                                  color: selected
                                      ? colors.primary
                                      : colors.outlineVariant),
                              borderRadius: BorderRadius.circular(14)),
                          child: Row(children: [
                            Icon(
                                selected
                                    ? Icons.check_circle
                                    : q.multiple
                                        ? Icons.check_box_outline_blank
                                        : Icons.radio_button_unchecked,
                                color: selected
                                    ? colors.primary
                                    : colors.onSurfaceVariant,
                                size: 22),
                            const SizedBox(width: 12),
                            Expanded(
                                child: Text(o,
                                    style: TextStyle(
                                        color: selected
                                            ? colors.onPrimaryContainer
                                            : colors.onSurface))),
                          ]),
                        ),
                      ),
                    )));
          }),
          const SizedBox(height: 24),
          Wrap(spacing: 16, runSpacing: 12, children: [
            OutlinedButton(
                onPressed: widget.disabled || _step == 0
                    ? null
                    : () => setState(() => _step--),
                child: const Text('Назад')),
            FilledButton(
                onPressed: widget.disabled || (_answers[q.id] ?? '').isEmpty
                    ? null
                    : () => _step < widget.questions.length - 1
                        ? setState(() => _step++)
                        : unawaited(_submit()),
                child: Text(_step < widget.questions.length - 1
                    ? 'Дальше'
                    : 'Составить мою колоду'))
          ]),
          const SizedBox(height: 16),
          const Text(
              'Ответы отправятся модели для составления личных уроков. Не добавляй личные данные. Часовой пояс серии закрепляется после первого занятия.'),
          if (_error != null) Text(_error!),
        ]));
  }
}
