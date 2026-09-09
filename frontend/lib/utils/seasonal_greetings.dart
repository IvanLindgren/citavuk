import '../widgets/wolf_mascot.dart';

/// Сезонные и ежемесячные приветствия волка.
///
/// Сербские праздники (Божић, Сретење, Васкрс, Ђурђевдан, Видовдан) плюс
/// международные даты, близкие читателю (Новый год, День родного языка,
/// 8 Марта, День книги, День знаний), плюс 1-е число каждого месяца с
/// сербским названием месяца — маленькая порция языка без учебника.
///
/// Правила:
/// - в день совпадения побеждает праздник, а не 1-е число (1 сентября —
///   День знаний, а не «новый месяц»; 1 января — Новый год);
/// - Васкрс переходящий: считается православная Пасхалия (алгоритм Миуса),
///   а не фиксированная дата;
/// - тексты короткие, русские первыми; сербское слово — только узнаваемое
///   приветствие или название месяца, новичка оно не потеряет.
/// Чистые функции, покрыты тестами.
class SeasonalGreeting {
  const SeasonalGreeting({
    required this.id,
    required this.tag,
    required this.title,
    required this.text,
    required this.asset,
  });

  final String id;
  final String tag;
  final String title;
  final String text;
  final String asset;
}

/// Сербские названия месяцев кириллицей — для приветствия 1-го числа.
const serbianMonths = [
  'јануар',
  'фебруар',
  'март',
  'април',
  'мај',
  'јун',
  'јул',
  'август',
  'септембар',
  'октобар',
  'новембар',
  'децембар',
];

/// Приветствие на дату или null, если день обычный. Время суток не важно —
/// решает вызывающий экран (вечером волк и так прощается).
SeasonalGreeting? seasonalGreeting(DateTime now) {
  switch ((now.month, now.day)) {
    case (1, 1):
      return const SeasonalGreeting(
        id: 'new-year',
        tag: 'Праздник',
        title: 'С Новым годом!',
        text: 'Срећна Нова година! Пусть в новом году сербские книги '
            'открываются легко.',
        asset: Wolf.slavlje,
      );
    case (12, 31):
      return const SeasonalGreeting(
        id: 'new-year-eve',
        tag: 'Праздник',
        title: 'Год на исходе',
        text: 'Завтра — Новый год. Дочитай страницу и загадай желание '
            'по-сербски!',
        asset: Wolf.slavlje,
      );
    case (1, 7):
      return const SeasonalGreeting(
        id: 'christmas',
        tag: 'Праздник',
        title: 'С Рождеством!',
        text: 'Христос се роди! Сербия празднует Божић — самое тёплое время '
            'для чтения.',
        asset: Wolf.zdravo,
      );
    case (2, 15):
      return const SeasonalGreeting(
        id: 'sretenje',
        tag: 'День Сербии',
        title: 'Сретење',
        text: 'День государственности Сербии. Хороший повод открыть '
            'сербскую книгу.',
        asset: Wolf.zdravo,
      );
    case (2, 21):
      return const SeasonalGreeting(
        id: 'mother-language',
        tag: 'Праздник',
        title: 'День родного языка',
        text: 'Сегодня мир празднует языки. Твой сербский уже звучит — '
            'продолжай!',
        asset: Wolf.gram,
      );
    case (3, 8):
      return const SeasonalGreeting(
        id: 'march-8',
        tag: 'Праздник',
        title: 'С 8 Марта!',
        text: 'Пусть сербские слова даются легко, а книги попадаются '
            'интересные!',
        asset: Wolf.slavlje,
      );
    case (4, 23):
      return const SeasonalGreeting(
        id: 'book-day',
        tag: 'Праздник',
        title: 'День книги',
        text: 'Всемирный день книги — твой праздник, читатель. Открой любимую!',
        asset: Wolf.cita,
      );
    case (5, 6):
      return const SeasonalGreeting(
        id: 'djurdjevdan',
        tag: 'Праздник',
        title: 'Ђурђевдан',
        text: 'Один из самых любимых праздников Сербии. Срећна слава тем, '
            'кто празднует!',
        asset: Wolf.zdravo,
      );
    case (6, 28):
      return const SeasonalGreeting(
        id: 'vidovdan',
        tag: 'День Сербии',
        title: 'Видовдан',
        text: 'День святого Вита — важная дата сербской истории и культуры.',
        asset: Wolf.cita,
      );
    case (9, 1):
      return const SeasonalGreeting(
        id: 'knowledge-day',
        tag: 'Праздник',
        title: 'С Днём знаний!',
        text: 'Новый учебный год — новые слова. Вперёд!',
        asset: Wolf.slavlje,
      );
    default:
      break;
  }
  final easter = orthodoxEaster(now.year);
  if (now.month == easter.month && now.day == easter.day) {
    return const SeasonalGreeting(
      id: 'easter',
      tag: 'Праздник',
      title: 'С Пасхой!',
      text: 'Христос васкрсе! Светлого Васкрса.',
      asset: Wolf.slavlje,
    );
  }
  if (now.day == 1) {
    final month = serbianMonths[now.month - 1];
    return SeasonalGreeting(
      id: 'month-start',
      tag: 'Новый месяц',
      title: 'Стигао је $month!',
      text: 'Новый месяц — чистые страницы. Начнём его с пары страниц?',
      asset: Wolf.zdravo,
    );
  }
  return null;
}

/// Православная Пасха по алгоритму Миуса (юлианская дата + 13 дней).
/// Проверена тестом на 2024–2026: 5 мая, 20 апреля, 12 апреля.
DateTime orthodoxEaster(int year) {
  final a = year % 4;
  final b = year % 7;
  final c = year % 19;
  final d = (19 * c + 15) % 30;
  final e = (2 * a + 4 * b - d + 34) % 7;
  final month = (d + e + 114) ~/ 31;
  final day = ((d + e + 114) % 31) + 1;
  return DateTime(year, month, day).add(const Duration(days: 13));
}
