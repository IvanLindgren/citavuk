import 'package:srbski_read/models/server_announcement.dart';
import 'package:flutter_test/flutter_test.dart';

ServerAnnouncement _item(
  String id, {
  String kind = 'news',
  bool banner = true,
  bool dismissed = false,
}) =>
    ServerAnnouncement(
      id: id,
      kind: kind,
      title: id,
      body: 'тело',
      bannerText: '',
      imageUrl: '',
      actionLabel: '',
      actionUrl: '',
      bannerEnabled: banner,
      shareRequired: false,
      shareText: '',
      rewardKey: '',
      rewardAssetUrl: '',
      read: false,
      dismissed: dismissed,
      claimed: false,
    );

void main() {
  test('без объявлений баннеров нет', () {
    expect(pickBanners(const []), isEmpty);
  });

  test('одно обычное объявление показывается', () {
    final banners = pickBanners([_item('a')]);
    expect(banners.map((item) => item.id), ['a']);
  });

  test('из обычных выбирается одно: кампания важнее новости', () {
    final banners = pickBanners([_item('news', kind: 'news'), _item('sale', kind: 'campaign')]);
    expect(banners.map((item) => item.id), ['sale']);
  });

  test('критическое сервисное идёт отдельно и первым', () {
    final banners = pickBanners([
      _item('news', kind: 'news'),
      _item('works', kind: 'maintenance'),
    ]);
    expect(banners.map((item) => item.id), ['works', 'news']);
  });

  test('закрытые и небannerные не показываются', () {
    final banners = pickBanners([
      _item('closed', dismissed: true),
      _item('quiet', banner: false),
      _item('open'),
    ]);
    expect(banners.map((item) => item.id), ['open']);
  });
}
