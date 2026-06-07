# Guides Data

Статические Notion JSON страницы и медиафайлы для сайта **[guides.ekaterinburg.city](https://guides.ekaterinburg.city)**.

* `/_notion-updated` — Node.js клиент для выгрузки из Notion.
* `/assets` — папка со ссылками на медиафайлы.
* `/data` — дерево структуры с блоками данных из Notion и ссылками на медиафайлы.

## Разработка

1. Установите Node.js.

2. Создайте файл `.env` и добавьте в него ваш токен: `NOTION_TOKEN=<ваш_токен>`.

3. Запустите скрипт сборки:

```sh
# Обычная сборка (инкрементальная)
npm run build:fast

# Полная сборка (с перекачкой всех активов)
npm run build

```
