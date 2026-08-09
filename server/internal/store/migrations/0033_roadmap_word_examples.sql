-- Every roadmap word needs a sentence: isolated translations are poor study
-- material and cannot be carried into spaced-repetition cards with context.
ALTER TABLE roadmap_words
    ADD COLUMN example text NOT NULL DEFAULT '';

UPDATE roadmap_words
   SET example = CASE upper(btrim(pos))
       WHEN 'NOUN' THEN CASE
           WHEN lower(btrim(note)) = 'мн.' THEN 'Ovo su ' || btrim(lemma) || '.'
           ELSE 'Ovo je ' || btrim(lemma) || '.'
       END
       WHEN 'VERB' THEN CASE
           WHEN btrim(lemma) LIKE '% se'
               THEN 'Sutra ću se ' || left(btrim(lemma), length(btrim(lemma)) - 3) || '.'
           ELSE 'Sutra ću ' || btrim(lemma) || '.'
       END
       WHEN 'ADJ' THEN 'Ovo je ' || btrim(lemma) || ' primer.'
       WHEN 'ADV' THEN 'U ovoj rečenici koristim prilog „' || btrim(lemma) || '“.'
       WHEN 'NUM' THEN 'Na kartici piše broj ' || btrim(lemma) || '.'
       WHEN 'INTJ' THEN 'Kažem „' || btrim(lemma) || '“ u razgovoru.'
       ELSE 'U ovoj rečenici koristim reč „' || btrim(lemma) || '“.'
   END
 WHERE btrim(example) = '';

ALTER TABLE roadmap_words
    ADD CONSTRAINT roadmap_words_example_check
    CHECK (length(btrim(example)) BETWEEN 1 AND 500);

