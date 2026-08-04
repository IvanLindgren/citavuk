import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:srbski_read/events/reader_rewards.dart';

void main() {
  test('campaign background uses a safe local raster tile', () {
    final reward = serverReaderReward(
      'reader_background_100',
      'https://citavuk.ru/img/citavuk-100-readers.svg',
    );

    expect(reward.networkAsset, isEmpty);
    expect(reward.asset, 'assets/imgs/citavuk_100_readers_tile.png');
    expect(reward.image, isA<AssetImage>());
    expect(reward.tile, const Size(320, 320));
    expect(reward.opacity, 0.09);

    final decoration = rewardDecorationFor(reward);
    expect(decoration.image?.image, isA<AssetImage>());
    expect(decoration.image?.repeat, ImageRepeat.repeat);
    expect(decoration.image?.opacity, 0.09);
  });

  test('unknown network SVG never enters the raster image decoder', () {
    final reward = serverReaderReward(
      'future_reward',
      'https://example.com/reward.svg',
    );

    expect(reward.isNetworkSvg, isTrue);
    expect(reward.image, isNull);
    expect(rewardDecorationFor(reward).image, isNull);
  });
}
