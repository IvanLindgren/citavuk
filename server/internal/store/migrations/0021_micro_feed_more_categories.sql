-- Больше тем в Вукотоке.
--
-- Шести тем мало для ленты, которую листают каждый день: «культура» собирала
-- всё, что не новость и не наука, и лента выглядела однообразной независимо от
-- ответов в анкете. Новые темы выбраны не «чтобы было», а по тому, ради чего
-- сербский учат в первую очередь: поехать, поесть, понять песню и разобраться в
-- самом языке.
--
-- Ограничение пересоздаётся целиком: ALTER ... ADD CHECK не расширяет
-- существующее, а добавляет второе, и старое продолжало бы запрещать новое.
ALTER TABLE micro_feed_content_items
    DROP CONSTRAINT IF EXISTS micro_feed_content_items_category_check;

ALTER TABLE micro_feed_content_items
    ADD CONSTRAINT micro_feed_content_items_category_check
    CHECK (category IN (
        'history', 'culture', 'science', 'fiction', 'society', 'news',
        'travel', 'food', 'sport', 'music', 'language'
    ));
