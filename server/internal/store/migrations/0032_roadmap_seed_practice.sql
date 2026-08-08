-- Собственные темы чтения и письма из общего каталога Тренажёрки.
-- Идентификаторы устойчивы; повторная генерация не сбрасывает прогресс.

INSERT INTO roadmap_items
    (id, level, category, kind, title, summary, payload, position, status)
VALUES
    ('14bd55ec-83e4-568b-948a-f25edeec45e6', 'A1', 'reading', 'text', 'Знакомство и распорядок дня', 'Короткие сообщения о себе, семье и обычном дне.', '{"trainerTopicId":"reading-a1-everyday"}'::jsonb, 1, 'published'),
    ('83d91f53-7c3c-5115-a6d5-71cb460e472e', 'A1', 'writing', 'text', 'О себе и короткие сообщения', 'Напишите простую фразу о себе или бытовую записку.', '{"trainerTopicId":"writing-a1-messages"}'::jsonb, 1, 'published'),
    ('0f5c008e-6d73-5ad8-83d2-0b541e096428', 'A2', 'reading', 'text', 'Поездки, расписания и планы', 'Поймите практическое сообщение и восстановите порядок событий.', '{"trainerTopicId":"reading-a2-plans"}'::jsonb, 1, 'published'),
    ('6c3623e1-3806-55dd-b569-85417968bd9e', 'A2', 'writing', 'text', 'Встреча и рассказ о прошедшем дне', 'Составьте цельное сообщение о планах или недавнем событии.', '{"trainerTopicId":"writing-a2-plans"}'::jsonb, 1, 'published'),
    ('5366c4f3-b8c2-5563-9082-433b630e04e9', 'B1', 'reading', 'text', 'Городские истории и полезные статьи', 'Найдите причину, следствие и позицию автора в связном тексте.', '{"trainerTopicId":"reading-b1-city"}'::jsonb, 1, 'published'),
    ('b6da0d14-325f-5d61-b1a6-9206293d1880', 'B1', 'writing', 'text', 'Личное письмо и связный рассказ', 'Соедините события и объясните причину своего решения.', '{"trainerTopicId":"writing-b1-story"}'::jsonb, 1, 'published'),
    ('378e8488-dd38-5484-9ac2-69cb19d37174', 'B2', 'reading', 'text', 'Мнения и культурная публицистика', 'Различайте тезис, оговорку и скрытое отношение автора.', '{"trainerTopicId":"reading-b2-opinions"}'::jsonb, 1, 'published'),
    ('f50c90f5-c6ac-5385-91ed-e1eafc4d6f52', 'B2', 'writing', 'text', 'Аргумент и официальное обращение', 'Сформулируйте позицию с оговоркой или вежливое требование.', '{"trainerTopicId":"writing-b2-argument"}'::jsonb, 1, 'published')
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    payload = EXCLUDED.payload,
    position = EXCLUDED.position,
    status = EXCLUDED.status,
    updated_at = now();

INSERT INTO roadmap_sections (level, category, intro)
VALUES
    ('A1', 'reading', 'Короткие бытовые тексты: знакомство, вывески и распорядок дня.'),
    ('A1', 'writing', 'Простые фразы о себе и короткие бытовые сообщения.'),
    ('A2', 'reading', 'Практические сообщения о поездках, встречах и планах.'),
    ('A2', 'writing', 'Сообщения о планах и связный рассказ о прошедшем дне.'),
    ('B1', 'reading', 'Связные истории и статьи, где нужно увидеть причину и следствие.'),
    ('B1', 'writing', 'Личные письма, просьбы и последовательный рассказ о событии.'),
    ('B2', 'reading', 'Публицистика: тезис, оговорка и отношение автора.'),
    ('B2', 'writing', 'Аргументированная позиция и официальное обращение.')
ON CONFLICT (level, category) DO UPDATE SET
    intro = EXCLUDED.intro,
    updated_at = now();
