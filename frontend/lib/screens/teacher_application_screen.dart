import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/community_lessons_service.dart';

class TeacherApplicationScreen extends StatefulWidget {
  const TeacherApplicationScreen({super.key});

  @override
  State<TeacherApplicationScreen> createState() =>
      _TeacherApplicationScreenState();
}

class _TeacherApplicationScreenState extends State<TeacherApplicationScreen> {
  Map<String, dynamic>? _application;
  String _level = 'B2';
  bool _native = false;
  final _russian = TextEditingController();
  final _experience = TextEditingController();
  final _certificates = TextEditingController();
  final _social = TextEditingController();
  bool _busy = false;
  String _error = '';

  CommunityLessonsService get _service =>
      CommunityLessonsService(context.read<ApiClient>());

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    if (!context.read<AuthService>().isSignedIn) return;
    try {
      final value = await _service.teacherApplication();
      if (!mounted) return;
      setState(() {
        _application = value;
        _level = value['serbianLevel']?.toString() ?? _level;
        _native = value['nativeSpeaker'] == true;
        _russian.text = value['russianLevel']?.toString() ?? '';
        _experience.text = value['teachingExperience']?.toString() ?? '';
        _certificates.text = value['certificates']?.toString() ?? '';
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _submit() async {
    if (_experience.text.trim().isEmpty ||
        (!_native && _russian.text.trim().isEmpty)) {
      setState(
          () => _error = 'Заполните опыт преподавания и уровень русского.');
      return;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final result = await _service.submitTeacherApplication({
        'serbianLevel': _level,
        'nativeSpeaker': _native,
        'russianLevel': _russian.text.trim(),
        'teachingExperience': _experience.text.trim(),
        'certificates': _certificates.text.trim(),
        'socialLinks': _social.text.trim().isEmpty
            ? []
            : [
                {'url': _social.text.trim()}
              ],
        'monetizationIntent': 'free',
      });
      if (mounted) setState(() => _application = result);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _russian.dispose();
    _experience.dispose();
    _certificates.dispose();
    _social.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final status = _application?['status']?.toString() ?? 'none';
    return Scaffold(
      appBar: AppBar(title: const Text('Для преподавателей')),
      body: !auth.isSignedIn
          ? const Center(
              child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Войдите в аккаунт, чтобы подать заявку.',
                      textAlign: TextAlign.center)))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text('Создавай бесплатные уроки',
                    style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 8),
                const Text(
                    'Редактор работает на сайте citavuk.ru. В приложении можно подать заявку, следить за её статусом и проходить опубликованные уроки.'),
                const SizedBox(height: 24),
                if (status == 'pending')
                  _statusCard('Заявка на рассмотрении',
                      'Решение появится здесь и придёт на подтверждённую почту.'),
                if (status == 'approved')
                  _statusCard('Заявка одобрена',
                      'Открой citavuk.ru в браузере, чтобы создавать и публиковать уроки.'),
                if (status != 'pending' && status != 'approved') ...[
                  if (status == 'rejected' || status == 'suspended')
                    _statusCard('Заявку можно отправить повторно',
                        _application?['adminComment']?.toString() ?? ''),
                  DropdownButtonFormField<String>(
                      initialValue: _level,
                      decoration:
                          const InputDecoration(labelText: 'Уровень сербского'),
                      items: const ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
                          .map((value) => DropdownMenuItem(
                              value: value, child: Text(value)))
                          .toList(),
                      onChanged: (value) =>
                          setState(() => _level = value ?? _level)),
                  SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Носитель сербского'),
                      value: _native,
                      onChanged: (value) => setState(() => _native = value)),
                  if (!_native)
                    TextField(
                        controller: _russian,
                        decoration: const InputDecoration(
                            labelText: 'Уровень русского')),
                  TextField(
                      controller: _experience,
                      maxLines: 5,
                      decoration: const InputDecoration(
                          labelText: 'Опыт преподавания')),
                  TextField(
                      controller: _certificates,
                      maxLines: 3,
                      decoration: const InputDecoration(
                          labelText: 'Образование и сертификаты')),
                  TextField(
                      controller: _social,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                          labelText: 'Профессиональная ссылка')),
                  const SizedBox(height: 20),
                  FilledButton.icon(
                      onPressed: _busy ? null : _submit,
                      icon: _busy
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.send_outlined),
                      label: const Text('Отправить заявку')),
                ],
                if (_error.isNotEmpty)
                  Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(_error,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error))),
              ],
            ),
    );
  }

  Widget _statusCard(String title, String body) => Card(
      child: ListTile(
          leading: const Icon(Icons.fact_check_outlined),
          title: Text(title),
          subtitle: body.isEmpty ? null : Text(body)));
}
