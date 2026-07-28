/// Политика конфиденциальности внутри приложения.
///
/// Текст встроен, а не открывается ссылкой: приложение работает офлайн, и
/// документ должен читаться без интернета. Полная версия — citavuk.ru/privacy,
/// исходник — docs/privacy-policy.md.
library;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const privacyUrl = 'https://citavuk.ru/privacy';
const supportEmail = 'deniskornilov12@gmail.com';

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Политика конфиденциальности')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          Text('Действует с 28 июля 2026 года.', style: text.bodySmall),
          const SizedBox(height: 16),
          ..._sections.expand((section) => [
                Text(section.title, style: text.titleMedium),
                const SizedBox(height: 6),
                ...section.points.map((point) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('•  ', style: text.bodyMedium),
                          Expanded(
                              child: Text(point, style: text.bodyMedium)),
                        ],
                      ),
                    )),
                const SizedBox(height: 18),
              ]),
          FilledButton.icon(
            icon: const Icon(Icons.open_in_new, size: 18),
            label: const Text('Полный текст на сайте'),
            onPressed: () => launchUrl(Uri.parse(privacyUrl),
                mode: LaunchMode.externalApplication),
          ),
          const SizedBox(height: 10),
          Text('Вопросы и запросы на удаление данных: $supportEmail',
              style: text.bodySmall),
        ],
      ),
    );
  }
}

class _Section {
  const _Section(this.title, this.points);
  final String title;
  final List<String> points;
}

const _sections = [
  _Section('Коротко', [
    'Без аккаунта книги, слова и прогресс хранятся только на этом устройстве.',
    'Аккаунт нужен, чтобы те же данные были на телефоне, компьютере и сайте.',
    'Рекламы, трекеров и систем аналитики в приложении нет.',
    'Данные не продаются и не передаются третьим лицам для маркетинга.',
    'Аккаунт можно удалить вместе со всеми данными в любой момент.',
  ]),
  _Section('Что уходит на сервер без аккаунта', [
    'Только текст для перевода и разбора: слово и предложение, где оно стоит.',
    'Запрос анонимен, он не связывается с человеком и не хранится в профиле.',
  ]),
  _Section('Что хранится при регистрации', [
    'Адрес почты и отображаемое имя.',
    'Хеш пароля — сам пароль не хранится.',
    'Идентификатор Google или Яндекс ID, если вход через них.',
    'Активные сессии: устройство, платформа, время входа.',
  ]),
  _Section('Что синхронизируется', [
    'Книги и их текст — чтобы открыть книгу на другом устройстве.',
    'Сохранённые слова, переводы и разборы.',
    'Карточки повторения и расписание повторов.',
    'Прогресс курса и дворцы памяти.',
  ]),
  _Section('Что не собирается', [
    'Геолокация, контакты, список установленных программ.',
    'Рекламные идентификаторы и история просмотров вне приложения.',
    'Аналитика поведения и отчёты о сбоях.',
  ]),
  _Section('Кому передаются данные', [
    'DeepL — текст для перевода.',
    'Google Переводчик — текст для перевода, когда DeepL недоступен.',
    'Google и Яндекс — данные входа, если выбран вход через них.',
  ]),
  _Section('Удаление аккаунта', [
    'В приложении: «Аккаунт и синхронизация» → «Удалить аккаунт».',
    'На сайте: citavuk.ru/account.',
    'Удаление необратимо; данные на самом устройстве при этом остаются.',
  ]),
];
