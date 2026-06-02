import sqlite3
import os

def init_db():
    db_path = "lexicon.db"
    if os.path.exists(db_path):
        os.remove(db_path)

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS lexicon (
        form TEXT NOT NULL,
        lemma TEXT NOT NULL,
        msd TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS dictionary (
        word TEXT NOT NULL UNIQUE,
        translation TEXT NOT NULL
    )
    """)

    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lexicon_form ON lexicon(form)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_lexicon_lemma ON lexicon(lemma)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dict_word ON dictionary(word)")

    # Dictionary seeding (sr -> ru)
    dictionary_data = [
        # Verbs
        ("biti", "быть"),
        ("imati", "иметь"),
        ("hteti", "хотеть"),
        ("raditi", "работать / делать"),
        ("govoriti", "говорить"),
        ("videti", "видеть"),
        ("znati", "знать"),
        ("moći", "мочь"),
        ("čitati", "читать"),
        ("pisati", "писать"),
        ("učiti", "учить / учиться"),
        ("razumeti", "понимать"),
        # Nouns
        ("knjiga", "книга"),
        ("dan", "день"),
        ("reč", "слово"),
        ("čovek", "человек"),
        ("jezik", "язык"),
        ("prijatelj", "друг"),
        ("grad", "город"),
        ("kuća", "дом"),
        ("škola", "школа"),
        ("život", "жизнь"),
        ("vreme", "время / погода"),
        ("dete", "ребенок"),
        # Adjectives
        ("nov", "новый"),
        ("star", "старый"),
        ("lep", "красивый"),
        ("dobar", "хороший"),
        ("loš", "плохой"),
        ("velik", "большой"),
        ("mali", "маленький"),
        ("brz", "быстрый"),
        ("spor", "медленный"),
        ("srpski", "сербский"),
        ("ruski", "русский"),
        # Pronouns
        ("ja", "я"),
        ("ti", "ты"),
        ("on", "он"),
        ("ona", "она"),
        ("ono", "оно"),
        ("mi", "мы"),
        ("vi", "вы"),
        ("oni", "они"),
        ("se", "себя / -ся"),
        # Prepositions / Conjunctions
        ("i", "и"),
        ("a", "а / но"),
        ("u", "в"),
        ("na", "на"),
        ("sa", "с / со"),
        ("za", "для / за"),
        ("iz", "из"),
        ("o", "о / об"),
        ("da", "что / чтобы / да"),
        ("ali", "но / однако")
    ]

    cursor.executemany("INSERT OR IGNORE INTO dictionary (word, translation) VALUES (?, ?)", dictionary_data)

    # Lexicon seeding (inflected form, lemma, MSD)
    lexicon_entries = []

    # Helper to register regular noun paradigms
    # MSD format: Ncmsn (Noun, common, masculine, singular, nominative)
    # Noun structure: Nc + [m/f/n] (gender) + [s/p] (number) + [n/g/d/a/v/i/l] (case)
    def add_noun(lemma, gender, cases_sg, cases_pl=None):
        case_keys = ['n', 'g', 'd', 'a', 'v', 'i', 'l']
        if cases_sg:
            for key, val in zip(case_keys, cases_sg):
                if val:
                    lexicon_entries.append((val, lemma, f"Nc{gender}s{key}"))
        if cases_pl:
            for key, val in zip(case_keys, cases_pl):
                if val:
                    lexicon_entries.append((val, lemma, f"Nc{gender}p{key}"))

    # Add Nouns
    add_noun("knjiga", "f", 
             ["knjiga", "knjige", "knjizi", "knjigu", "knjigo", "knjigom", "knjizi"],
             ["knjige", "knjiga", "knjigama", "knjige", "knjige", "knjigama", "knjigama"])

    add_noun("dan", "m", 
             ["dan", "dana", "danu", "dan", "dane", "danom", "danu"],
             ["dani", "dana", "danima", "dane", "dani", "danima", "danima"])

    add_noun("reč", "f", 
             ["reč", "reči", "reči", "reč", "reči", "rečju", "reči"],
             ["reči", "reči", "rečima", "reči", "reči", "rečima", "rečima"])

    # čovek has irregular plural (ljudi)
    add_noun("čovek", "m", 
             ["čovek", "čoveka", "čoveku", "čoveka", "čoveče", "čovekom", "čoveku"])
    # ljude is Ncmp...
    add_noun("ljudi", "m",
             None,
             ["ljudi", "ljudi", "ljudima", "ljude", "ljudi", "ljudima", "ljudima"])
    # Also map plural forms of ljudi to čovek lemma as well
    for key, val in zip(['n', 'g', 'd', 'a', 'v', 'i', 'l'], 
                        ["ljudi", "ljudi", "ljudima", "ljude", "ljudi", "ljudima", "ljudima"]):
        lexicon_entries.append((val, "čovek", f"Ncmps{key}"))

    add_noun("jezik", "m",
             ["jezik", "jezika", "jeziku", "jezik", "jeziku", "jezikom", "jeziku"],
             ["jezici", "jezika", "jezicima", "jezike", "jezici", "jezicima", "jezicima"])

    add_noun("prijatelj", "m",
             ["prijatelj", "prijatelja", "prijatelju", "prijatelja", "prijatelju", "prijateljem", "prijatelju"],
             ["prijatelji", "prijatelja", "prijateljima", "prijatelje", "prijatelji", "prijateljima", "prijateljima"])

    add_noun("grad", "m",
             ["grad", "grada", "gradu", "grad", "grade", "gradom", "gradu"],
             ["gradovi", "gradova", "gradovima", "gradove", "gradovi", "gradovima", "gradovima"])

    add_noun("kuća", "f",
             ["kuća", "kuće", "kući", "kuću", "kućo", "kućom", "kući"],
             ["kuće", "kuća", "kućama", "kuće", "kuće", "kućama", "kućama"])

    add_noun("škola", "f",
             ["škola", "škole", "školi", "školu", "školo", "školom", "školi"],
             ["škole", "škola", "školama", "škole", "škole", "školama", "školama"])

    add_noun("život", "m",
             ["život", "života", "životu", "život", "živote", "životom", "životu"],
             ["životi", "života", "životima", "živote", "životi", "životima", "životima"])

    add_noun("vreme", "n",
             ["vreme", "vremena", "vremenu", "vreme", "vreme", "vremenom", "vremenu"],
             ["vremena", "vremena", "vremenima", "vremena", "vremena", "vremenima", "vremenima"])

    add_noun("dete", "n",
             ["dete", "deteta", "detetu", "dete", "dete", "detetom", "detetu"],
             ["deca", "dece", "deci", "decu", "deca", "decom", "deci"]) # deca maps to singular deteta sometimes
    # map deca forms to dete lemma
    for key, val in zip(['n', 'g', 'd', 'a', 'v', 'i', 'l'], 
                        ["deca", "dece", "deci", "decu", "deca", "decom", "deci"]):
        lexicon_entries.append((val, "dete", f"Ncnps{key}"))


    # Helper to register verb present tense and infinitive
    # MSD format: Vmsp1s (Verb, main, indicative, present, 1st person, singular)
    # Verb structure: Vm + [a/s] (aux/main) + [p/n/i/f] (pres/past/inf/fut) + [1/2/3] (person) + [s/p] (number)
    def add_verb(lemma, present_sg, present_pl):
        # Add infinitive
        lexicon_entries.append((lemma, lemma, "Vmn"))
        
        # Add present forms
        persons = ['1', '2', '3']
        for i, val in enumerate(present_sg):
            lexicon_entries.append((val, lemma, f"Vmp{persons[i]}s"))
        for i, val in enumerate(present_pl):
            lexicon_entries.append((val, lemma, f"Vmp{persons[i]}p"))

    # Add Verbs
    # biti (auxiliary verb, has clitic, stressed, and exact-future/perfective forms)
    # we represent them all
    lexicon_entries.append(("biti", "biti", "Vaa")) # aux infinitive
    # clitics
    for val, pers, num in [("sam", "1", "s"), ("si", "2", "s"), ("je", "3", "s"),
                           ("smo", "1", "p"), ("ste", "2", "p"), ("su", "3", "p")]:
        lexicon_entries.append((val, "biti", f"Vap{pers}{num}"))
    # stressed
    for val, pers, num in [("jesam", "1", "s"), ("jesi", "2", "s"), ("jeste", "3", "s"),
                           ("jesmo", "1", "p"), ("jeste", "2", "p"), ("jesu", "3", "p")]:
        lexicon_entries.append((val, "biti", f"Vap{pers}{num}s"))
    # perfective
    for val, pers, num in [("budem", "1", "s"), ("budeš", "2", "s"), ("bude", "3", "s"),
                           ("budemo", "1", "p"), ("budete", "2", "p"), ("budu", "3", "p")]:
        lexicon_entries.append((val, "biti", f"Vap{pers}{num}f"))

    # hteti (auxiliary)
    # clitics
    for val, pers, num in [("ću", "1", "s"), ("ćeš", "2", "s"), ("će", "3", "s"),
                           ("ćemo", "1", "p"), ("ćete", "2", "p"), ("će", "3", "p")]:
        lexicon_entries.append((val, "hteti", f"Vap{pers}{num}"))
    # stressed
    for val, pers, num in [("hoću", "1", "s"), ("hoćeš", "2", "s"), ("hoće", "3", "s"),
                           ("hoćemo", "1", "p"), ("hoćete", "2", "p"), ("hoće", "3", "p")]:
        lexicon_entries.append((val, "hteti", f"Vap{pers}{num}s"))
    lexicon_entries.append(("hteti", "hteti", "Vaa"))

    # main verbs
    add_verb("imati", ["imam", "imaš", "ima"], ["imamo", "imate", "imaju"])
    add_verb("raditi", ["radim", "radiš", "radi"], ["radimo", "radite", "rade"])
    add_verb("govoriti", ["govorim", "govoriš", "govori"], ["govorimo", "govorite", "govore"])
    add_verb("videti", ["vidim", "vidiš", "vidi"], ["vidimo", "vidite", "vide"])
    add_verb("znati", ["znam", "znaš", "zna"], ["znamo", "znate", "znaju"])
    add_verb("moći", ["mogu", "možeš", "može"], ["možemo", "možete", "mogu"])
    add_verb("čitati", ["čitam", "čitaš", "čita"], ["čitamo", "čitate", "čitaju"])
    add_verb("pisati", ["pišem", "pišeš", "piše"], ["pišemo", "pišete", "pišu"])
    add_verb("učiti", ["učim", "učiš", "uči"], ["učimo", "učite", "uče"])
    add_verb("razumeti", ["razumem", "razumeš", "razume"], ["razumemo", "razumete", "razumeju"])


    # Helper to register adjective forms
    # MSD format: Agpmsny (Adjective, general, positive, masculine, singular, nominative, definite)
    # Adjective structure: Ag + [p/c/s] (pos/comp/super) + [m/f/n] (gender) + [s/p] (number) + [n/g/d/a/v/i/l] (case)
    def add_adj(lemma, ms, fs, ns, mp, fp, np):
        lexicon_entries.append((ms, lemma, "Agpmsn"))
        lexicon_entries.append((fs, lemma, "Agpfsn"))
        lexicon_entries.append((ns, lemma, "Agpnsn"))
        lexicon_entries.append((mp, lemma, "Agpmpn"))
        lexicon_entries.append((fp, lemma, "Agpfpn"))
        lexicon_entries.append((np, lemma, "Agpnpn"))

    add_adj("nov", "nov", "nova", "novo", "novi", "nove", "nova")
    add_adj("star", "star", "stara", "staro", "stari", "stare", "stara")
    add_adj("lep", "lep", "lepa", "lepo", "lepi", "lepe", "lepa")
    add_adj("dobar", "dobar", "dobra", "dobro", "dobri", "dobre", "dobra")
    add_adj("loš", "loš", "loša", "loše", "loši", "loše", "loša")
    add_adj("velik", "velik", "velika", "veliko", "veliki", "velike", "velika")
    add_adj("mali", "mali", "mala", "malo", "mali", "male", "mala")
    add_adj("brz", "brz", "brza", "brzo", "brzi", "brze", "brza")
    add_adj("spor", "spor", "spora", "sporo", "spori", "spore", "spora")
    add_adj("srpski", "srpski", "srpska", "srpsko", "srpski", "srpske", "srpska")
    add_adj("ruski", "ruski", "ruska", "rusko", "ruski", "ruske", "ruska")

    # Pronouns
    pronoun_data = [
        ("ja", "ja", "Pp1-sn"),
        ("mene", "ja", "Pp1-sg"),
        ("meni", "ja", "Pp1-sd"),
        ("me", "ja", "Pp1-sa"),
        ("mnom", "ja", "Pp1-si"),
        ("ti", "ti", "Pp2-sn"),
        ("tebe", "ti", "Pp2-sg"),
        ("tebi", "ti", "Pp2-sd"),
        ("te", "ti", "Pp2-sa"),
        ("tobom", "ti", "Pp2-si"),
        ("on", "on", "Pp3msn"),
        ("ga", "on", "Pp3msa"),
        ("mu", "on", "Pp3msd"),
        ("njega", "on", "Pp3msg"),
        ("ona", "ona", "Pp3fsn"),
        ("je", "ona", "Pp3fsa"),
        ("joj", "ona", "Pp3fsd"),
        ("nju", "ona", "Pp3fsg"),
        ("ono", "ono", "Pp3nsn"),
        ("mi", "mi", "Pp1-pn"),
        ("nas", "mi", "Pp1-pg"),
        ("nam", "mi", "Pp1-pd"),
        ("vi", "vi", "Pp2-pn"),
        ("vas", "vi", "Pp2-pg"),
        ("vam", "vi", "Pp2-pd"),
        ("oni", "oni", "Pp3mpn"),
        ("ih", "oni", "Pp3mpa"),
        ("im", "oni", "Pp3mpd"),
        ("se", "se", "Px---a"),
        ("sebe", "se", "Px---g"),
        ("sebi", "se", "Px---d")
    ]
    for form, lem, msd in pronoun_data:
        lexicon_entries.append((form, lem, msd))

    # Prepositions / Conjunctions (map to themselves with SP / CS MSD)
    particles = [
        ("i", "Cc"), ("a", "Cc"), ("u", "Sp"), ("na", "Sp"), ("sa", "Sp"),
        ("za", "Sp"), ("iz", "Sp"), ("o", "Sp"), ("da", "Cs"), ("ali", "Cc")
    ]
    for form, msd in particles:
        lexicon_entries.append((form, form, msd))

    # Insert into lexicon
    cursor.executemany("INSERT INTO lexicon (form, lemma, msd) VALUES (?, ?, ?)", lexicon_entries)

    conn.commit()
    conn.close()
    print("lexicon.db successfully created and seeded.")

if __name__ == "__main__":
    init_db()
