-- Пример к слову: реальная фраза вместо шаблона, плюс её перевод.
--
-- Миграция 0033 заполнила примеры по образцу («Ovo je mačka.», «Sutra ću
-- raditi.»). Как временная мера это работало, но в списке из трёхсот слов
-- подряд идут триста одинаковых конструкций, и читатель видит не употребление
-- слова, а форму самой заглушки. Учить по ней нечему: она не показывает ни
-- управления, ни падежа, ни живого порядка слов.
--
-- Здесь шаблоны стираются, а на их место приходят написанные фразы
-- (0035_roadmap_seed_examples.sql). Слово в обеих фразах помечено звёздочками:
--
--     Naša *mačka* spava na fotelji.
--     Наша *кошка* спит в кресле.
--
-- Разметка, а не отдельная колонка с формой: слово в предложении стоит в
-- падеже («*mačku*»), и искать его потом сопоставлением с начальной формой
-- значило бы решать морфологическую задачу там, где ответ известен заранее.
-- В русском переводе то же самое, и без пометки его вообще не найти: у нас нет
-- русской морфологии, а «кошка» в тексте может стоять как «кошку» или «кошке».

ALTER TABLE roadmap_words
    ADD COLUMN IF NOT EXISTS example_translation text NOT NULL DEFAULT '';

-- Пример перестаёт быть обязательным.
--
-- Пустой пример — честное «примера пока нет», и показывать нечего. Прежний
-- CHECK требовал непустую строку, то есть любое новое слово в админке снова
-- получало бы шаблон только ради того, чтобы пройти ограничение.
ALTER TABLE roadmap_words
    DROP CONSTRAINT IF EXISTS roadmap_words_example_check;

DO $$
BEGIN
    ALTER TABLE roadmap_words
        ADD CONSTRAINT roadmap_words_example_check
        CHECK (length(example) <= 500 AND length(example_translation) <= 500);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Стираются ровно те строки, что породила 0033. Условие описывает шаблоны, а
-- не «всё подряд»: если автор уже поправил пример руками, он должен остаться.
UPDATE roadmap_words
   SET example = ''
 WHERE example IN (
        'Ovo je ' || btrim(lemma) || '.',
        'Ovo su ' || btrim(lemma) || '.',
        'Sutra ću ' || btrim(lemma) || '.',
        'Ovo je ' || btrim(lemma) || ' primer.',
        'U ovoj rečenici koristim prilog „' || btrim(lemma) || '“.',
        'Na kartici piše broj ' || btrim(lemma) || '.',
        'Kažem „' || btrim(lemma) || '“ u razgovoru.',
        'U ovoj rečenici koristim reč „' || btrim(lemma) || '“.'
       )
    OR example = 'Sutra ću se ' || left(btrim(lemma), length(btrim(lemma)) - 3) || '.';

-- Заодно чинится лемма: в словаре стояла форма множественного числа «kese»,
-- и морфология по ней слово не находила. Правится здесь, а не пересевом 0026:
-- у слова уже есть идентификатор, а он считается от леммы, и новая строка
-- означала бы дубль с потерянными отметками читателей.
UPDATE roadmap_words SET lemma = 'kesa', updated_at = now()
 WHERE level = 'A2' AND lemma = 'kese'
   AND NOT EXISTS (
       SELECT 1 FROM roadmap_words other
        WHERE other.level = 'A2' AND other.lemma = 'kesa'
   );
