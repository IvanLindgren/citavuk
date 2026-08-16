/// Матч «Ты против переводчика» на несколько человек.
///
/// Живого канала нет: комната опрашивается обычным GET раз в пару секунд. Всё,
/// что должно случиться само — кончился раунд, никто не пришёл, пора судить, —
/// сервер делает в момент опроса.
///
/// У участника есть своя подпись, отдельная от аккаунта: сервер выдаёт её при
/// входе, приложение хранит и отправляет обратно. Без подписи человек был бы
/// для комнаты новым после каждого перезапуска.
library;

import 'package:shared_preferences/shared_preferences.dart';

import '../../services/api_client.dart';

enum DuelPhase { lobby, translate, judging, vote, result, finished }

DuelPhase _phaseOf(String raw) => switch (raw) {
      'translate' => DuelPhase.translate,
      'judging' => DuelPhase.judging,
      'vote' => DuelPhase.vote,
      'result' => DuelPhase.result,
      'finished' => DuelPhase.finished,
      _ => DuelPhase.lobby,
    };

class DuelPlayer {
  const DuelPlayer({
    required this.id,
    required this.name,
    required this.machine,
    required this.host,
    required this.joined,
    required this.ready,
    required this.left,
    required this.score,
    required this.you,
    required this.progress,
    required this.voted,
  });

  final String id;
  final String name;

  /// Пусто у человека, `deepl`/`google` у машины за столом.
  final String machine;
  final bool host;
  final bool joined;
  final bool ready;
  final bool left;
  final int score;
  final bool you;

  /// Сколько фраз раунда переведено. Текста тут нет — только число.
  final int progress;

  /// Отдал все свои голоса.
  final bool voted;

  bool get isMachine => machine.isNotEmpty;

  factory DuelPlayer.fromJson(Map<String, dynamic> json) => DuelPlayer(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        machine: json['machine'] as String? ?? '',
        host: json['host'] as bool? ?? false,
        joined: json['joined'] as bool? ?? false,
        ready: json['ready'] as bool? ?? false,
        left: json['left'] as bool? ?? false,
        score: (json['score'] as num?)?.toInt() ?? 0,
        you: json['you'] as bool? ?? false,
        progress: (json['progress'] as num?)?.toInt() ?? 0,
        voted: json['voted'] as bool? ?? false,
      );
}

class DuelSentence {
  const DuelSentence({required this.id, required this.text});

  final String id;
  final String text;

  factory DuelSentence.fromJson(Map<String, dynamic> json) => DuelSentence(
        id: json['id'] as String? ?? '',
        text: json['text'] as String? ?? '',
      );
}

/// Перевод на голосовании — без автора.
class DuelBallotOption {
  const DuelBallotOption({required this.alias, required this.text});

  final String alias;
  final String text;

  factory DuelBallotOption.fromJson(Map<String, dynamic> json) =>
      DuelBallotOption(
        alias: json['alias'] as String? ?? '',
        text: json['text'] as String? ?? '',
      );
}

class DuelBallotSentence {
  const DuelBallotSentence({
    required this.sentenceId,
    required this.text,
    required this.options,
  });

  final String sentenceId;
  final String text;
  final List<DuelBallotOption> options;

