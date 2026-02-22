# Платформа за графици с PostgreSQL бекенд

## Стартиране
1. Копирайте `.env.example` в `.env` и попълнете PostgreSQL настройките.
2. Създайте база данни и изпълнете `db.schema.sql`.
3. Инсталирайте зависимости: `npm install`.
4. Стартирайте бекенда: `npm start`.
5. Отворете приложението:
   - директно от бекенда: `http://<server>:3000` (препоръчително), или
   - от друг порт/уеб сървър и задайте `API URL` в горната част (пример: `http://<server>:3000`) и натиснете **Свържи**.

## Какво има
- Frontend за графици, отпуски, болнични и празници.
- Конфигурируем API endpoint от UI, за да работи и когато frontend и backend са на различни портове.
- Express API:
  - `GET /api/health`
  - `GET /api/state`
  - `POST /api/employees`
  - `DELETE /api/employees/:id`
  - `POST /api/schedule-entry`
- PostgreSQL съхранение за служители и дневни записи по месеци.
