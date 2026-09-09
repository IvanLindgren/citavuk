import 'daily.dart';

class PersonalQuestion {
  PersonalQuestion.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        options = (j['options'] as List).cast<String>(),
        multiple = j['multiple'] == true,
        exclusive = j['exclusive'] as String?;
  final String id, title;
  final List<String> options;
  final bool multiple;
  final String? exclusive;

  String toggle(String current, String option) {
    if (!multiple) return option;
    final selected = current.isEmpty ? <String>{} : current.split('\n').toSet();
    if (selected.contains(option)) {
      selected.remove(option);
    } else {
      if (option == exclusive) {
        selected.clear();
      } else {
        selected.remove(exclusive);
      }
      selected.add(option);
    }
    return options.where(selected.contains).join('\n');
  }
}

class PersonalContent {
  PersonalContent.fromJson(Map<String, dynamic> j)
      : title = j['title'] as String,
        kind = j['kind'] as String,
        theme = j['theme'] as String,
        text = j['text'] as String,
        rules = (j['rules'] as List).cast<String>(),
        schemeTitle = (j['scheme'] as Map)['title'] as String,
        columns = ((j['scheme'] as Map)['columns'] as List).cast<String>(),
        rows = ((j['scheme'] as Map)['rows'] as List)
            .map((r) => (r as List).cast<String>())
            .toList(),
        exercises = (j['exercises'] as List)
            .map((e) =>
                DailyExercise.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
  final String title, kind, theme, text, schemeTitle;
  final List<String> rules, columns;
  final List<List<String>> rows;
  final List<DailyExercise> exercises;
  Map<String, dynamic> toJson() => {
        'title': title,
        'kind': kind,
        'theme': theme,
        'text': text,
        'rules': rules,
        'scheme': {'title': schemeTitle, 'columns': columns, 'rows': rows},
        'exercises': exercises
            .map((e) => {
                  'kind': e.kind,
                  'question': e.question,
                  'options': e.options,
                  'answer': e.answer,
                  'acceptedAnswers': e.acceptedAnswers,
                  'hint': e.hint
                })
            .toList()
      };
}

class PersonalCard {
  PersonalCard.fromJson(Map<String, dynamic> j)
      : day = j['day'] as int,
        revision = j['revision'] as int,
        edited = j['edited'] == true,
        completedAt = DateTime.tryParse(j['completedAt'] as String? ?? ''),
        score = j['score'] as int?,
        total = j['total'] as int?,
        rating = j['rating'] as int,
        unlocked = j['unlocked'] == true;
  final int day, revision, rating;
  final int? score, total;
  final bool edited, unlocked;
  final DateTime? completedAt;
}

class PersonalLesson {
  PersonalLesson.fromJson(Map<String, dynamic> j)
      : card = PersonalCard.fromJson(j),
        content = PersonalContent.fromJson(
            Map<String, dynamic>.from(j['content'] as Map));
  final PersonalCard card;
  final PersonalContent content;
}

class PersonalOutline {
  PersonalOutline.fromJson(Map<String, dynamic> j)
      : day = j['day'] as int,
        title = j['title'] as String,
        kind = j['kind'] as String;
  final int day;
  final String title, kind;
}

class PersonalPlan {
  PersonalPlan.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        status = j['status'] as String,
        level = (j['profile'] as Map)['level'] as String,
        timezone = (j['profile'] as Map)['timezone'] as String,
        today = j['today'] as int,
        month = j['month'] as int,
        regenerations = j['regenerations'] as int,
        error = j['error'] as String?,
        suggestRegeneration = j['suggestRegeneration'] == true,
        outline = (j['outline'] as List)
            .map((o) =>
                PersonalOutline.fromJson(Map<String, dynamic>.from(o as Map)))
            .toList(),
        lessons = (j['lessons'] as List)
            .map((l) =>
                PersonalCard.fromJson(Map<String, dynamic>.from(l as Map)))
            .toList();
  final String id, status, level, timezone;
  final String? error;
  final int today, regenerations, month;
  final bool suggestRegeneration;
  final List<PersonalOutline> outline;
  final List<PersonalCard> lessons;
  bool get generating => status == 'queued' || status == 'running';
}

class PersonalState {
  PersonalState.fromJson(Map<String, dynamic> j)
      : available = j['available'] == true,
        history = (j['history'] as List? ?? const [])
            .map((h) => PersonalHistoryItem.fromJson(
                Map<String, dynamic>.from(h as Map)))
            .toList(),
        questions = (j['questions'] as List)
            .map((q) =>
                PersonalQuestion.fromJson(Map<String, dynamic>.from(q as Map)))
            .toList(),
        plan = j['plan'] == null
            ? null
            : PersonalPlan.fromJson(
                Map<String, dynamic>.from(j['plan'] as Map));
  final bool available;
  final List<PersonalHistoryItem> history;
  final List<PersonalQuestion> questions;
  final PersonalPlan? plan;
}

class PersonalHistoryItem {
  PersonalHistoryItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        level = j['level'] as String,
        startedAt = DateTime.parse(j['startedAt'] as String);
  final String id, level;
  final DateTime startedAt;
}

const personalKinds = {
  'reading': 'Чтение',
  'grammar': 'Грамматика',
  'vocabulary': 'Лексика',
  'listening': 'Понимание речи',
  'writing': 'Письмо'
};
