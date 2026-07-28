import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/api_client.dart';
import '../services/auth_service.dart';
import 'privacy_screen.dart';
import '../services/desktop_oauth.dart';
import '../services/sync_service.dart';
import '../widgets/google_logo.dart';

/// Экран аккаунта: вход, регистрация и состояние синхронизации.
///
/// Один экран на оба режима: вошедшему показывается состояние синхронизации,
/// остальным — форма. Отдельный экран регистрации не нужен, потому что поля у
/// входа и регистрации почти совпадают.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    return Scaffold(
      appBar: AppBar(
        title: Text(auth.isSignedIn ? 'Аккаунт' : 'Вход в Citavuk'),
      ),
      body: auth.isSignedIn ? const _SignedInView() : const _AuthForm(),
    );
  }
}

// --- Вошедший пользователь ---

class _SignedInView extends StatefulWidget {
  const _SignedInView();

  @override
  State<_SignedInView> createState() => _SignedInViewState();
}

class _SignedInViewState extends State<_SignedInView> {
  int _pending = 0;

  @override
  void initState() {
    super.initState();
    _refreshPending();
  }

  Future<void> _refreshPending() async {
    final count = await context.read<SyncService>().pendingCount();
    if (mounted) setState(() => _pending = count);
  }

  Future<void> _syncNow() async {
    await context.read<SyncService>().sync();
    await _refreshPending();
  }

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Выйти из аккаунта?'),
        content: Text(
          _pending > 0
              ? 'Есть $_pending несинхронизированных изменений. '
                  'Они останутся на этом устройстве, но не попадут на другие.'
              : 'Книги и словарь останутся на этом устройстве.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Отмена')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Выйти')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await context.read<AuthService>().logout();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final sync = context.watch<SyncService>();
    final account = auth.account!;
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            leading: CircleAvatar(
              child: Text(
                account.label.isNotEmpty
                    ? account.label.substring(0, 1).toUpperCase()
                    : '?',
              ),
            ),
            title: Text(account.label),
            subtitle: Text(account.email),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _StatusIcon(status: sync.status),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        sync.message.isEmpty
                            ? 'Синхронизация готова'
                            : sync.message,
                        style: theme.textTheme.bodyLarge,
                      ),
                    ),
                  ],
                ),
                if (sync.lastSyncAt != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Последний раз: ${_formatTime(sync.lastSyncAt!)}',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
                if (_pending > 0) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Ждут отправки: $_pending',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed:
                      sync.status == SyncStatus.running ? null : _syncNow,
                  icon: const Icon(Icons.sync),
                  label: const Text('Синхронизировать сейчас'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'Книги, сохранённые слова и карточки повторения синхронизируются '
          'между устройствами. Текст книги загружается по требованию — при '
          'первом открытии на новом устройстве.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: _logout,
          icon: const Icon(Icons.logout),
          label: const Text('Выйти из аккаунта'),
        ),
        const SizedBox(height: 28),
        Divider(color: theme.colorScheme.outlineVariant),
        const SizedBox(height: 12),
        Text('Аккаунт и данные', style: theme.textTheme.titleSmall),
        const SizedBox(height: 6),
        Text(
          'Удаление стирает на сервере книги, слова, карточки, прогресс курса '
          'и дворцы памяти. На этом устройстве всё останется.',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            TextButton.icon(
              icon: const Icon(Icons.privacy_tip_outlined, size: 18),
              label: const Text('Политика конфиденциальности'),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const PrivacyScreen()),
              ),
            ),
            TextButton.icon(
              style: TextButton.styleFrom(
                  foregroundColor: theme.colorScheme.error),
              icon: const Icon(Icons.delete_forever_outlined, size: 18),
              label: const Text('Удалить аккаунт'),
              onPressed: _deleteAccount,
            ),
          ],
        ),
      ],
    );
  }

  /// Удаление аккаунта. Подтверждение словом — чтобы это нельзя было сделать
  /// одним промахом по кнопке.
  Future<void> _deleteAccount() async {
    final passwordField = TextEditingController();
    final confirmField = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Удалить аккаунт?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Книги, слова, карточки и прогресс курса будут удалены с '
                'сервера безвозвратно. Данные на этом устройстве останутся.',
              ),
              const SizedBox(height: 14),
              TextField(
                controller: passwordField,
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Пароль (если вход по паролю)',
                  isDense: true,
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: confirmField,
                onChanged: (_) => setLocal(() {}),
                decoration: const InputDecoration(
                  labelText: 'Введите УДАЛИТЬ',
                  isDense: true,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Отмена')),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: Theme.of(ctx).colorScheme.error),
              onPressed:
                  confirmField.text.trim().toUpperCase() == 'УДАЛИТЬ'
                      ? () => Navigator.pop(ctx, true)
                      : null,
              child: const Text('Удалить навсегда'),
            ),
          ],
        ),
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await context
          .read<AuthService>()
          .deleteAccount(password: passwordField.text);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Аккаунт удалён')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Не удалось удалить: $e')),
        );
      }
    }
  }

  String _formatTime(DateTime t) {
    final local = t.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.hour)}:${two(local.minute)}, ${two(local.day)}.${two(local.month)}';
  }
}

