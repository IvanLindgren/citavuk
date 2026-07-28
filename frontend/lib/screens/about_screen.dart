import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
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
            'Создатель: Денис Корнилов & Claude & ChatGPT Imagen 2',
            style: TextStyle(fontSize: 16),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            '(Для связи и сообщения проблем: @ivanlindgren в тг)',
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
                  'Следите за обновлениями в:',
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
          const Text(
            'Проект бесплатный и всегда будет бесплатным (естественно, никакой рекламы тоже не будет).',
            style: TextStyle(fontSize: 16),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          const Text(
            'Если вы хотите отблагодарить автора финансово и помочь ему в будущих проектах, то тыкните на кнопку ниже (заодно скажите спасибо и Дарио Амодею :))',
            style: TextStyle(fontSize: 14),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            icon: const Icon(Icons.favorite),
            label: const Text('Поддержать проект (CloudTips)'),
            onPressed: () => _launchUrl('https://pay.cloudtips.ru/p/3f19f8cc'),
            style: ElevatedButton.styleFrom(
              backgroundColor: scheme.primary,
              foregroundColor: scheme.onPrimary,
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
          ),
          const SizedBox(height: 24),
          const OrnamentDivider(height: 20),
          const SizedBox(height: 24),
          const Text(
            'Код проекта является открыто распространяемым ПО под MIT-лицензией. Если вы является разработчиком на Python и Dart и имеете лишнее время для анализа чужого кода, то можете глянуть гит проекта и сделать пулл-реквест, если найдете баг/плохой код по вашему мнению:',
            style: TextStyle(fontSize: 14),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            icon: const Icon(Icons.code),
            label: const Text('GitHub Репозиторий'),
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
