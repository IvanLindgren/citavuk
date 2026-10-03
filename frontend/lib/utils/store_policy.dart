import 'package:flutter/foundation.dart';

/// Ссылки на оплату поддержки скрыты в Android-сборке и на iPhone: поддержка
/// открывает цифровые бонусы, а Google Play и App Store запрещают вести к
/// оплате мимо своего биллинга (у Apple — правило 3.1.1). Бонусы, купленные
/// на сайте, в приложении работают.
// APK с сайта собирается с --dart-define=CITAVUK_DISTRIBUTION=direct.
// В Google Play внешний платёж за цифровые бонусы остаётся закрыт.
// Mac из DMG с сайта ссылки показывает, сборка для Mac App Store — с
// CITAVUK_DISTRIBUTION=appstore — прячет их, как iPhone.
const appDistribution =
    String.fromEnvironment('CITAVUK_DISTRIBUTION', defaultValue: 'play');
/// Сборка для Mac App Store: в ней нет ссылок на оплату и стороннего входа
/// без равноценного входа Apple.
bool get storeBuildForMac =>
    !kIsWeb &&
    defaultTargetPlatform == TargetPlatform.macOS &&
    appDistribution == 'appstore';

bool get supportLinksHidden =>
    !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.iOS ||
        storeBuildForMac ||
        (defaultTargetPlatform == TargetPlatform.android &&
            appDistribution != 'direct'));
