"""Выбор слова CLASSLA по позиции, без зависимости от самой NLP-модели."""


def select_word(doc, start, end, token_text, normalize):
    fallback = None
    expected = normalize(token_text).lower()
    for sentence in doc.sentences:
        for word in sentence.words:
            bounds = {}
            for field in (getattr(word, 'misc', None) or '').split('|'):
                key, sep, value = field.partition('=')
                if sep and key in ('start_char', 'end_char'):
                    try:
                        bounds[key] = int(value)
                    except ValueError:
                        pass
            left, right = bounds.get('start_char'), bounds.get('end_char')
            if left is not None and right is not None and left <= start < end <= right:
                return word
            if fallback is None and normalize(word.text).lower() == expected:
                fallback = word
    return fallback
