-- Initial editor-reviewed cards for the public experiment. This is separate
-- from the schema migration because production had already applied 0014.
-- Automated imports and model output still remain drafts until an admin publishes them.

INSERT INTO micro_feed_content_items (
    id, status, kind, category, title_cyrillic, title_latin,
    text_cyrillic, text_latin, original_language, original_script,
    cefr, tags, difficult_words, source_slug, source_title, source_url,
    license_code, attribution_text, published_at
) VALUES
    (
        '20000000-0000-4000-8000-000000000101', 'published', 'culture', 'culture',
        'Књига која је преживела осам векова',
        'Knjiga koja je preživela osam vekova',
        'Мирослављево јеванђеље није само стара књига, већ сведок начина на који су људи читали и украшавали текст пре више од осам векова. Настало је крајем 12. века за хумског кнеза Мирослава, брата Стефана Немање. Писари су на танком пергаменту исписали 181 лист у два ступца, а странице су украсили стотинама иницијала и минијатура у боји и злату. Књига је вековима чувана у Хиландару, а данас се највећи део рукописа налази у Народном музеју у Београду. Један лист, одвојен у 19. веку, чува се у Санкт Петербургу. Унеско је 2005. године уврстио рукопис у програм Памћење света, чиме је његово очување постало обавеза ширег од једног народа.',
        'Miroslavljevo jevanđelje nije samo stara knjiga, već svedok načina na koji su ljudi čitali i ukrašavali tekst pre više od osam vekova. Nastalo je krajem 12. veka za humskog kneza Miroslava, brata Stefana Nemanje. Pisari su na tankom pergamentu ispisali 181 list u dva stupca, a stranice su ukrasili stotinama inicijala i minijatura u boji i zlatu. Knjiga je vekovima čuvana u Hilandaru, a danas se najveći deo rukopisa nalazi u Narodnom muzeju u Beogradu. Jedan list, odvojen u 19. veku, čuva se u Sankt Peterburgu. Unesko je 2005. godine uvrstio rukopis u program Pamćenje sveta, čime je njegovo očuvanje postalo obaveza šireg od jednog naroda.',
        'sr', 'cyrillic', 'B1', ARRAY['култура', 'књиге', 'историја', 'ћирилица'],
        '[{"word":"пергамент","lemma":"пергамент","transcription":"/perɡament/","translation_ru":"пергамент"},{"word":"рукопис","lemma":"рукопис","transcription":"/rukopis/","translation_ru":"рукопись"},{"word":"очување","lemma":"очување","transcription":"/otʃuvaɲe/","translation_ru":"сохранение"}]'::jsonb,
        'sr-wikipedia', 'Мирослављево јеванђеље',
        'https://sr.wikipedia.org/wiki/%D0%9C%D0%B8%D1%80%D0%BE%D1%81%D0%BB%D0%B0%D0%B2%D1%99%D0%B5%D0%B2%D0%BE_%D1%98%D0%B5%D0%B2%D0%B0%D0%BD%D1%92%D0%B5%D1%99%D0%B5',
        'CC-BY-SA-4.0', 'Википедија на српском, CC BY-SA 4.0', now() - interval '2 minutes'
    ),
    (
        '20000000-0000-4000-8000-000000000102', 'published', 'science', 'science',
        'Колико је снажан један тесла?',
        'Koliko je snažan jedan tesla?',
        'Када физичари кажу да магнетно поље има јачину од једног тесле, они користе јединицу названу по Николи Тесли. Тесла је изведена јединица Међународног система и описује густину магнетног флукса: један тесла једнак је једном веберу по квадратном метру. Назив је усвојен 1960. године на Генералној конференцији за тегове и мере, на предлог словеначког инжењера Франца Авчина. За поређење, снажни стални магнети могу достићи неколико тесла, док су лабораторијска пулсна поља много јача, али трају веома кратко. Магнетна резонанца, на пример, често ради у пољу од 1,5 или 3 тесле. Тако једно презиме повезује проналазача, свакодневне магнете, медицинске уређаје и експерименте у којима научници испитују материју у екстремним условима.',
        'Kada fizičari kažu da magnetno polje ima jačinu od jednog tesle, oni koriste jedinicu nazvanu po Nikoli Tesli. Tesla je izvedena jedinica Međunarodnog sistema i opisuje gustinu magnetnog fluksa: jedan tesla jednak je jednom veberu po kvadratnom metru. Naziv je usvojen 1960. godine na Generalnoj konferenciji za tegove i mere, na predlog slovenačkog inženjera Franca Avčina. Za poređenje, snažni stalni magneti mogu dostići nekoliko tesla, dok su laboratorijska pulsna polja mnogo jača, ali traju veoma kratko. Magnetna rezonanca, na primer, često radi u polju od 1,5 ili 3 tesle. Tako jedno prezime povezuje pronalazača, svakodnevne magnete, medicinske uređaje i eksperimente u kojima naučnici ispituju materiju u ekstremnim uslovima.',
        'sr', 'cyrillic', 'B1', ARRAY['наука', 'физика', 'тесла', 'магнети'],
        '[{"word":"флукс","lemma":"флукс","transcription":"/fluks/","translation_ru":"поток"},{"word":"изведена","lemma":"изведен","transcription":"/izvedena/","translation_ru":"производная"},{"word":"пулсна","lemma":"пулсан","transcription":"/pulsna/","translation_ru":"импульсная"}]'::jsonb,
        'sr-wikipedia', 'Тесла (јединица)',
        'https://sr.wikipedia.org/wiki/%D0%A2%D0%B5%D1%81%D0%BB%D0%B0_(%D1%98%D0%B5%D0%B4%D0%B8%D0%BD%D0%B8%D1%86%D0%B0)',
        'CC-BY-SA-4.0', 'Википедија на српском, CC BY-SA 4.0', now() - interval '1 minute'
    ),
    (
        '20000000-0000-4000-8000-000000000103', 'published', 'fact', 'culture',
        'Како је острво постало београдско море',
        'Kako je ostrvo postalo beogradsko more',
        'Ада Циганлија данас делује као природни предах од Београда, али њен облик није сасвим природан. Некадашње речно острво на Сави вештачки је претворено у полуострво, а преграђивањем речног рукавца настало је Савско језеро. На простору од око осам квадратних километара налазе се плаже, стазе, спортски терени и мање природно језеро Ада Сафари. Иза популарног надимка београдско море стоји и богата природа: забележене су стотине врста биљака, гљива, инсеката и птица. Данашњи облик Ада је добила 25. маја 1959. године. Од 2023. године подручје има статус предела изузетних одлика Србије, па рекреација и заштита станишта морају да деле исти простор. Зато је Ада истовремено градска плажа, спортски центар и заштићени зелени предео.',
        'Ada Ciganlija danas deluje kao prirodni predah od Beograda, ali njen oblik nije sasvim prirodan. Nekadašnje rečno ostrvo na Savi veštački je pretvoreno u poluostrvo, a pregrađivanjem rečnog rukavca nastalo je Savsko jezero. Na prostoru od oko osam kvadratnih kilometara nalaze se plaže, staze, sportski tereni i manje prirodno jezero Ada Safari. Iza popularnog nadimka beogradsko more stoji i bogata priroda: zabeležene su stotine vrsta biljaka, gljiva, insekata i ptica. Današnji oblik Ada je dobila 25. maja 1959. godine. Od 2023. godine područje ima status predela izuzetnih odlika Srbije, pa rekreacija i zaštita staništa moraju da dele isti prostor. Zato je Ada istovremeno gradska plaža, sportski centar i zaštićeni zeleni predeo.',
        'sr', 'cyrillic', 'A2', ARRAY['београд', 'природа', 'култура', 'сава'],
        '[{"word":"полуострво","lemma":"полуострво","transcription":"/poluostrvo/","translation_ru":"полуостров"},{"word":"рукавац","lemma":"рукавац","transcription":"/rukavats/","translation_ru":"рукав реки"},{"word":"станиште","lemma":"станиште","transcription":"/staniʃte/","translation_ru":"место обитания"}]'::jsonb,
        'sr-wikipedia', 'Ада Циганлија',
        'https://sr.wikipedia.org/wiki/%D0%90%D0%B4%D0%B0_%D0%A6%D0%B8%D0%B3%D0%B0%D0%BD%D0%BB%D0%B8%D1%98%D0%B0',
        'CC-BY-SA-4.0', 'Википедија на српском, CC BY-SA 4.0', now()
    )
ON CONFLICT (id) DO NOTHING;