class _StatusIcon extends StatelessWidget {
  const _StatusIcon({required this.status});

  final SyncStatus status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return switch (status) {
      SyncStatus.running => const SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2.5),
        ),
      SyncStatus.done => Icon(Icons.cloud_done_outlined, color: scheme.primary),
      SyncStatus.offline =>
        Icon(Icons.cloud_off_outlined, color: scheme.outline),
      SyncStatus.failed => Icon(Icons.error_outline, color: scheme.error),
      SyncStatus.idle => Icon(Icons.cloud_outlined, color: scheme.outline),
    };
  }
}

// --- Форма входа и регистрации ---

class _AuthForm extends StatefulWidget {
  const _AuthForm();

  @override
  State<_AuthForm> createState() => _AuthFormState();
}

class _AuthFormState extends State<_AuthForm> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();

  bool _register = false;
  bool _obscure = true;
  bool _externalBusy = false;
  bool _resent = false;
  String? _error;
  String? _verificationEmail;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _error = null);

    final auth = context.read<AuthService>();
    try {
      if (_register) {
        final result = await auth.register(
          email: _email.text,
          password: _password.text,
          displayName: _name.text,
        );
        if (!mounted) return;
        if (result.verificationRequired) {
          setState(() {
            _verificationEmail = result.email;
            _resent = false;
          });
          return;
        }
      } else {
        await auth.login(email: _email.text, password: _password.text);
      }
      await _afterAuthenticated(auth);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (!_register && e.code == 'email_unverified') {
        setState(() {
          _verificationEmail = _email.text.trim();
          _resent = false;
        });
      } else {
        setState(() => _error = e.message);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось войти. Попробуйте позже.');
      }
    }
  }

  Future<void> _externalLogin(Future<void> Function() login) async {
    if (_externalBusy) return;
    setState(() {
      _externalBusy = true;
      _error = null;
    });
    final auth = context.read<AuthService>();
    try {
      await login();
      await _afterAuthenticated(auth);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Не удалось войти. Попробуйте позже.');
      }
    } finally {
      if (mounted) setState(() => _externalBusy = false);
    }
  }

  Future<void> _afterAuthenticated(AuthService auth) async {
    if (!mounted) return;
    // Аккаунт мог смениться: локальные записи нужно отправить заново, а
    // курсор обнулить, иначе данные двух пользователей перемешались бы.
    final sync = context.read<SyncService>();
    await sync.resetForNewAccount(auth.account?.id ?? '');
    // Синхронизация идёт фоном: держать пользователя на экране входа, пока
    // качаются его книги, незачем.
    unawaited(sync.sync().catchError((_) => false));
    if (mounted) Navigator.of(context).maybePop();
  }

  Future<void> _resendVerification() async {
    final email = _verificationEmail;
    if (email == null || email.isEmpty) return;
    setState(() {
      _error = null;
      _resent = false;
    });
    try {
      await context.read<AuthService>().resendVerification(email);
      if (mounted) setState(() => _resent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    final theme = Theme.of(context);
    final externalBusy = auth.busy || _externalBusy;
    // Google и Яндекс доступны там, где приложение умеет провести вход само:
    // на Android через нативный SDK, на Windows и Linux через системный
    // браузер с возвратом на локальный сокет.
    final showExternalProviders = !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.android ||
            DesktopOAuth.supported);

    if (_verificationEmail != null) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(
                  Icons.mark_email_unread_outlined,
                  size: 64,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(height: 20),
                Text(
                  'Проверьте почту',
                  style: theme.textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Text(
                  'Ссылка подтверждения отправлена на '
                  '${_verificationEmail!}. После перехода по ней вернитесь '
                  'сюда и войдите.',
                  style: theme.textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
                if (_resent) ...[
                  const SizedBox(height: 16),
                  Text(
                    'Новое письмо отправлено.',
                    style: TextStyle(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    style: TextStyle(color: theme.colorScheme.error),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: auth.busy ? null : _resendVerification,
                  icon: auth.busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.refresh),
                  label: const Text('Отправить письмо ещё раз'),
                ),
                TextButton(
                  onPressed: auth.busy
                      ? null
                      : () => setState(() {
                            _verificationEmail = null;
                            _register = false;
                            _resent = false;
                            _error = null;
                          }),
                  child: const Text('Вернуться ко входу'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          // Ограничение ширины: на десктопе форма во весь экран нечитаема.
          constraints: const BoxConstraints(maxWidth: 420),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  _register ? 'Создать аккаунт' : 'Войти',
                  style: theme.textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Аккаунт нужен, чтобы книги, словарь и прогресс были '
                  'одинаковыми на всех устройствах.',
                  style: theme.textTheme.bodySmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                if (_register) ...[
                  TextFormField(
                    controller: _name,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Как вас зовут',
                      helperText: 'Необязательно',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Почта',
                    prefixIcon: Icon(Icons.alternate_email),
                  ),
                  validator: (value) {
                    final v = (value ?? '').trim();
                    if (v.isEmpty) return 'Укажите почту';
                    if (!v.contains('@') || !v.split('@').last.contains('.')) {
                      return 'Похоже на опечатку в адресе';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _password,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: 'Пароль',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(_obscure
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined),
                      tooltip: _obscure ? 'Показать пароль' : 'Скрыть пароль',
                    ),
                  ),
                  validator: (value) {
                    final v = value ?? '';
                    if (v.isEmpty) return 'Введите пароль';
                    // Требование длины действует только при регистрации: у
                    // старого аккаунта пароль может быть любым, и мешать войти
                    // из-за этого нельзя.
                    if (_register && v.runes.length < 8) {
                      return 'Не короче 8 символов';
                    }
                    return null;
                  },
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.error_outline,
                            color: theme.colorScheme.onErrorContainer),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _error!,
                            style: TextStyle(
                                color: theme.colorScheme.onErrorContainer),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: externalBusy ? null : _submit,
                  child: externalBusy
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(_register ? 'Создать аккаунт' : 'Войти'),
                ),
                if (showExternalProviders) ...[
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      const Expanded(child: Divider()),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          'или',
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                      const Expanded(child: Divider()),
                    ],
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: externalBusy
                        ? null
                        : () => _externalLogin(
                              context
                                  .read<AuthService>()
                                  .loginWithGoogleInteractive,
                            ),
                    icon: const GoogleLogo(size: 20),
                    label: const Text('Продолжить с Google'),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: externalBusy
                        ? null
                        : () => _externalLogin(
                              context
                                  .read<AuthService>()
                                  .loginWithYandexInteractive,
                            ),
                    icon: const CircleAvatar(
                      radius: 12,
                      backgroundColor: Color(0xFFFC3F1D),
                      child: Text(
                        'Я',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    label: const Text('Продолжить с Яндексом'),
                  ),
                ],
                const SizedBox(height: 8),
                TextButton(
                  onPressed: externalBusy
                      ? null
                      : () => setState(() {
                            _register = !_register;
                            _error = null;
                          }),
                  child: Text(_register
                      ? 'У меня уже есть аккаунт'
                      : 'Создать новый аккаунт'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
