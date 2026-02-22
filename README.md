# Платформа за графици с PostgreSQL бекенд

## Стартиране
1. Копирайте `.env.example` в `.env` и попълнете PostgreSQL настройките.
2. Създайте база данни и изпълнете `db.schema.sql`.
3. Инсталирайте зависимости: `npm install`.
4. Стартирайте: `npm start`.
5. Отворете `http://localhost:3000`.

## Какво има
- Frontend за графици, отпуски, болнични и празници.
- Express API:
  - `GET /api/state`
  - `POST /api/employees`
  - `DELETE /api/employees/:id`
  - `POST /api/schedule-entry`
- PostgreSQL съхранение за служители и дневни записи по месеци.
