# Внешние ассеты учебной колоды

Скачаны 9 сентября 2026. Pinterest использовался для референсов; файлы взяты
с первоисточников с разрешением на повторное использование.

## Гравированная рамка

- Автор загрузки: johnny_automatic.
- Название: ornate frame; источник рисунка — Powers Theater Program, 1900–1901.
- Страница: https://openclipart.org/detail/201536/ornate-frame
- Оригинальный SVG: https://openclipart.org/download/201536
- Лицензия: CC0 1.0 / public domain; правила https://openclipart.org/share
- Изменения: выделение печатной графики через SVG-маску, золотой градиент,
  растеризация 512×768. Это театральная гравюра, не сербский этнографический узор.

## Медальон

- Spomenik Kulture.svg: средневековый мотив со стены монастыря Раваница.
- Авторы версии по странице файла: Tadija, Antonu.
- Страница: https://commons.wikimedia.org/wiki/File:Spomenik_Kulture.svg
- Оригинал: https://upload.wikimedia.org/wikipedia/commons/9/95/Spomenik_Kulture.svg
- Статус на странице: Public Domain Mark 1.0.
- Изменения: удалён серый фон SVG, белый заменён золотистым, контур — коричневым;
  растеризация 384×384. Используется как культурный мотив, не знак официального
  одобрения музея или государственных органов.

## Частицы

- Kenney Vleugels, Particle Pack 1.1.
- Страница: https://kenney.nl/assets/particle-pack
- Лицензия: CC0 1.0, полный текст авторского уведомления в particles/LICENSE.txt.
- Использованы PNG (Transparent)/star_04.png, light_01.png, flare_01.png.
- Изменения: только уменьшение до 128×128; оттенок/прозрачность задаёт интерфейс.

Подготовка: `cd web; node scripts/prepare-card-assets.mjs`.
Результаты одинаковы в `web/public/personal/decor/` и `frontend/assets/imgs/card_*`.
Тяжёлые исходные SVG не загружаются интерфейсом; полный архив Kenney не входит
в APK/Windows/web. Новые пакеты для отображения не добавлены.
