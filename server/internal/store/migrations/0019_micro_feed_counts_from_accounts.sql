-- Публичные счётчики реакций пересчитываются только по вошедшим читателям.
--
-- Гостевой идентификатор ленты придумывал сам браузер, поэтому «популярное»
-- накручивалось сменой строки в запросе. Теперь идентификатор подписывает
-- сервер, но подпись выдаётся любому, кто попросит, — общий рейтинг она защитить
-- не может. Его формируют только аккаунты (см. store.updateMicroFeedReaction).
--
-- Реакции гостей НЕ удаляются: они по-прежнему формируют личный подбор ленты,
-- и стирать их значило бы обнулить рекомендации всем, кто читает без входа.
-- Пересчёт идёт по строкам с user_id, а не вычитанием: накопленную разницу
-- вычитать не из чего — сколько в счётчике было гостевого, нигде не записано.

UPDATE micro_feed_content_items AS item
   SET likes_count = coalesce(counted.likes, 0),
       dislikes_count = coalesce(counted.dislikes, 0)
  FROM (
        SELECT c.id,
               count(*) FILTER (WHERE r.reaction = 1)  AS likes,
               count(*) FILTER (WHERE r.reaction = -1) AS dislikes
          FROM micro_feed_content_items c
          LEFT JOIN micro_feed_reactions r
                 ON r.item_id = c.id AND r.user_id IS NOT NULL
         GROUP BY c.id
       ) AS counted
 WHERE item.id = counted.id
   AND (item.likes_count, item.dislikes_count)
       IS DISTINCT FROM (coalesce(counted.likes, 0), coalesce(counted.dislikes, 0));
