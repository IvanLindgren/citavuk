import 'package:flutter/foundation.dart';

/// Ссылки на оплату поддержки скрыты в Android-сборке: поддержка открывает
/// цифровые бонусы, а Google Play запрещает вести к оплате мимо своего
/// биллинга. Бонусы, купленные на сайте, в приложении работают.
bool get supportLinksHidden => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
