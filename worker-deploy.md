# 🚀 EIROS LINK - Cloudflare Worker Deployment

## Быстрый старт

### 1. Установка Wrangler CLI
```bash
npm install -g wrangler
```

### 2. Авторизация в Cloudflare
```bash
wrangler login
```

### 3. Создание KV namespace
```bash
wrangler kv:namespace create EIROS_BOARD
```

**Важно:** Скопируйте полученный ID и замените `EIROS_BOARD_KV_ID` в `wrangler.toml`

### 4. Настройка переменных
Отредактируйте `wrangler.toml`:
- `PROXY_ORIGIN` - ваш Replit URL
- `CORS_ALLOW_ORIGIN` - разрешенные домены

### 5. Деплой Worker
```bash
wrangler deploy
```

## 🔧 Настройка секретов (опционально)

```bash
# Токен для аутентификации
wrangler secret put AUTH_TOKEN

# OpenRouter API ключ (если нужен)  
wrangler secret put OPENROUTER_API_KEY
```

## 📡 Эндпоинты Worker

### Link Language команды
- `GET /h/health` - проверка статуса
- `GET /h/x/{sessionId}` - инициализация сессии  
- `GET /h/w/{sessionId}/{url}` - навигация
- `GET /h/g/{sessionId}` - скриншот

### Board операции (KV storage)
- `GET /h/board/list` - список элементов
- `GET /h/board/get/{key}` - получить значение
- `POST /h/board/put` - сохранить данные

### Проксирование
- `/api/*` - API запросы → Replit origin
- `/*` - статика и фронтенд → Replit origin

## 🌐 Домены

После настройки DNS в Cloudflare раскомментируйте routes в `wrangler.toml`:

```toml
[[routes]]
pattern = "https://eiroslink.com/*" 
zone_name = "eiroslink.com"
[[routes]]
pattern = "https://eiros.link/*"
zone_name = "eiros.link"  
```

## 📊 Мониторинг

```bash
# Логи в реальном времени
wrangler tail

# KV операции  
wrangler kv:key list --binding BOARD
wrangler kv:key get "log:session123" --binding BOARD
```

## 🔄 Обновления

```bash
# Разработка локально
wrangler dev

# Деплой после изменений
wrangler deploy
```

Worker готов к использованию! 🎉