  factory DuelBallotSentence.fromJson(Map<String, dynamic> json) =>
      DuelBallotSentence(
        sentenceId: json['sentenceId'] as String? ?? '',
        text: json['text'] as String? ?? '',
        options: ((json['options'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                DuelBallotOption.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
      );
}

class DuelRevealAnswer {
  const DuelRevealAnswer({
    required this.playerId,
    required this.name,
    required this.machine,
    required this.text,
    required this.score,
    required this.won,
    required this.you,
  });

  final String playerId;
  final String name;
  final String machine;
  final String text;
  final double? score;
  final bool won;
  final bool you;

  bool get isMachine => machine.isNotEmpty;

  factory DuelRevealAnswer.fromJson(Map<String, dynamic> json) =>
      DuelRevealAnswer(
        playerId: json['playerId'] as String? ?? '',
        name: json['name'] as String? ?? '',
        machine: json['machine'] as String? ?? '',
        text: json['text'] as String? ?? '',
        score: (json['score'] as num?)?.toDouble(),
        won: json['won'] as bool? ?? false,
        you: json['you'] as bool? ?? false,
      );
}

class DuelRevealSentence {
  const DuelRevealSentence({
    required this.sentenceId,
    required this.text,
    required this.answers,
    required this.feedback,
  });

  final String sentenceId;
  final String text;
  final List<DuelRevealAnswer> answers;
  final String feedback;

  factory DuelRevealSentence.fromJson(Map<String, dynamic> json) =>
      DuelRevealSentence(
        sentenceId: json['sentenceId'] as String? ?? '',
        text: json['text'] as String? ?? '',
        answers: ((json['answers'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                DuelRevealAnswer.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        feedback: json['feedback'] as String? ?? '',
      );
}

class DuelRoomStanding {
  const DuelRoomStanding({
    required this.id,
    required this.name,
    required this.score,
    required this.place,
    required this.machine,
  });

  final String id;
  final String name;
  final int score;
  final int place;
  final String machine;

  bool get isMachine => machine.isNotEmpty;

  factory DuelRoomStanding.fromJson(Map<String, dynamic> json) =>
      DuelRoomStanding(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        score: (json['score'] as num?)?.toInt() ?? 0,
        place: (json['place'] as num?)?.toInt() ?? 0,
        machine: json['machine'] as String? ?? '',
      );
}

class DuelRoom {
  const DuelRoom({
    required this.code,
    required this.level,
    required this.direction,
    required this.seats,
    required this.open,
    required this.matched,
    required this.phase,
    required this.round,
    required this.rounds,
    required this.you,
    required this.host,
    required this.players,
    required this.sentences,
    required this.answers,
    required this.votes,
    required this.ballot,
    required this.reveal,
    required this.summary,
    required this.standings,
    required this.deadline,
    required this.now,
  });

  final String code;
  final String level;
  final String direction;
  final int seats;
  final bool open;
  final bool matched;
  final DuelPhase phase;
  final int round;
  final int rounds;

  /// Идентификатор того, кто смотрит. Пусто у постороннего.
  final String you;
  final bool host;
  final List<DuelPlayer> players;
  final List<DuelSentence> sentences;

  /// Свои переводы и свои голоса. Чужих здесь не бывает.
  final Map<String, String> answers;
  final Map<String, String> votes;
  final List<DuelBallotSentence> ballot;
  final List<DuelRevealSentence> reveal;
  final String summary;
  final List<DuelRoomStanding> standings;
  final DateTime? deadline;

  /// Часы сервера: остаток времени считается от них, а не от часов телефона.
  final DateTime now;

  /// За столом — все, кто не ушёл.
  List<DuelPlayer> get seated =>
      players.where((player) => !player.left).toList();

  DuelPlayer? get me {
    for (final player in players) {
      if (player.you) return player;
    }
    return null;
  }

  /// Сколько секунд осталось до конца фазы по часам сервера.
  int get secondsLeft {
    final end = deadline;
    if (end == null) return 0;
    final left = end.difference(now).inSeconds;
    return left < 0 ? 0 : left;
  }

  factory DuelRoom.fromJson(Map<String, dynamic> json) => DuelRoom(
        code: json['code'] as String? ?? '',
        level: json['level'] as String? ?? 'A2',
        direction: json['direction'] as String? ?? 'sr-ru',
        seats: (json['seats'] as num?)?.toInt() ?? 2,
        open: json['open'] as bool? ?? false,
        matched: json['matched'] as bool? ?? false,
        phase: _phaseOf(json['phase'] as String? ?? 'lobby'),
        round: (json['round'] as num?)?.toInt() ?? 0,
        rounds: (json['rounds'] as num?)?.toInt() ?? 3,
        you: json['you'] as String? ?? '',
        host: json['host'] as bool? ?? false,
        players: ((json['players'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => DuelPlayer.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        sentences: ((json['sentences'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) => DuelSentence.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        answers: Map<String, String>.from(
          (json['answers'] as Map?)?.map(
                (key, value) => MapEntry('$key', '${value ?? ''}'),
              ) ??
              const {},
        ),
        votes: Map<String, String>.from(
          (json['votes'] as Map?)?.map(
                (key, value) => MapEntry('$key', '${value ?? ''}'),
              ) ??
              const {},
        ),
        ballot: ((json['ballot'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                DuelBallotSentence.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        reveal: ((json['reveal'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                DuelRevealSentence.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        summary: json['summary'] as String? ?? '',
        standings: ((json['standings'] as List?) ?? const [])
            .whereType<Map>()
            .map((item) =>
                DuelRoomStanding.fromJson(Map<String, dynamic>.from(item)))
            .toList(),
        deadline: DateTime.tryParse(json['deadline'] as String? ?? ''),
        now: DateTime.tryParse(json['now'] as String? ?? '') ?? DateTime.now(),
      );
}

/// Состояние подбора соперника.
class DuelQueueState {
  const DuelQueueState({
    required this.waiting,
    required this.seats,
    required this.ripe,
    required this.room,
    required this.searching,
  });

  final bool waiting;
  final int seats;

  /// Ожидание затянулось: пора предложить сыграть с машиной.
  final bool ripe;

  /// Код найденной комнаты.
  final String room;
  final int searching;

  factory DuelQueueState.fromJson(Map<String, dynamic> json) => DuelQueueState(
        waiting: json['waiting'] as bool? ?? false,
        seats: (json['seats'] as num?)?.toInt() ?? 0,
        ripe: json['ripe'] as bool? ?? false,
        room: json['room'] as String? ?? '',
        searching: (json['searching'] as num?)?.toInt() ?? 0,
      );
}

/// Сколько фаза длится по замыслу — от этого считается дуга часов.
int phaseSeconds(DuelPhase phase) => switch (phase) {
      DuelPhase.translate => 200,
      DuelPhase.vote => 90,
      DuelPhase.result => 30,
      _ => 60,
    };

class DuelRoomService {
  DuelRoomService(this.api);

  final ApiClient api;

  static const _tokenKey = 'citavuk-duel-player';
  static const _nameKey = 'citavuk-duel-player-name';

  String _token = '';

  /// Подпись участника переживает перезапуск: иначе после возврата в
  /// приложение человек оказался бы в своей же комнате новым игроком.
  Future<void> restore() async {
    final store = await SharedPreferences.getInstance();
    _token = store.getString(_tokenKey) ?? '';
  }

  Future<String> savedName() async {
    final store = await SharedPreferences.getInstance();
    return store.getString(_nameKey) ?? '';
  }

  Future<void> rememberName(String name) async {
    final clean = name.trim();
    if (clean.isEmpty) return;
    final store = await SharedPreferences.getInstance();
    await store.setString(_nameKey, clean);
  }

  Map<String, String> get _extra =>
      _token.isEmpty ? const {} : {'X-Duel-Player': _token};

  Future<void> _remember(Object? raw) async {
    final token = (raw as Map?)?['token'] as String? ?? '';
    if (token.isEmpty || token == _token) return;
    _token = token;
    final store = await SharedPreferences.getInstance();
    await store.setString(_tokenKey, token);
  }

  Future<DuelRoom> _room(Future<dynamic> Function() run) async {
    final raw = await run();
    await _remember(raw);
    final map = Map<String, dynamic>.from(raw as Map);
    return DuelRoom.fromJson(Map<String, dynamic>.from(map['room'] as Map));
  }

  Future<DuelRoom> create({
    required String level,
    required String direction,
    required int seats,
    String name = '',
    bool open = true,
  }) {
    rememberName(name);
    return _room(() => api.post('/v1/duel/rooms', {
          'level': level,
          'direction': direction,
          'seats': seats,
          if (name.isNotEmpty) 'name': name,
          'open': open,
        }, extra: _extra));
  }

  Future<DuelRoom> join(String code, {String name = ''}) {
    rememberName(name);
    return _room(() => api.post(
          '/v1/duel/rooms/$code/join',
          {if (name.isNotEmpty) 'name': name},
          extra: _extra,
        ));
  }

  Future<DuelRoom> load(String code) =>
      _room(() => api.get('/v1/duel/rooms/$code', extra: _extra));

  Future<DuelRoom> addMachine(String code, String provider) => _room(
        () => api.post('/v1/duel/rooms/$code/machine', {'provider': provider},
            extra: _extra),
      );

  /// Начало раунда переводит фразы для машин за столом, поэтому ждём дольше.
  Future<DuelRoom> start(String code) => _room(
        () => api.post('/v1/duel/rooms/$code/start', null,
            extra: _extra, timeout: const Duration(seconds: 45)),
      );

  Future<DuelRoom> answer(String code, String sentenceId, String text) => _room(
        () => api.post('/v1/duel/rooms/$code/answer',
            {'sentenceId': sentenceId, 'text': text},
            extra: _extra),
      );

  /// Черновик всего раунда разом.
  ///
  /// Уходит сам, пока человек печатает: переводы, отправленные только по
  /// кнопке «Сдать», пропадали целиком у того, кто не успел до звонка.
  Future<DuelRoom> draft(String code, Map<String, String> answers) => _room(
        () => api.post('/v1/duel/rooms/$code/answers', {'answers': answers},
            extra: _extra),
      );

  Future<DuelRoom> ready(String code) => _room(
        () => api.post('/v1/duel/rooms/$code/ready', null, extra: _extra),
      );

  Future<DuelRoom> vote(String code, String sentenceId, String alias) => _room(
        () => api.post('/v1/duel/rooms/$code/vote',
            {'sentenceId': sentenceId, 'alias': alias},
            extra: _extra),
      );

  Future<DuelRoom> leave(String code) => _room(
        () => api.post('/v1/duel/rooms/$code/leave', null, extra: _extra),
      );

  Future<DuelQueueState> _queue(Future<dynamic> Function() run) async {
    final raw = await run();
    await _remember(raw);
    return DuelQueueState.fromJson(Map<String, dynamic>.from(raw as Map));
  }

  Future<DuelQueueState> enterQueue({
    required String level,
    required String direction,
    required int seats,
    String name = '',
  }) {
    rememberName(name);
    return _queue(() => api.post('/v1/duel/queue', {
          'level': level,
          'direction': direction,
          'seats': seats,
          if (name.isNotEmpty) 'name': name,
        }, extra: _extra));
  }

  Future<DuelQueueState> queueState() =>
      _queue(() => api.get('/v1/duel/queue', extra: _extra));

  Future<DuelQueueState> leaveQueue() =>
      _queue(() => api.delete('/v1/duel/queue', extra: _extra));
}
