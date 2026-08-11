-- Внутренние пробные тесты по структуре открытых уровневых тестов Центра
-- сербского как иностранного Философского факультета Университета Ниша.
-- Формулировки Читавука оригинальные: официальный тест остаётся доступен по
-- прямой ссылке, а эта версия нужна для истории попыток и разбора ошибок.

INSERT INTO quizzes (id, source_sha, material_key, title, subject, excerpt, questions)
VALUES
('e1000000-0000-4000-8000-000000000001', 'citavuk-exam-a1-native-v1', 'exam:serbian:a1:native-v1',
 'Пробный тест A1', 'Экзамен A1',
 'Адаптировано по структуре открытого теста Test Your Serbian Университета Ниша.',
 $$[
  {"question":"Dopuni: Ja ___ Milica.","options":["sam","si","je","smo"],"answer":0,"explanation":"С местоимением ja глагол biti в настоящем времени имеет форму sam.","wrongHint":"Сравните: ja sam, ti si, on/ona je."},
  {"question":"Izaberi pravilno: Marko živi ___ Beogradu.","options":["u","na","iz","od"],"answer":0,"explanation":"Для нахождения внутри города употребляется предлог u с локативом: u Beogradu.","wrongHint":"Вопрос gde? требует здесь конструкции u + локатив."},
  {"question":"Koji je pravilan odgovor na pitanje: Da li si student?","options":["Da, ja sam student.","Da, ja si student.","Da, ja je student.","Da, ja smo student."],"answer":0,"explanation":"После ja нужна форма sam.","wrongHint":"Согласуйте вспомогательный глагол с первым лицом единственного числа."},
  {"question":"Množina imenice grad je...","options":["gradovi","gradi","gradove","gradima"],"answer":0,"explanation":"Именительный множественного числа: gradovi.","wrongHint":"Нужна форма, отвечающая на вопрос šta? во множественном числе."},
  {"question":"Dopuni: Ovo su Ana i Petar. Ovo je ___ otac.","options":["njihov","njegov","njen","naš"],"answer":0,"explanation":"Для двух людей используется притяжательное местоимение njihov.","wrongHint":"Ana i Petar = oni, поэтому njihov."},
  {"question":"Izaberi pravilnu rečenicu.","options":["Svakog dana idem na fakultet.","Svakog dana idem na fakultetu.","Svakog dana idem fakultetom.","Svakog dana idem iz fakultet."],"answer":0,"explanation":"Направление к учреждению выражается конструкцией na fakultet.","wrongHint":"После глагола движения нужен аккузатив направления."},
  {"question":"Koje pitanje odgovara rečenici: Ana je u prodavnici?","options":["Gde je Ana?","Kuda je Ana?","Ko je prodavnica?","Kada je Ana?"],"answer":0,"explanation":"Gde спрашивает о местонахождении.","wrongHint":"Kuda спрашивает о направлении движения, а здесь движение не описано."},
  {"question":"Dopuni: Juče ___ kod kuće.","options":["sam bio","sam biti","je bio sam","sam bi"],"answer":0,"explanation":"Перфект первого лица образуется: sam + действительное причастие bio.","wrongHint":"Вспомогательный глагол обычно стоит на втором месте: Juče sam bio..."}
 ]$$::jsonb),
