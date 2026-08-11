export type ExamLevelCode = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export interface OfficialExam {
  level: ExamLevelCode;
  name: string;
  can: string;
  reading: string;
  writing: string;
  testUrl: string;
  nativeQuizId: string;
  nativeQuizKey: string;
}

const TEST_ROOT =
  'https://resources.filfak.ni.ac.rs/media/test_your_serbian';

/**
 * Открытые тесты подготовлены Центром сербского как иностранного
 * Философского факультета Университета Ниша. Мы ведём на оригинал: так
 * задания, ответы и результат всегда остаются университетскими.
 */
export const OFFICIAL_EXAMS: OfficialExam[] = [
  {
    level: 'A1',
    name: 'Начальный',
    can: 'Знакомство, семья, числа, время и самые частые бытовые ситуации.',
    reading: 'Короткие подписи, объявления, анкеты и простые сообщения.',
    writing: 'Основные слова и предложения о себе и повседневной жизни.',
    testUrl: `${TEST_ROOT}/A1_responsive_design/index.html`,
    nativeQuizId: 'e1000000-0000-4000-8000-000000000001',
    nativeQuizKey: 'exam:serbian:a1:native-v1',
  },
  {
    level: 'A2',
    name: 'Базовый',
    can: 'Покупки, дорога, жильё, работа, здоровье и рассказ о прошлом.',
    reading: 'Меню, расписания, объявления и короткие личные письма.',
    writing: 'Записка, короткое письмо и простое описание события.',
    testUrl: `${TEST_ROOT}/A2_responsive_design/index.html`,
    nativeQuizId: 'e1000000-0000-4000-8000-000000000002',
    nativeQuizKey: 'exam:serbian:a2:native-v1',
  },
  {
    level: 'B1',
    name: 'Пороговый',
    can: 'Самостоятельное общение в поездке, на работе и в обычной беседе.',
    reading: 'Связные бытовые тексты, письма и сообщения на знакомые темы.',
    writing: 'Рассказ о событиях, впечатлениях, целях и планах.',
    testUrl: `${TEST_ROOT}/B1_responsive_design/index.html`,
    nativeQuizId: 'e1000000-0000-4000-8000-000000000003',
    nativeQuizKey: 'exam:serbian:b1:native-v1',
  },
  {
    level: 'B2',
    name: 'Продвинутый',
    can: 'Свободное общение и понимание аргументов на конкретные и абстрактные темы.',
    reading: 'Статьи, интервью и тексты, в которых важна позиция автора.',
    writing: 'Развёрнутое мнение с аргументами, примерами и выводом.',
    testUrl: `${TEST_ROOT}/B2_responsive_design/index.html`,
    nativeQuizId: 'e1000000-0000-4000-8000-000000000004',
    nativeQuizKey: 'exam:serbian:b2:native-v1',
  },
  {
    level: 'C1',
    name: 'Профессиональный',
    can: 'Точное и гибкое владение языком для учёбы, работы и сложной дискуссии.',
    reading: 'Длинные тексты, скрытые смыслы и стилевые различия.',
    writing: 'Чёткий структурированный текст со сложной аргументацией.',
    testUrl: `${TEST_ROOT}/C1_responsive_design/index.html`,
    nativeQuizId: 'e1000000-0000-4000-8000-000000000005',
    nativeQuizKey: 'exam:serbian:c1:native-v1',
  },
];

export const EXAM_SOURCE = {
  name: 'Центар за српски као страни и нематерњи језик',
  institution: 'Филозофски факултет Универзитета у Нишу',
  testPage: 'https://learn-serbian.filfak.ni.ac.rs/free-online-placement-test/',
  certificationPage: 'https://learn-serbian.filfak.ni.ac.rs/testing/',
  methodologyPage: 'https://digitalna.ff.uns.ac.rs/sites/default/files/db/books/PPJ-38-2007.pdf',
} as const;

export interface ExamCenter {
  id: string;
  name: string;
  city: string;
  url: string;
}

export const EXAM_CENTERS: ExamCenter[] = [
  {
    id: 'nis',
    name: 'Центар за српски као страни и нематерњи језик',
    city: 'Ниш',
    url: EXAM_SOURCE.certificationPage,
  },
  {
    id: 'novi-sad',
    name: 'Центар за српски језик као страни',
    city: 'Нови-Сад',
    url: 'https://www.ff.uns.ac.rs/sr-lat/fakultet/o-fakultetu/centri/centar-za-srpski-jezik-kao-strani',
  },
  {
    id: 'belgrade',
    name: 'Центар за српски као страни језик',
    city: 'Белград',
    url: 'https://www.fil.bg.ac.rs/sr/pregled-fakulteta/centri-i-instituti',
  },
];

export function findOfficialExam(level?: string): OfficialExam {
  return OFFICIAL_EXAMS.find((exam) => exam.level === level) ?? OFFICIAL_EXAMS[0]!;
}
