part of 'book_reader_screen.dart';

class _ShareSheet extends StatefulWidget {
  const _ShareSheet({
    required this.share,
    required this.onLinkCopied,
  });

  final BookShare share;
  final VoidCallback onLinkCopied;

  @override
  State<_ShareSheet> createState() => _ShareSheetState();
}

class _ShareSheetState extends State<_ShareSheet> {
  bool _copied = false;

  Future<void> _copy({bool unlockDiscussion = true}) async {
    await Clipboard.setData(ClipboardData(text: widget.share.url));
    if (unlockDiscussion) widget.onLinkCopied();
    if (mounted) setState(() => _copied = true);
  }

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication) &&
        mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не удалось открыть приложение')),
      );
    }
  }

  Future<void> _instagram() async {
    await _copy(unlockDiscussion: false);
    await _open('https://www.instagram.com/');
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final text = '«${widget.share.title}» — читаю в Читавуке';
    final encodedUrl = Uri.encodeComponent(widget.share.url);
    final encodedText = Uri.encodeComponent(text);
    final combined = Uri.encodeComponent('$text ${widget.share.url}');
    final socials = <({
      String label,
      FaIconData icon,
      String? url,
      Future<void> Function()? action
    })>[
      (
        label: 'Telegram',
        icon: FontAwesomeIcons.telegram,
        url: 'https://t.me/share/url?url=$encodedUrl&text=$encodedText',
        action: null,
      ),
      (
        label: 'ВКонтакте',
        icon: FontAwesomeIcons.vk,
        url: 'https://vk.com/share.php?url=$encodedUrl&title=$encodedText',
        action: null,
      ),
      (
        label: 'WhatsApp',
        icon: FontAwesomeIcons.whatsapp,
        url: 'https://wa.me/?text=$combined',
        action: null,
      ),
      (
        label: 'Viber',
        icon: FontAwesomeIcons.viber,
        url: 'viber://forward?text=$combined',
        action: null,
      ),
      (
        label: 'Threads',
        icon: FontAwesomeIcons.threads,
        url: 'https://www.threads.net/intent/post?text=$combined',
        action: null,
      ),
      (
        label: 'Instagram',
        icon: FontAwesomeIcons.instagram,
        url: null,
        action: _instagram,
      ),
    ];

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Поделиться книгой',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              'В каталог она не попадает — останется только у тебя и у тех, кому ты дашь ссылку',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final social in socials)
                  SizedBox.square(
                    dimension: 48,
                    child: IconButton.filledTonal(
                      tooltip: social.label,
                      onPressed: () {
                        if (social.action != null) {
                          social.action!();
                        } else if (social.url != null) {
                          _open(social.url!);
                        }
                      },
                      icon: FaIcon(social.icon, size: 20),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: SelectableText(
                    widget.share.url,
                    maxLines: 1,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: 'Скопировать ссылку',
                  onPressed: _copy,
                  icon: const Icon(Icons.link),
                ),
              ],
            ),
            if (_copied)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Ссылка скопирована. Волк ждёт рядом со страницей.',
                  style: TextStyle(
                    color: Colors.green,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