('e1000000-0000-4000-8000-000000000002', 'citavuk-exam-a2-native-v1', 'exam:serbian:a2:native-v1',
 'Пробный тест A2', 'Экзамен A2',
 'Адаптировано по структуре открытого теста Test Your Serbian Университета Ниша.',
 $$[
  {"question":"Dopuni: Sutra ___ posetiti baku.","options":["ću","sam","bih","budem"],"answer":0,"explanation":"Футур I первого лица образуется с клитику ću и инфинитивом.","wrongHint":"Речь о плане на завтра."},
  {"question":"Izaberi pravilno: Idemo ___ autobusom.","options":["na posao","na poslu","iz posao","poslom na"],"answer":0,"explanation":"Направление выражается аккузативом: na posao; средство — инструменталом: autobusom.","wrongHint":"Куда? na posao."},
  {"question":"Dopuni: Marija je starija ___ svoje sestre.","options":["od","iz","nego što","sa"],"answer":0,"explanation":"Сравнение с существительным обычно строится через od + родительный падеж.","wrongHint":"Stariji od nekoga."},
  {"question":"Koja rečenica je u perfektu?","options":["Kupili smo karte.","Kupujemo karte.","Kupićemo karte.","Kupite karte."],"answer":0,"explanation":"Kupili smo — завершённое действие в прошлом, форма перфекта.","wrongHint":"Ищите причастие на -li и вспомогательный глагол smo."},
  {"question":"Dopuni: Ne mogu da dođem ___ sam bolestan.","options":["jer","ali","ili","dok"],"answer":0,"explanation":"Jer вводит причину: не могу прийти, потому что болен.","wrongHint":"Нужен союз со значением причины."},
  {"question":"Izaberi pravilno: Dala sam poklon ___.","options":["prijateljici","prijateljicu","prijateljicom","prijateljice"],"answer":0,"explanation":"Получатель ставится в дательном падеже: prijateljici.","wrongHint":"Кому? prijateljici."},
  {"question":"Dopuni: Kada sam bio mali, često ___ fudbal.","options":["sam igrao","ću igrati","igram bih","budem igrao"],"answer":0,"explanation":"Повторяющееся действие в прошлом выражено перфектом несовершенного глагола.","wrongHint":"Контекст kada sam bio mali указывает на прошлое."},
  {"question":"Koja molba zvuči pristojno?","options":["Možete li mi pomoći?","Pomažeš mi odmah.","Moraš da mi pomogneš.","Ti pomoć meni."],"answer":0,"explanation":"Вопрос с možete li — нейтральная вежливая просьба.","wrongHint":"Для незнакомого человека выбирайте форму с Vi."}
 ]$$::jsonb),
('e1000000-0000-4000-8000-000000000003', 'citavuk-exam-b1-native-v1', 'exam:serbian:b1:native-v1',
 'Пробный тест B1', 'Экзамен B1',
 'Адаптировано по структуре открытого теста Test Your Serbian Университета Ниша.',
 $$[
  {"question":"Dopuni: Ako budem imao vremena, ___ ti.","options":["javiću se","javio sam se","javljam se juče","bih se javio juče"],"answer":0,"explanation":"В условии с футуром II главное действие выражено футуром I.","wrongHint":"Ako budem... описывает реальное условие в будущем."},
  {"question":"Izaberi glagol koji označava završenu radnju: Svakog dana sam ___ izveštaj, a juče sam ga konačno ___.","options":["pisao / napisao","napisao / pisao","pisati / napisati","pišem / napisujem"],"answer":0,"explanation":"Pisati — процесс, napisati — достижение результата.","wrongHint":"Слово konačno подсказывает совершенный вид во второй части."},
  {"question":"Pretvori u indirektni govor: Ana je rekla: „Doći ću sutra.“","options":["Ana je rekla da će doći sutra.","Ana je rekla da doći će sutra.","Ana je rekla će da dođe sutra.","Ana je rekla došla sutra."],"answer":0,"explanation":"В косвенной речи используется da, а клитику će ставят перед инфинитивной основой/конструкцией.","wrongHint":"После rekla ожидается придаточное с da."},
  {"question":"Dopuni: To je kolega ___ sam ti pričao.","options":["o kome","koji","od koji","sa koga"],"answer":0,"explanation":"Glagol pričati o nekome требует o + локатив: o kome.","wrongHint":"Сохраните управление глагола pričati o."},
  {"question":"Koja rečenica izražava savet?","options":["Trebalo bi da više odmaraš.","Morao si juče da radiš.","Sigurno ćeš doći.","Nisam se odmarao."],"answer":0,"explanation":"Trebalo bi смягчает рекомендацию и выражает совет.","wrongHint":"Ищите условную форму, а не приказ или сообщение о факте."},
  {"question":"Izaberi odgovarajući veznik: Iako je padala kiša, ___ smo u šetnju.","options":["otišli","jer otišli","nego odlazimo","dok ćemo"],"answer":0,"explanation":"Iako вводит уступку; главное предложение остаётся грамматически самостоятельным.","wrongHint":"Несмотря на дождь, действие всё равно состоялось."},
  {"question":"Dopuni: Radujem se ___ u Beogradu.","options":["susretu","susret","susretom","susreta"],"answer":0,"explanation":"Radovati se управляет дательным падежом: susretu.","wrongHint":"Чему радуюсь? susretu."},
  {"question":"Koja rečenica ima prirodan red reči?","options":["Juče sam ga video u gradu.","Juče ga sam video u gradu.","Sam juče video ga u gradu.","Video juče sam u gradu ga."],"answer":0,"explanation":"Клитики sam и ga образуют группу после первого ударного члена: Juče sam ga... ","wrongHint":"Сербские клитики стремятся ко второй позиции предложения."}
 ]$$::jsonb),
