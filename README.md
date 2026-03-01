# Платформа за графици с PostgreSQL бекенд

## Стартиране
1. Копирайте `.env.example` в `.env` и попълнете PostgreSQL настройките.
2. Създайте база данни и изпълнете `db.schema.sql`.
3. Инсталирайте зависимости: `npm install`.
4. Стартирайте бекенда: `npm start`.
5. Отворете приложението:
   - директно от бекенда: `http://<server>:4000` (препоръчително), или
   - от друг порт/уеб сървър и задайте `API URL` в горната част (пример: `http://<server>:4000`) и натиснете **Свържи**.

## Какво има
- Ляво меню с табове: **График**, **Служители**, **Отдели**, **Отпуски**, **Настройки**, **Регистрация**. (Супер админ е отделна страница: `super-admin.html`)
- Автоматично маркиране на официални/национални празници + уикенди в календара.
- Управление на служители и годишен отпуск.
- Въвеждане на отпуск по период за избрания месец.
- Създаване на смени с различен начален/краен час (напр. дневна, вечерна, нощна).
- Изчисляване на сумирано работно време:
  - норма по месец (работни дни × 8 ч),
  - отклонение от нормата,
  - отчетен труд в официални празници,
  - отчетен труд в почивни дни,
  - платими часове според коефициенти,
  - приравняване на нощния труд (22:00–06:00) с коефициент 1.14286,
  - СИРВ отчет за период 1–6 месеца с автоматично изчисляване на извънреден труд.
- Заключване/отключване на график по месец.
- Модул „Регистрация“:
  - създаване на регистрация на организация (owner/admin по подразбиране),
  - добавяне на потребители с роли `manager` и `user` към организация.
- Супер администраторски панел:
  - самостоятелна страница `super-admin.html` (не е таб в основното приложение),
  - преглед на всички организации (tenants),
  - одобрение/промяна на статус,
  - преглед на натоварване/използване,
  - преглед на audit логове,
  - read-only инспекция на ключови таблици.
- Експорт на готов график към Excel (`.xls`) и PDF (чрез print dialog).
- Express API:
  - `GET /api/health`
  - `GET /api/state`
  - `POST /api/employees`
  - `DELETE /api/employees/:id`
  - `POST /api/schedules`
  - `GET /api/schedules?month=YYYY-MM`
  - `GET /api/schedules/:id`
  - `POST /api/schedules/:id/entry`
  - `POST /api/shift-template`
  - `DELETE /api/shift-template/:code`
  - `POST /api/platform/register`
  - `POST /api/platform/users`
  - `GET /api/platform/super-admin/overview`
  - `PATCH /api/platform/super-admin/registrations/:id/status`
  - `GET /api/platform/super-admin/tables/:tableName`
- PostgreSQL съхранение за служители, смени и графици като документи по отдели (данните остават след рестарт/обновяване на приложението).


## SaaS модел
- Базата за платформен слой използва `tenants`, `users`, `tenant_users`, `audit_log`, `request_log`.

## Следвана структура
1️⃣ автоматично генериране на графици
2️⃣ СИРВ изчисления
3️⃣ извънреден труд
4️⃣ нощен труд
5️⃣ празници
6️⃣ мобилно приложение
7️⃣ смяна на смени между служители
8️⃣ интеграция със заплати
9️⃣ известия
10. AI генериране на графици

## Department-scoped shifts (tenant-safe)

### cURL examples

```bash
curl -X POST "http://localhost:4000/api/departments/<department_id>/shifts" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Дневна смяна",
    "code": "D1",
    "start_time": "08:00",
    "end_time": "17:00",
    "break_minutes": 60,
    "break_included": false
  }'
```

```bash
curl -X GET "http://localhost:4000/api/departments/<department_id>/shifts" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

```bash
curl -X PATCH "http://localhost:4000/api/shifts/<shift_id>" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Дневна смяна (редакция)",
    "start_time": "09:00",
    "end_time": "18:00",
    "break_minutes": 60,
    "break_included": false
  }'
```

### UI тест (5 стъпки)

1. Отвори **Настройки → Смени** и избери отдел от полето за отдел.
2. Добави смяна с начало/край и почивка; потвърди, че се появява в списъка за този отдел.
3. Смени филтъра „Покажи смени за отдел“ и провери, че виждаш само смени за избрания отдел (или global).
4. Отвори **График**, кликни клетка за служител от този отдел и провери, че dropdown-ът показва department + global смени.
5. Избери смяна в клетката и провери, че записът се пази и при refresh остава същият.
