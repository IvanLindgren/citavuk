/// Фоны читалки, которые нельзя выбрать просто так — их выдают за события.
///
/// Награда принадлежит аккаунту, а не устройству: на общем компьютере чужой
/// фон в настройках появляться не должен, поэтому доступность считается по
/// прогрессу текущего аккаунта, а не по факту «когда-то было открыто».
library;

import 'package:flutter/material.dart';

import 'odyssey.dart';
import 'odyssey_content.dart';

@immutable
class ReaderReward {
  const ReaderReward({
    required this.id,
    required this.label,
    this.asset = '',
    this.networkAsset = '',
    required this.tile,
    this.opacity = 1,
    required this.background,
    required this.text,
  });

  /// Сохраняемый идентификатор (`ReaderSettings.bgTexture`).
  final String id;
  final String label;
  final String asset;
  final String networkAsset;
  bool get isNetworkSvg => networkAsset.toLowerCase().endsWith('.svg');

  /// SVG нельзя передавать в [NetworkImage]: desktop codec ожидает PNG/JPEG
  /// и на некоторых версиях Windows падает внутри native image decoder.
  ImageProvider? get image {
    if (isNetworkSvg) return null;
    if (networkAsset.isNotEmpty) return NetworkImage(networkAsset);
    if (asset.isNotEmpty) return AssetImage(asset);
    return null;
  }

  /// Размер плитки в логических пикселях — при повторе картинка не должна
  /// растягиваться под экран.
  final Size tile;
  final double opacity;

  /// Цвет под текстурой: пока картинка не декодирована, страница не должна
  /// мигать белым.
  final Color background;
  final Color text;
}

const List<ReaderReward> kReaderRewards = [
  ReaderReward(
    id: kOdysseyRewardTexture,
    label: 'Спартанские шлемы',
    asset: OdysseyContent.helmetsAsset,
    tile: Size(320, 258),
    background: Color(0xFFEFE3CF),
    text: Color(0xFF2B2118),
  ),
];

const _campaign100TileAsset = 'assets/imgs/citavuk_100_readers_tile.png';

ReaderReward serverReaderReward(String key, String assetUrl) {
  final campaign100 = key == 'reader_background_100';
  return ReaderReward(
    id: key,
    label: campaign100 ? 'Первые 100 читателей' : 'Фон из акции',
    // Этот SVG сложный и приходит с сервера. В релизе используем его
    // проверенную растровую копию: фон доступен офлайн и не проходит через
    // нестабильный desktop SVG/network decoder.
    asset: campaign100 ? _campaign100TileAsset : '',
    networkAsset: campaign100 ? '' : assetUrl,
    tile: campaign100 ? const Size(320, 320) : const Size(420, 420),
    opacity: campaign100 ? 0.09 : 1,
    background: const Color(0xFFF3E9D2),
    text: const Color(0xFF241A14),
  );
}

ReaderReward? readerRewardById(String id) {
  if (id.isEmpty) return null;
  for (final reward in kReaderRewards) {
    if (reward.id == id) return reward;
  }
  return null;
}

/// Награды, открытые этим аккаунтом.
List<ReaderReward> unlockedRewards(OdysseyProgress odyssey) => [
      for (final reward in kReaderRewards)
        if (reward.id != kOdysseyRewardTexture || odyssey.rewardUnlocked)
          reward,
    ];

/// Фон страницы с текстурой. Возвращает null, если награда не выбрана или не
/// принадлежит текущему аккаунту — тогда читалка рисует обычный цвет.
BoxDecoration? rewardDecoration(String id) {
  final reward = readerRewardById(id);
  if (reward == null) return null;
  return BoxDecoration(
    color: reward.background,
    image: DecorationImage(
      image: AssetImage(reward.asset),
      repeat: ImageRepeat.repeat,
      // Плитка задана в логических пикселях; scale подгоняет исходник под неё.
      scale: 1,
      alignment: Alignment.topLeft,
    ),
  );
}

BoxDecoration rewardDecorationFor(ReaderReward reward) => BoxDecoration(
      color: reward.background,
      image: reward.image == null
          ? null
          : DecorationImage(
              image: reward.image!,
              repeat: ImageRepeat.repeat,
              alignment: Alignment.topLeft,
              opacity: reward.opacity,
            ),
    );