('e1000000-0000-4000-8000-000000000004', 'citavuk-exam-b2-native-v1', 'exam:serbian:b2:native-v1',
 'Пробный тест B2', 'Экзамен B2',
 'Адаптировано по структуре открытого теста Test Your Serbian Университета Ниша.',
 $$[
  {"question":"Dopuni: Uprkos tome ___ nije imao iskustva, uspešno je vodio projekat.","options":["što","da","jer","nego"],"answer":0,"explanation":"Устойчивая уступительная конструкция: uprkos tome što.","wrongHint":"После tome требуется союз što."},
  {"question":"Izaberi najprirodniju kolokaciju.","options":["doneti odluku","napraviti odluku","raditi odluku","voditi odluku"],"answer":0,"explanation":"В литературном сербском нормативная сочетаемость — doneti odluku.","wrongHint":"Решение «принимают»: doneti odluku."},
  {"question":"Koja rečenica pravilno prenosi neostvareni uslov u prošlosti?","options":["Da sam znao, došao bih ranije.","Ako sam znao, doći ću ranije.","Da znam, došao sam ranije.","Kad bih znao, dođem ranije juče."],"answer":0,"explanation":"Неосуществлённое условие в прошлом: da + perfekt, затем potencijal.","wrongHint":"Речь о том, чего фактически не произошло."},
  {"question":"Dopuni: Rezultati istraživanja biće ___ sledeće nedelje.","options":["objavljeni","objavili","objavljujući","objavljivati"],"answer":0,"explanation":"Пассив футура: biće + страдательное причастие objavljeni.","wrongHint":"Подлежащее rezultati испытывает действие."},
  {"question":"Izaberi veznik koji najbolje izražava posledicu: Saobraćaj je bio obustavljen, ___ smo zakasnili.","options":["zbog čega","premda","ukoliko","budući da"],"answer":0,"explanation":"Zbog čega отсылает к предыдущей причине и вводит следствие.","wrongHint":"Вторая часть сообщает результат первой."},
  {"question":"Koja formulacija pripada formalnom registru?","options":["Molimo vas da zahtev dostavite do petka.","Daj nam to do petka.","Ajde, pošalji papir.","Baci nam zahtev kad stigneš."],"answer":0,"explanation":"Вежливая безлично-официальная просьба подходит деловой переписке.","wrongHint":"Ищите нейтральную форму без разговорных частиц."},
  {"question":"Dopuni: To je pitanje ___ se mišljenja stručnjaka razlikuju.","options":["o kojem","kojem","od kojeg","sa kojim"],"answer":0,"explanation":"Razlikovati se o pitanju требует конструкции o + локатив.","wrongHint":"Восстановите предлог перед относительным местоимением."},
  {"question":"Izaberi pravilnu konstrukciju sa glagolskim prilogom.","options":["Čitajući izveštaj, primetila je grešku.","Čitajući izveštaj, greška je bila primećena od nje.","Čitavši izveštaj sutra, primećuje grešku juče.","Čitajući je izveštaj, grešku primetiti."],"answer":0,"explanation":"Субъект деепричастного оборота и главного действия должен совпадать.","wrongHint":"Кто читал, тот же должен заметить ошибку."}
 ]$$::jsonb),
