-- Перенос доступной истории без начисления наград и без расхода заморозок
-- задним числом. Прежние счётчики повторений считались в UTC.
INSERT INTO study_days(user_id,day,kind)
 SELECT DISTINCT r.user_id,(to_timestamp(r.last_reviewed/1000.0) AT TIME ZONE 'UTC')::date,'active'
 FROM reviews r WHERE NOT r.deleted AND r.last_reviewed BETWEEN 0 AND extract(epoch FROM now())*1000
 AND NOT EXISTS(SELECT 1 FROM study_streaks s WHERE s.user_id=r.user_id)
 ON CONFLICT DO NOTHING;

INSERT INTO study_days(user_id,day,kind)
 SELECT DISTINCT a.user_id,(a.created_at AT TIME ZONE 'UTC')::date,'active'
 FROM quiz_attempts a WHERE a.total>0 AND a.created_at<=now()
 AND NOT EXISTS(SELECT 1 FROM study_streaks s WHERE s.user_id=a.user_id)
 ON CONFLICT DO NOTHING;

WITH numbered AS (
 SELECT user_id,day,day-(row_number() OVER(PARTITION BY user_id ORDER BY day))::integer AS island
 FROM study_days WHERE kind='active'
), runs AS (
 SELECT user_id,count(*)::integer AS length,max(day) AS last_day FROM numbered GROUP BY user_id,island
), stats AS (
 SELECT user_id,max(length) AS longest,sum(length)::integer AS active_days,max(last_day) AS last_day,
 max(CASE WHEN last_day >= (now() AT TIME ZONE 'UTC')::date-1 THEN length ELSE 0 END) AS current
 FROM runs GROUP BY user_id
)
INSERT INTO study_streaks(user_id,current,longest,active_days,last_day,today_active)
 SELECT user_id,current,longest,active_days,last_day,last_day=(now() AT TIME ZONE 'UTC')::date FROM stats
 ON CONFLICT DO NOTHING;
