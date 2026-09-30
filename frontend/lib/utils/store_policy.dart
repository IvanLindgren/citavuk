import 'package:flutter/foundation.dart';

/// Ссылки на оплату поддержки скрыты в Android-сборке: поддержка открывает
/// цифровые бонусы, а Google Play запрещает вести к оплате мимо своего
/// биллинга. Бонусы, купленные на сайте, в приложении работают.
// APK с сайта собирается с --dart-define=CITAVUK_DISTRIBUTION=direct.
// В Google Play внешний платёж за цифровые бонусы остаётся закрыт.
const appDistribution =
    String.fromEnvironment('CITAVUK_DISTRIBUTION', defaultValue: 'play');
bool get supportLinksHidden =>
    !kIsWeb &&
    defaultTargetPlatform == TargetPlatform.android &&
    appDistribution != 'direct';
