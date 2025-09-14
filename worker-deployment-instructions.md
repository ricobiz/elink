# 🚀 Инструкции по развертыванию EIROS LINK Worker

## ✅ Готово к развертыванию!

Код Worker'а обновлен и готов к развертыванию на Cloudflare. Добавлены эндпоинты `/ai-access` и `/ai-status` для внешних ИИ.

## 🔧 Ручное развертывание

### Метод 1: Через CLI (рекомендуется)

1. **Установите API токен Cloudflare:**
   ```bash
   npx wrangler login
   ```
   
   Или экспортируйте токен:
   ```bash
   export CLOUDFLARE_API_TOKEN=your_token_here
   npx wrangler deploy
   ```

2. **Развертывание:**
   ```bash
   npx wrangler deploy
   ```

### Метод 2: Через Cloudflare Dashboard

1. Откройте [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Перейдите в `Workers & Pages`
3. Найдите Worker `eiroslink`
4. Нажмите `Edit code`
5. Скопируйте содержимое файла `worker.js`
6. Вставьте в редактор Cloudflare
7. Нажмите `Save and Deploy`

## 🎯 Что добавлено в Worker

### Новые эндпоинты:

**📄 `/ai-access`** - HTML страница для внешних ИИ:
- Красивый интерфейс с описанием API
- Текущее время (Москва)
- Список всех доступных команд
- JSON структура с информацией о системе

**📊 `/ai-status`** - JSON API для ИИ систем:
- Статус системы
- Версия и возможности
- Список доменов и эндпоинтов
- Информация о прокси сервере

### Поддерживаемые команды:

**🔗 Link Language:**
- `/goto/https://example.com` - Навигация
- `/click/button` - Клик по элементу
- `/type/input/текст` - Ввод текста
- `/screenshot` - Скриншот

**📍 Координатная система:**
- `/A/100/session` - Установить X координату
- `/B/200/session` - Установить Y координату  
- `/C/session` - Выполнить клик по staged координатам

**💾 Buffer API:**
- `/h/buf/set/session/text` - Установить буфер
- `/h/buf/append/session/text` - Добавить к буферу
- `/h/buf/get/session` - Получить буфер

## 🌐 Домены после развертывания

После успешного развертывания эндпоинты будут доступны по адресам:

- `https://eiroslink.5g7krbyjzb.workers.dev/ai-access`
- `https://eiroslink.5g7krbyjzb.workers.dev/ai-status`

А также (если настроены маршруты):
- `https://eiros.link/ai-access`
- `https://eiroslink.com/ai-access`

## 🔧 Настройки

В `wrangler.toml` уже настроены:
- ✅ Проксирование на актуальный Replit сервер
- ✅ CORS для всех доменов
- ✅ KV namespace для логирования
- ✅ Rate limiting (120 запросов в минуту)

## 🧪 Тестирование

После развертывания протестируйте:

```bash
# Проверить HTML страницу
curl https://eiroslink.5g7krbyjzb.workers.dev/ai-access

# Проверить JSON API
curl https://eiroslink.5g7krbyjzb.workers.dev/ai-status

# Проверить Link Language команду
curl https://eiroslink.5g7krbyjzb.workers.dev/h/health
```

## ⚡ Готово!

Worker готов к работе с внешними ИИ агентами на всех ваших доменах! 🎉