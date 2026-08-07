// Package level определяет уровень сербского по короткому тесту.
//
// Тест нужен ровно для одного: человек, который не знает, что ответить на
// вопрос «какой у вас уровень», должен получить ответ за минуту, а не бросить
// вход на середине. Поэтому вопросов десять, а не сорок, и каждый решается
// узнаванием формы, а не рассуждением о грамматике.
//
// Точность здесь заведомо грубая, и это осознанный размен: уровень нужен, чтобы
// подобрать ленту и предупредить о тяжёлой книге, а не чтобы выдать сертификат.
// Ошибка на ступень ничего не ломает — человек в любом случае читает что хочет
// и меняет уровень в настройках.
package level

import "github.com/citavuk/server/internal/store"

// Question — один вопрос теста.
//
// Правильный ответ наружу не отдаётся (поле неэкспортируемое, в JSON его нет):
// проверка идёт на сервере. Иначе ответы лежали бы в исходниках страницы, и
// тест перестал бы что-либо измерять.
type Question struct {
	ID string `json:"id"`
	// Level — ступень, которую проверяет вопрос.
	Level string `json:"level"`
	// Prompt — предложение с пропуском. Пропуск обозначен «___».
	Prompt string `json:"prompt"`
	// Hint — перевод на русский. Без него вопрос проверял бы знание слов, а не
	// грамматики: не поняв фразы, наугад отвечают все одинаково.
	Hint    string   `json:"hint"`
	Options []string `json:"options"`
	// answer — индекс верного варианта в Options. Места верных ответов
	// намеренно разные: стоя всегда первым, верный ответ угадывался бы не
	// открывая словаря, и тест мерил бы внимательность.
	answer int
}

// questions — по два вопроса на ступень, от простого к сложному.
//
// Каждый проверяет то, что на своей ступени как раз проходят: A1 — глагол
// «biti» и род прилагательного, A2 — винительный падеж и прошедшее время,
// B1 — местный падеж и вид глагола, B2 — условное наклонение и управление,
// C1 — аорист и деепричастие.
var questions = []Question{
	{
		ID: "a1_biti", Level: "A1",
		Prompt: "Ja ___ student.", Hint: "Я студент.",
		Options: []string{"si", "sam", "je", "smo"}, answer: 1,
	},
	{
		ID: "a1_rod", Level: "A1",
		Prompt: "Ovo je ___ knjiga.", Hint: "Это хорошая книга.",
		Options: []string{"dobar", "dobro", "dobra", "dobri"}, answer: 2,
	},
	{
		ID: "a2_akuzativ", Level: "A2",
		Prompt: "Vidim ___ na ulici.", Hint: "Я вижу сестру на улице.",
		Options: []string{"sestra", "sestri", "sestrom", "sestru"}, answer: 3,
	},
	{
		ID: "a2_proslo", Level: "A2",
		Prompt: "Juče smo ___ u bioskop.", Hint: "Вчера мы ходили в кино.",
		Options: []string{"išli", "idemo", "ići", "idu"}, answer: 0,
	},
	{
		ID: "b1_lokativ", Level: "B1",
		Prompt: "Živim u ___ već pet godina.", Hint: "Я живу в Белграде уже пять лет.",
		Options: []string{"Beograd", "Beogradu", "Beograda", "Beogradom"}, answer: 1,
	},
	{
		ID: "b1_vid", Level: "B1",
		Prompt: "Svako jutro ___ kafu.", Hint: "Каждое утро я пью кофе — действие повторяется.",
		Options: []string{"popijem", "popiću", "pijem", "popio sam"}, answer: 2,
	},
	{
		ID: "b2_potencijal", Level: "B2",
		Prompt: "Da imam vremena, ___ ti pomogao.", Hint: "Если бы у меня было время, я бы тебе помог.",
		Options: []string{"ću", "sam", "budem", "bih"}, answer: 3,
	},
	{
		ID: "b2_rekcija", Level: "B2",
		Prompt: "Ne sećam se ___ imena.", Hint: "Я не помню его имени.",
		Options: []string{"njegovog", "njegovo", "njegovom", "njegovim"}, answer: 0,
	},
	{
		ID: "c1_aorist", Level: "C1",
		Prompt: "„___ i vide“, piše u staroj knjizi.", Hint: "«Пришёл и увидел» — книжное прошедшее, аорист.",
		Options: []string{"Dolazi", "Dođe", "Došao je", "Doći će"}, answer: 1,
	},
	{
		ID: "c1_prilog", Level: "C1",
		Prompt: "___ kroz park, sreo je staru prijateljicu.", Hint: "Идя через парк, он встретил старую подругу.",
		Options: []string{"Šetao", "Da šeta", "Šetajući", "Šetnja"}, answer: 2,
	},
}

// Questions отдаёт вопросы теста. Верные ответы не сериализуются.
func Questions() []Question {
	out := make([]Question, len(questions))
	copy(out, questions)
	return out
}

// Count — сколько всего вопросов.
func Count() int { return len(questions) }

// Result — итог теста.
type Result struct {
	Level string `json:"level"`
	// Correct и Total показываются человеку: «6 из 10» объясняет вывод лучше
	// любой формулировки, а без объяснения уровень выглядит приговором.
	Correct int `json:"correct"`
	Total   int `json:"total"`
	// ByLevel — сколько верных на каждой ступени, для той же прозрачности.
	ByLevel map[string]int `json:"byLevel"`
}

// Grade считает уровень по ответам.
//
// answers — выбранный вариант по идентификатору вопроса. Неотвеченный вопрос
// считается неверным: пропуск и ошибка для оценки — одно и то же.
//
// Правило подъёма: ступень засчитана, если на ней верна хотя бы половина
// вопросов, и итог — последняя засчитанная ступень ПОДРЯД, начиная с A1.
// Именно подряд: севший на A1 и угадавший вопрос C1 знает язык на A1, и одно
// попадание не должно перепрыгивать через три ступени.
//
// Не набравший даже A1 получает A1, а не пустоту: тест пройден, ответ дан, и
// спрашивать снова не за что.
func Grade(answers map[string]int) Result {
	correctByLevel := map[string]int{}
	totalByLevel := map[string]int{}
	result := Result{Total: len(questions), ByLevel: map[string]int{}}

	for _, question := range questions {
		totalByLevel[question.Level]++
		if chosen, answered := answers[question.ID]; answered && chosen == question.answer {
			correctByLevel[question.Level]++
			result.Correct++
		}
	}
	for _, name := range store.SerbianLevels {
		result.ByLevel[name] = correctByLevel[name]
	}

	result.Level = store.SerbianLevels[0]
	for _, name := range store.SerbianLevels {
		// Ступень без вопросов не засчитывается и не обрывает подъём: шкала
		// доходит до C2, а тест — до C1, и «ноль верных из нуля» иначе
		// формально проходило бы условие и выдавало C2 всякому, кто дошёл до
		// C1. Уровень выше того, что тест умеет проверить, человек может
		// поставить себе сам.
		if totalByLevel[name] == 0 {
			continue
		}
		if correctByLevel[name]*2 < totalByLevel[name] {
			break
		}
		result.Level = name
	}
	return result
}
