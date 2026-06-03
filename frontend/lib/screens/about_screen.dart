import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../widgets/serbian_ornament.dart';
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
          Text(
            'Версия: 1.0.0',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: scheme.primary),
            textAlign: TextAlign.center,
          ),
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
            onPressed: () => _launchUrl('https://github.com/IvanLindgren/citavuk'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
