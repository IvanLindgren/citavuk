package grammar

import "testing"

// Проверка догадки о начальной форме прилагательного: парадигма от леммы
// обязана давать ровно ту форму, которую разбирают. Это то же обратное
// доказательство, что и у существительных, и нужно оно затем, чтобы принимать
// подсказку со стороны только когда она сходится с языком.
func TestMatchAdjective(t *testing.T) {
	cases := []struct {
		lemma, form             string
		gender, number, caseKey string
		definite, degree        string
	}{
		{"lep", "lepog", "Masc", "Sing", "Gen", "Def", ""},
		{"dobar", "dobar", "Masc", "Sing", "Nom", "Ind", ""},
		// У женского рода и множественного числа вид не различается, и
		// приписывать его нельзя: формы просто совпадают.
		{"lep", "lepa", "Fem", "Sing", "Nom", "", ""},
		{"vruć", "vruće", "Neut", "Sing", "Nom", "", ""},
		// Степени сравнения склоняются от своей основы.
		{"lep", "lepšeg", "Masc", "Sing", "Gen", "Def", "Cmp"},
		{"lep", "najlepšima", "Masc", "Plur", "Dat", "", "Sup"},
		{"dobar", "najboljim", "Masc", "Plur", "Dat", "", "Sup"},
	}
	for _, tc := range cases {
		feats, ok := MatchAdjective(tc.lemma, tc.form)
		if !ok {
			t.Errorf("%q от %q не опознано", tc.form, tc.lemma)
			continue
		}
		if feats["Gender"] != tc.gender || feats["Number"] != tc.number ||
			feats["Case"] != tc.caseKey {
			t.Errorf("%q: разобрано как %v", tc.form, feats)
		}
		if feats["Definite"] != tc.definite {
			t.Errorf("%q: вид %q, ожидался %q", tc.form, feats["Definite"], tc.definite)
		}
		if feats["Degree"] != tc.degree {
			t.Errorf("%q: степень %q, ожидалась %q", tc.form, feats["Degree"], tc.degree)
		}
	}
}

// Главное свойство: чужая форма не должна опознаваться. Иначе проверка
// подсказки перестаёт быть проверкой, и разбор «kućama» от «lep» уехал бы
// читателю как достоверный.
func TestMatchAdjectiveRejectsForeignForm(t *testing.T) {
	for _, tc := range []struct{ lemma, form string }{
		{"lep", "kućama"},
		{"lep", "lepota"},
		{"dobar", "dobrota"},
		{"veliki", "veličina"},
		{"lep", "najgori"},
	} {
		if feats, ok := MatchAdjective(tc.lemma, tc.form); ok {
			t.Errorf("%q ошибочно принято формой от %q: %v", tc.form, tc.lemma, feats)
		}
	}
}
