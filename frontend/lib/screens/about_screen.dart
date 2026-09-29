import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../utils/store_policy.dart';
import '../services/update_service.dart';
import '../state/app_settings.dart';
import 'privacy_screen.dart';
import '../widgets/serbian_ornament.dart';
import '../widgets/update_dialog.dart';
import '../widgets/wolf_mascot.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      debugPrint('Could not launch $url');
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('О приложении'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const WolfBubble(
            title: 'Читавук',
            text: 'Срећно учење српског!',
            asset: Wolf.zdravo,
          ),
          const SizedBox(height: 24),
          const _VersionLine(),
          if (UpdateService.supported) ...[
            const SizedBox(height: 12),
            const _UpdateSection(),
          ],
          const SizedBox(height: 16),
          const Text(
            'Автор и разработчик: Денис Корнилов',
            style: TextStyle(fontSize: 16),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          const Text(
            'Иллюстрации и отдельные части проекта создавались с помощью ИИ-инструментов.',
            style: TextStyle(fontSize: 13),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'Связь и сообщения об ошибках: @ivanlindgren в Telegram',
            style: TextStyle(fontSize: 14, fontStyle: FontStyle.italic),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
            decoration: BoxDecoration(
              color: scheme.primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              children: [
                const Text(
                  'Новости Читавука — в Telegram-канале',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  icon: const Icon(Icons.send),
                  label: const Text('t.me/citavuk'),
                  onPressed: () => _launchUrl('https://t.me/citavuk'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const OrnamentDivider(height: 20),
          const SizedBox(height: 24),
          // Поддержка открывает цифровые бонусы; из Android-приложения к оплате
          // мимо биллинга Google Play вести нельзя (см. store_policy.dart).
          if (!supportLinksHidden) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: scheme.primary.withValues(alpha: 0.08),
                border: Border.all(
                  color: scheme.primary.withValues(alpha: 0.28),
                ),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                children: [
                  const Text(
                    'Привет, друже!',
                    style: TextStyle(fontSize: 21, fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Читавук бесплатный и таким останется: платить за чтение, курс и словарь не придётся никогда.',
                    style: TextStyle(fontSize: 15, height: 1.45),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Но сервер, перевод, озвучка и выход на iOS и macOS стоят денег. Я делаю Читавук один, и твоя поддержка помогает выпускать новое заметно быстрее.',
                    style: TextStyle(fontSize: 15, height: 1.45),
                  ),
                  const SizedBox(height: 16),
                  const _Perk(
                    icon: Icons.groups_outlined,
                    text: 'Имя среди друзей Читавука — на сайте, если разрешишь',
                  ),
                  const _Perk(
                    icon: Icons.verified_outlined,
                    text: 'Значок «Друг Читавука» в профиле',
                  ),
                  const _Perk(
                    icon: Icons.lightbulb_outline,
                    text: 'Твою идею рассмотрю первой',
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'За поддержку от 200 ₽ — одной оплатой или несколькими. Оплата проходит на сайте.',
                    style: TextStyle(
                      fontSize: 13,
                      color: scheme.onSurface.withValues(alpha: 0.65),
                    ),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.favorite),
                      label: const Text('Поддержать Читавук'),
                      onPressed: () =>
                          _launchUrl('https://citavuk.ru/support'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: scheme.primary,
                        foregroundColor: scheme.onPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () =>
                        _launchUrl('https://citavuk.ru/supporters'),
                    child: const Text('Друзья Читавука'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const OrnamentDivider(height: 20),
            const SizedBox(height: 24),
          ],
          const Text(
            'Код Читавука открыт под лицензией MIT. Если вы пишете на Dart, Go или TypeScript и нашли ошибку или неудачное место — присылайте пулл-реквест в репозиторий:',
            style: TextStyle(fontSize: 14),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.code),
            label: const Text('Репозиторий на GitHub'),
            onPressed: () =>
                _launchUrl('https://github.com/IvanLindgren/citavuk'),
          ),
          const SizedBox(height: 20),
          Text(
            'Чтение DjVu основано на djvu-rs (MIT, © 2026 Lev Matyushkin) — '
            'реализации формата по открытой спецификации DjVu v3.',
            style: TextStyle(
                fontSize: 12,
                color: scheme.onSurface.withValues(alpha: 0.6)),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          TextButton.icon(
            icon: const Icon(Icons.privacy_tip_outlined, size: 18),
            label: const Text('Политика конфиденциальности'),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const PrivacyScreen()),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _Perk extends StatelessWidget {
  const _Perk({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: scheme.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 14.5)),
          ),
        ],
      ),
    );
  }
}

class _VersionLine extends StatelessWidget {
  const _VersionLine();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return FutureBuilder<PackageInfo>(
      future: PackageInfo.fromPlatform(),
      builder: (context, snapshot) => Text(
        'Версия: ${snapshot.data?.version ?? '…'}',
        style: TextStyle(
            fontSize: 16, fontWeight: FontWeight.bold, color: scheme.primary),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class _UpdateSection extends StatefulWidget {
  const _UpdateSection();

  @override
  State<_UpdateSection> createState() => _UpdateSectionState();
}

class _UpdateSectionState extends State<_UpdateSection> {
  bool _checking = false;

  Future<void> _check() async {
    setState(() => _checking = true);
    await checkForUpdates(context, silent: false);
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettings>();
    return Column(
      children: [
        OutlinedButton.icon(
          icon: _checking
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.system_update_alt),
          label: const Text('Проверить обновления'),
          onPressed: _checking ? null : _check,
        ),
        SwitchListTile(
          value: settings.autoUpdateCheck,
          onChanged: settings.setAutoUpdateCheck,
          title: const Text('Проверять при запуске'),
          subtitle: const Text(
            'Приложение сообщит, когда выйдет новая версия',
            style: TextStyle(fontSize: 13),
          ),
          contentPadding: EdgeInsets.zero,
        ),
      ],
    );
  }
}
