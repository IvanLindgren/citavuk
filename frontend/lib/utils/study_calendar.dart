/// Календарь использует дату серии с сервера, не часовой пояс телефона.
class StudyMonth {
  StudyMonth(this.first);
  final DateTime first;
  int get padding => first.weekday - 1;
  int get dayCount => DateTime.utc(first.year, first.month + 1, 0).day;
  String date(int day) =>
      '${first.year.toString().padLeft(4, '0')}-${first.month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
  String get label => '${const [
        'Январь',
        'Февраль',
        'Март',
        'Апрель',
        'Май',
        'Июнь',
        'Июль',
        'Август',
        'Сентябрь',
        'Октябрь',
        'Ноябрь',
        'Декабрь'
      ][first.month - 1]} ${first.year}';
}

StudyMonth? studyMonth(String today, [int offset = 0]) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(today)) return null;
  final parsed = DateTime.tryParse('${today}T12:00:00Z');
  if (parsed == null || parsed.toIso8601String().substring(0, 10) != today) {
    return null;
  }
  return StudyMonth(DateTime.utc(parsed.year, parsed.month + offset));
}

Map<String, dynamic>? latestStudyData(
    Map<String, dynamic>? initial, Map<String, dynamic>? live) {
  if (initial == null) return live;
  if (live == null) return initial;
  int stamp(Map<String, dynamic> value) =>
      DateTime.tryParse('${value['asOf'] ?? ''}')?.millisecondsSinceEpoch ?? 0;
  return stamp(live) >= stamp(initial) ? live : initial;
}
