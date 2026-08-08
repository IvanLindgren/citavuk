-- 0028 уже могла быть применена до добавления связи с Тренажёркой.
-- Отдельная миграция нужна существующим базам: применённые SQL-файлы сервер
-- намеренно не запускает повторно после изменения их содержимого.
UPDATE roadmap_items
   SET payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
       'trainerTopicId',
       format('grammar-%s-%s', lower(level), lpad(position::text, 2, '0'))
   ),
       updated_at = now()
 WHERE level IN ('A1','A2','B1','B2')
   AND category = 'grammar'
   AND kind = 'grammar_topic';
