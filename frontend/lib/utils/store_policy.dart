import 'package:flutter/foundation.dart';

/// Ссылки на оплату поддержки скрыты в Android-сборке и на iPhone: поддержка
/// открывает цифровые бонусы, а Google Play и App Store запрещают вести к
/// оплате мимо своего биллинга (у Apple — правило 3.1.1). Бонусы, купленные
/// на сайте, в приложении работают.
// APK с сайта собирается с --dart-define=CITAVUK_DISTRIBUTION=direct.
// В Google Play внешний платёж за цифровые бонусы остаётся закрыт.
const appDistribution =
    String.fromEnvironment('CITAVUK_DISTRIBUTION', defaultValue: 'play');
bool get supportLinksHidden =>
    !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.iOS ||
        (defaultTargetPlatform == TargetPlatform.android &&
            appDistribution != 'direct'));