('e1000000-0000-4000-8000-000000000005', 'citavuk-exam-c1-native-v1', 'exam:serbian:c1:native-v1',
 'Пробный тест C1', 'Экзамен C1',
 'Адаптировано по структуре открытого теста Test Your Serbian Университета Ниша.',
 $$[
  {"question":"Izaberi izraz koji najbolje dopunjuje rečenicu: Njegovo obrazloženje je uverljivo, ali ipak ostavlja prostora za ___.","options":["nedoumicu","sumnjičenje","neznanje","neodluku"],"answer":0,"explanation":"Устойчивая конструкция ostaviti prostora za nedoumicu означает оставить основания для сомнения.","wrongHint":"Нужна нормативная абстрактная лексема со значением неясности."},
  {"question":"Dopuni: Ne samo da je predlog prihvaćen, ___ je odmah počela i njegova primena.","options":["nego","već da","ali da","dok"],"answer":0,"explanation":"Парная конструкция: ne samo da... nego (je)... ","wrongHint":"Ищите вторую часть усилительной конструкции."},
  {"question":"Koja rečenica najpreciznije izražava rezervu prema tvrdnji?","options":["Ta tvrdnja jeste moguća, premda nije dovoljno potkrepljena.","Ta tvrdnja je sigurno tačna.","Ta tvrdnja nema nikakvog smisla.","Ta tvrdnja je baš super."],"answer":0,"explanation":"Jeste... premda позволяет признать возможность и одновременно обозначить ограничение.","wrongHint":"Нужен академически нейтральный, не категоричный тон."},
  {"question":"Izaberi pravilnu rekciju: Autor se u zaključku osvrće ___.","options":["na ranije iznete primedbe","ranije iznetim primedbama","od ranije iznetih primedbi","sa ranije iznete primedbe"],"answer":0,"explanation":"Osvrnuti se управляет na + аккузатив.","wrongHint":"Устойчивая модель: osvrnuti se na nešto."},
  {"question":"Dopuni najprikladnijim konektorom: Podaci nisu potpuni. ___, zaključak treba tumačiti oprezno.","options":["Shodno tome","Nasuprot","Štaviše da","Makar što"],"answer":0,"explanation":"Shodno tome связывает основание с логическим следствием в формальном стиле.","wrongHint":"Второе предложение выводится из первого."},
  {"question":"Koja varijanta čuva značenje: Iako je bio upozoren, nije promenio odluku?","options":["Uprkos upozorenju, nije promenio odluku.","Zbog upozorenja, promenio je odluku.","Pošto nije upozoren, promenio je odluku.","Da je upozoren, promeniće odluku."],"answer":0,"explanation":"Iako и uprkos выражают уступку: предупреждение не повлияло на решение.","wrongHint":"Сохраните противопоставление ожидаемой и реальной реакции."},
  {"question":"Izaberi stilski najprikladniju zamenu za „mnogo je uticalo“ u stručnom tekstu.","options":["imalo je znatan uticaj","baš je jako pogodilo","uradilo je puno uticaja","napravilo je ogromno delovanje"],"answer":0,"explanation":"Imati znatan uticaj — нормативная формальная коллокация.","wrongHint":"Избегайте разговорных усилителей и калькированных сочетаний."},
  {"question":"Dopuni: Ma koliko se ___, nije uspeo da ubedi komisiju.","options":["trudio","potrudio jednom","trudeći","bio truditi"],"answer":0,"explanation":"Уступительная конструкция ma koliko se trudio требует формы на -o в данном контексте.","wrongHint":"Значение: как бы сильно он ни старался."}
 ]$$::jsonb)
ON CONFLICT (source_sha) DO UPDATE SET
 material_key=EXCLUDED.material_key,
 title=EXCLUDED.title,
 subject=EXCLUDED.subject,
 excerpt=EXCLUDED.excerpt,
 questions=EXCLUDED.questions;
