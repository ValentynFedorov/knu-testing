# KNU Online Testing Platform - Setup Guide

Повний гайд по налаштуванню середовища розробки для платформи онлайн-тестування КНУ.

---

## Зміст

1. [Вимоги](#1-вимоги)
2. [Клонування репозиторію](#2-клонування-репозиторію)
3. [Налаштування бази даних (PostgreSQL)](#3-налаштування-бази-даних-postgresql)
4. [Налаштування Backend (NestJS)](#4-налаштування-backend-nestjs)
5. [Налаштування Frontend (Next.js)](#5-налаштування-frontend-nextjs)
6. [Запуск проєкту](#6-запуск-проєкту)
7. [Реєстрація першого викладача](#7-реєстрація-першого-викладача)
8. [Структура проєкту](#8-структура-проєкту)
9. [Основні фічі](#9-основні-фічі)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Вимоги

Перед початком переконайтеся, що встановлені:

| Інструмент | Мінімальна версія | Перевірка |
|------------|-------------------|-----------|
| **Node.js** | 18.x+ (рекомендовано 20+) | `node -v` |
| **npm** | 9.x+ | `npm -v` |
| **Docker Desktop** | 4.x+ | `docker --version` |
| **Git** | 2.x+ | `git --version` |

### Встановлення (якщо не встановлено)

- **Node.js**: https://nodejs.org/ (LTS версія)
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- **Git**: https://git-scm.com/downloads

> **Windows**: Переконайтеся, що Docker Desktop запущено перед початком роботи (іконка в треї).

---

## 2. Клонування репозиторію

```bash
git clone https://github.com/ValentynFedorov/knu-testing.git
cd knu-testing
```

---

## 3. Налаштування бази даних (PostgreSQL)

Проєкт використовує PostgreSQL 16 через Docker Compose.

### 3.1. Запуск PostgreSQL

Переконайтеся, що Docker Desktop запущено, потім:

```bash
docker-compose up -d
```

Це створить контейнер `knu-postgres` з такими параметрами:

| Параметр | Значення |
|----------|----------|
| Хост | `localhost` |
| Порт | `5432` |
| Користувач | `postgres` |
| Пароль | `postgres` |
| База даних | `knu_testing` |

### 3.2. Перевірка роботи

```bash
docker ps
```

Ви повинні побачити контейнер `knu-postgres` зі статусом `Up`.

### 3.3. Корисні команди Docker

```bash
# Зупинити базу даних
docker-compose down

# Переглянути логи
docker-compose logs -f db

# Повний перезапуск (з видаленням даних)
docker-compose down -v
docker-compose up -d
```

---

## 4. Налаштування Backend (NestJS)

### 4.1. Встановлення залежностей

```bash
cd backend
npm install
```

### 4.2. Створення файлу `.env`

Створіть файл `backend/.env`:

```env
# ── Database ──
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/knu_testing?schema=public"

# ── Authentication ──
# Секретний ключ для JWT-токенів. В production використовуйте надійний випадковий рядок.
NEXTAUTH_SECRET="dev-secret-key-change-in-production"

# ── Server ──
# Порт бекенду (за замовчуванням 4000)
PORT=4000

# ── CORS ──
# URL фронтенду для CORS (за замовчуванням http://localhost:3000)
FRONTEND_URL="http://localhost:3000"
```

> **Важливо**: `NEXTAUTH_SECRET` повинен бути однаковим на бекенді та фронтенді — це спільний секрет для JWT.

### 4.3. Ініціалізація бази даних

```bash
# Генерація Prisma-клієнта (типи для TypeScript)
npx prisma generate

# Створення таблиць у базі даних
npx prisma db push
```

### 4.4. Перевірка

```bash
npm run start:dev
```

Бекенд повинен запуститися на http://localhost:4000. Ви побачите в консолі:

```
[NestApplication] Nest application successfully started
```

### 4.5. Доступні npm-скрипти

| Скрипт | Опис |
|--------|------|
| `npm run start:dev` | Запуск з hot-reload (розробка) |
| `npm run build` | Компіляція TypeScript |
| `npm run start:prod` | Запуск скомпільованого коду |
| `npm run lint` | Перевірка коду ESLint |
| `npm test` | Запуск тестів |

---

## 5. Налаштування Frontend (Next.js)

### 5.1. Встановлення залежностей

```bash
cd frontend
npm install
```

### 5.2. Створення файлу `.env.local`

Створіть файл `frontend/.env.local`:

```env
# ── Backend URL ──
# URL бекенду для API-запитів
NEXT_PUBLIC_BACKEND_URL="http://localhost:4000"

# ── Authentication ──
# Повинен збігатися з NEXTAUTH_SECRET на бекенді!
NEXTAUTH_SECRET="dev-secret-key-change-in-production"

# ── NextAuth ──
NEXTAUTH_URL="http://localhost:3000"
```

### 5.3. Перевірка

```bash
npm run dev
```

Фронтенд повинен запуститися на http://localhost:3000.

### 5.4. Доступні npm-скрипти

| Скрипт | Опис |
|--------|------|
| `npm run dev` | Запуск з hot-reload (розробка) |
| `npm run build` | Збірка для production |
| `npm run start` | Запуск production-збірки |
| `npm run lint` | Перевірка коду ESLint |

---

## 6. Запуск проєкту

### Швидкий старт (три термінали)

**Термінал 1 — База даних:**
```bash
cd knu-testing
docker-compose up -d
```

**Термінал 2 — Backend:**
```bash
cd knu-testing/backend
npm run start:dev
```

**Термінал 3 — Frontend:**
```bash
cd knu-testing/frontend
npm run dev
```

### Після запуску

| Сервіс | URL |
|--------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| PostgreSQL | localhost:5432 |

---

## 7. Реєстрація першого викладача

1. Відкрийте http://localhost:3000
2. Натисніть **"Зареєструватися"** на сторінці входу
3. Введіть email у домені `@knu.ua` (наприклад, `teacher@knu.ua`)
4. Після реєстрації увійдіть із цим же email на сторінці входу
5. Ви потрапите в панель викладача

> **Студенти** не потребують реєстрації — вони просто входять з email `@knu.ua` і автоматично отримують роль `STUDENT`.

---

## 8. Структура проєкту

```
knu-testing/
├── docker-compose.yml          # PostgreSQL контейнер
│
├── backend/                    # NestJS API сервер
│   ├── prisma/
│   │   └── schema.prisma       # Схема бази даних
│   ├── src/
│   │   ├── main.ts             # Точка входу
│   │   ├── app.module.ts       # Кореневий модуль
│   │   ├── auth/               # Автентифікація (JWT, реєстрація)
│   │   ├── analytics/          # Аналітика результатів тестів
│   │   ├── attempts/           # Управління спробами тестування
│   │   ├── integrity/          # Система прокторингу
│   │   ├── students/           # Управління студентами та курсами
│   │   ├── tests/              # Управління тестами
│   │   └── prisma/             # Prisma сервіс
│   ├── uploads/                # Завантажені медіафайли
│   ├── .env                    # Змінні оточення (не в git)
│   └── package.json
│
├── frontend/                   # Next.js 16 клієнт
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Головна сторінка (роутинг по ролі)
│   │   │   ├── login/              # Сторінка входу
│   │   │   ├── register/           # Реєстрація викладача
│   │   │   ├── student/            # Інтерфейс студента
│   │   │   │   └── attempt/[attemptId]/  # Проходження тесту
│   │   │   ├── teacher/            # Панель викладача
│   │   │   │   ├── question-bank/  # Банк питань
│   │   │   │   ├── tests/          # Управління тестами
│   │   │   │   ├── results/        # Результати тестів
│   │   │   │   └── students/       # Управління студентами
│   │   │   └── api/                # API routes (проксі до бекенду)
│   │   ├── hooks/
│   │   │   ├── usePhoneDetection.ts   # Детекція телефонів (COCO-SSD)
│   │   │   └── useSpeechMonitor.ts    # Моніторинг мовлення (Web Speech API)
│   │   ├── components/
│   │   │   └── CodeEditor.tsx      # Редактор коду (CodeMirror)
│   │   └── lib/
│   │       ├── api.ts              # API клієнт
│   │       └── LatexText.tsx        # Рендеринг LaTeX формул
│   ├── .env.local              # Змінні оточення (не в git)
│   └── package.json
```

---

## 9. Основні фічі

### Для викладача
- **Банк питань** — створення питань різних типів:
  - Одна правильна відповідь (SINGLE_CHOICE)
  - Множинний вибір (MULTIPLE_CHOICE)
  - Відкрита відповідь (OPEN_TEXT) з підтримкою коду
  - Встановлення відповідності (MATCHING)
  - Заповнення пропусків (GAP_TEXT)
- **Підтримка медіа** — зображення в питаннях та варіантах відповідей, LaTeX формули
- **Управління тестами** — створення тестів з правилами вибору питань, таймерами
- **Запуск тестів** — генерація токенів доступу для студентів
- **Результати** — детальний перегляд відповідей, ручне оцінювання коду
- **Управління курсами** — створення, перейменування, видалення курсів
- **Управління студентами** — профілі, призначення до курсів, перегляд результатів
- **Прокторинг** — перегляд порушень з деталями (фото при детекції телефону, транскрипт мовлення)

### Для студента
- **Проходження тестів** — вхід по токену, режим тренування та контрольний
- **Редактор коду** — підсвічування синтаксису для Python, JavaScript, TypeScript, Java, C, C++

### Система прокторингу (контрольний режим)
- **Повноекранний режим** — фіксація виходу з повноекранного режиму
- **Фокус вкладки** — фіксація переключення на інші вкладки
- **Блокування вставки** — заборона Ctrl+V під час тесту
- **Детекція телефонів** — комп'ютерний зір (TensorFlow.js + COCO-SSD) через камеру, із захопленням кадру
- **Моніторинг мовлення** — розпізнавання української мови (Web Speech API), детекція підозрілих фраз

---

## 10. Troubleshooting

### PostgreSQL не запускається

```
Error: port 5432 already in use
```

Порт 5432 зайнятий іншим процесом PostgreSQL. Варіанти:
- Зупиніть локальний PostgreSQL: `net stop postgresql-x64-16` (Windows)
- Або змініть порт в `docker-compose.yml`: `"5433:5432"` і оновіть `DATABASE_URL`

### Prisma generate — EPERM помилка (Windows)

```
EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp...'
```

Бекенд запущено і тримає файл. Рішення:
1. Зупиніть бекенд (Ctrl+C)
2. Виконайте `npx prisma generate`
3. Перезапустіть бекенд

### Камера — NotReadableError

```
NotReadableError: Could not start video source
```

Камера зайнята іншим додатком (Zoom, Teams, браузер). Закрийте інші програми, які використовують камеру, або система автоматично пропустить крок з камерою.

### Камера відсутня

Якщо комп'ютер не має фізичної камери, крок активації камери автоматично пропускається — студент може пройти тест без камери (але детекція телефонів не буде працювати).

### Frontend — Module not found

```
Module not found: Can't resolve '@tensorflow/tfjs'
```

Залежності не встановлено. Виконайте:
```bash
cd frontend
npm install
```

### Backend — 404 на нових ендпоінтах

Бекенд працює зі старим скомпільованим кодом. Перезапустіть:
```bash
# Зупиніть бекенд (Ctrl+C) і перезапустіть
npm run start:dev
```

### NEXTAUTH_SECRET не збігається

Якщо при вході отримуєте помилку авторизації, переконайтеся, що значення `NEXTAUTH_SECRET` однакове в обох файлах:
- `backend/.env`
- `frontend/.env.local`

### Docker Desktop не запущено

```
error during connect: This error may indicate that the docker daemon is not running
```

Запустіть Docker Desktop з меню Пуск (Windows) або Applications (macOS), дочекайтеся повного запуску (іконка перестане анімуватись).
