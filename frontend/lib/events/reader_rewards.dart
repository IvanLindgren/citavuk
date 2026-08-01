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
    required this.asset,
    required this.tile,
    required this.background,
    required this.text,
  });

  /// Сохраняемый идентификатор (`ReaderSettings.bgTexture`).
  final String id;
  final String label;
  final String asset;

  /// Размер плитки в логических пикселях — при повторе картинка не должна
  /// растягиваться под экран.
  final Size tile;

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
