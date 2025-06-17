# 🚀 Деплой на Vercel

## Быстрый деплой

### Вариант 1: Через GitHub (Рекомендуется)

1. **Загрузите код на GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: URL shortener with analytics"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/shorurl.git
   git push -u origin main
   ```

2. **Подключите к Vercel:**
   - Перейдите на [vercel.com](https://vercel.com)
   - Нажмите "New Project"
   - Импортируйте ваш GitHub репозиторий
   - Vercel автоматически определит настройки

3. **Готово!** Ваш сайт будет доступен по ссылке типа `your-project.vercel.app`

### Вариант 2: Через Vercel CLI

1. **Установите Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Войдите в аккаунт:**
   ```bash
   vercel login
   ```

3. **Деплой:**
   ```bash
   vercel
   ```

## ⚠️ Важные особенности Vercel

### База данных
- На Vercel используется **in-memory** SQLite (данные не сохраняются между запросами)
- Для продакшена рекомендуется:
  - **Vercel KV** (Redis)
  - **PlanetScale** (MySQL)
  - **Supabase** (PostgreSQL)

### Ограничения
- ⏱️ **Время выполнения**: 10 секунд на запрос
- 💾 **Память**: 1024 MB
- 📦 **Размер**: 50 MB

## 🔧 Альтернатива с Vercel KV

Для постоянного хранения данных можно использовать Vercel KV:

1. **Включите Vercel KV** в настройках проекта
2. **Добавьте переменные окружения:**
   ```
   KV_REST_API_URL=your_kv_url
   KV_REST_API_TOKEN=your_kv_token
   ```

## 🌐 Тестирование

После деплоя ваш сайт будет доступен по адресу:
- `https://your-project-name.vercel.app`

### Функционал:
- ✅ Сокращение ссылок
- ✅ Аналитика кликов (сессионная)
- ✅ Определение стран и устройств
- ✅ Система тегов
- ✅ Responsive дизайн

## 🔄 Обновления

Для обновления кода:
```bash
git add .
git commit -m "Update: description"
git push
```

Vercel автоматически пересоберёт и задеплоит новую версию.

## 📊 Мониторинг

В панели Vercel доступны:
- 📈 Аналитика трафика
- 🐛 Логи ошибок
- ⚡ Метрики производительности
- 🌍 География пользователей

## 🆘 Поддержка

При проблемах с деплоем:
1. Проверьте логи в Vercel Dashboard
2. Убедитесь что все зависимости в `package.json`
3. Проверьте структуру файлов:
   ```
   shorurl/
   ├── api/
   │   └── index.js
   ├── public/
   │   ├── index.html
   │   ├── styles.css
   │   └── script.js
   ├── vercel.json
   └── package.json
   ``` 