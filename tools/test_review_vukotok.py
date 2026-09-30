import unittest
from tools.review_vukotok import Budget, to_latin, validate_text, validate_result, plain_ipa

class ReviewTest(unittest.TestCase):
    def test_cyrillic_to_latin_is_single_source(self):
        self.assertEqual(to_latin('Надживети Његош NASA'), 'Nadživeti Njegoš NASA')
        self.assertEqual(plain_ipa('књига'),'/kɲiɡa/')
        self.assertEqual(plain_ipa('ћелијске'),'/tɕelijske/')

    def test_corrupted_letters_are_rejected_but_brands_are_kept(self):
        for text in ['полулотеژа','нашегs','Тюбинген','ministەر','na갑них']:
            with self.subTest(text=text), self.assertRaises(ValueError):validate_text(text)
        validate_text('Панчићева оморика NASA European Journal β-D')

    def test_budget_accounts_for_failed_and_previous_calls(self):
        budget=Budget(2,1,10,50,[{'calls':1,'costRub':.2}])
        reserved=budget.reserve('Текст',1000)
        self.assertEqual(budget.settle(reserved,None),reserved)
        with self.assertRaises(RuntimeError):budget.reserve('Текст',1000)
        budget=Budget(10,.01,10,50,[])
        with self.assertRaises(RuntimeError):budget.reserve('Текст',1000)

    def test_exact_ids_and_vocabulary_are_required(self):
        body=' '.join(['Реч пример свет']*30)
        row={'id':'1','title_cyrillic':'Свет','text_cyrillic':body,'difficult_words':[
            {'word':w,'lemma':w,'transcription':'/x/','translationRu':'перевод'} for w in ['Реч','пример','свет']]}
        result=validate_result({'items':[row]},[{'id':'1'}])
        self.assertEqual(result[0]['title_latin'],'Svet')
        with self.assertRaises(ValueError):validate_result({'items':[row,row]},[{'id':'1'}])
        row['difficult_words'][0]['word']='кућа'
        with self.assertRaises(ValueError):validate_result({'items':[row]},[{'id':'1'}])
        row['difficult_words'][0]['word']='речи';row['difficult_words'][0]['lemma']='реч'
        matched=validate_result({'items':[row]},[{'id':'1'}],{'reč':{'reč'}})
        self.assertEqual(matched[0]['difficult_words'][0]['word'],'Реч')

if __name__=='__main__':unittest.main()
