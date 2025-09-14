import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'ru';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, defaultValue?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations = {
  en: {
    // Navigation
    'nav.chat': 'Chat',
    'nav.automation': 'Automation',
    'nav.dashboard': 'Dashboard',
    
    // Status
    'status.start': 'Start',
    'status.pause': 'Pause', 
    'status.stop': 'Stop',
    'status.operational': 'Operational',
    'status.running': 'Running',
    'status.paused': 'Paused',
    'status.stopped': 'Stopped',
    
    // Chat Interface
    'chat.welcome.title': 'Welcome to EIROS',
    'chat.welcome.subtitle': 'Speak with me in plain language, and I\'ll help you control browsers and perform automation',
    'chat.welcome.examples.1': '• "Take a screenshot of the page"',
    'chat.welcome.examples.2': '• "Navigate to google.com"', 
    'chat.welcome.examples.3': '• "Click the login button"',
    'chat.input.placeholder': 'Command in plain language...',
    'chat.input.placeholder.nosession': 'Message (session will be created automatically)...',
    'chat.processing': 'AI is processing request...',
    'chat.clear.button': 'Clear',
    'chat.clear.title': 'Clear current chat',
    
    // Session Management
    'session.label': 'Session:',
    'session.none': 'not created',
    'session.create': 'Create Session',
    'session.create.short': 'Create',
    'session.current': 'Session:',
    'session.no.active': 'No active session',
    
    // Model Selection
    'model.label': 'Model:',
    'model.search.placeholder': 'Search models...',
    'model.not.found': 'No models found',
    'model.not.found.search': 'No models found for query',
    'model.set.default': 'Set Default',
    'model.setting.default': 'Setting...',
    'model.context': 'Context:',
    'model.context.tokens': 'tokens',
    
    // File Upload
    'file.attach': 'Attach File',
    'file.remove': 'Remove',
    
    // Voice Recording  
    'voice.unavailable.title': 'Voice dictation unavailable',
    'voice.unavailable.desc': 'Your browser does not support speech recognition',
    'voice.error.title': 'Recognition error',
    'voice.error.desc': 'Could not recognize speech. Please try again.',
    
    // Errors and Messages
    'error.no.session': 'No active session',
    'error.session.create': 'Error creating session',
    'error.session.create.desc': 'Could not create session to send message',
    'error.message.process': 'Error',
    'error.message.process.desc': 'Could not process message',
    'error.clear.chat': 'Error clearing chat',
    'error.clear.chat.desc': 'Could not clear chat',
    
    // Success Messages
    'success.session.created': 'Session created',
    'success.chat.cleared': 'Chat cleared',
    'success.chat.cleared.desc': 'All messages deleted from current session',
    
    // AI Coordination
    'coordination.title': '🤝 AI Action Coordination',
    'coordination.stop': '⏸️ Stop',
    'coordination.continue': '✅ Continue', 
    'coordination.different': '🔄 Different approach',
    'coordination.screenshot': '📸 Screenshot',
    'coordination.check': '⚠️ Check carefully',
    
    // Quick Actions
    'quick.stop': 'Stop! Wait.',
    'quick.continue': 'Continue, you\'re doing right.',
    'quick.different': 'Try a different approach.',
    'quick.screenshot': 'Need to take screenshot for verification.',
    'quick.check': 'Something went wrong, check carefully.',
    
    // View Modes
    'view.chat': 'Chat',
    'view.automation': 'Automation',
    'view.events': 'Link Language Events',
    
    // Automation Mode
    'automation.mode.on': 'Automation Mode ON - AI can execute commands',
    'automation.mode.off': 'Chat Mode - AI responses only, no commands',
    'session.clear': 'Clear session messages',
    
    // Info Display
    'info.model': 'Model:',
    'info.session': 'Session:',
    'info.session.not.created': 'Session not created',
    
    // Dashboard
    'dashboard.title': 'Automation Dashboard',
    'dashboard.back': 'Back to Chat',
    'dashboard.browser': 'Browser',
    'dashboard.files': 'Files',
    'dashboard.logs': 'Logs',
    
    // EventBoard
    'events.title': 'Link Language Events',
    'events.empty': 'No events yet',
    'events.empty.desc': 'Browser automation events will appear here',
    'events.screenshot': 'Screenshot',
    'events.navigate': 'Navigate to URL',
    'events.browser.control': 'Browser Control',
    'events.session.required': 'Select active session',
    'events.url.required': 'URL required',
    'events.error.screenshot': 'Screenshot error',
    'events.error.navigation': 'Navigation error',
    'events.refresh': 'Refresh'
  },
  ru: {
    // Navigation
    'nav.chat': 'Чат',
    'nav.automation': 'Автоматизация',
    'nav.dashboard': 'Дашборд',
    
    // Status
    'status.start': 'Запуск',
    'status.pause': 'Пауза',
    'status.stop': 'Стоп', 
    'status.operational': 'Работает',
    'status.running': 'Запущен',
    'status.paused': 'Приостановлен',
    'status.stopped': 'Остановлен',
    
    // Chat Interface
    'chat.welcome.title': 'Добро пожаловать в EIROS',
    'chat.welcome.subtitle': 'Говорите со мной простым языком, и я помогу вам управлять браузером и выполнять автоматизацию',
    'chat.welcome.examples.1': '• "Сделай скриншот страницы"',
    'chat.welcome.examples.2': '• "Перейди на google.com"',
    'chat.welcome.examples.3': '• "Кликни по кнопке входа"',
    'chat.input.placeholder': 'Команда простым языком...',
    'chat.input.placeholder.nosession': 'Сообщение (сессия создастся автоматически)...',
    'chat.processing': 'AI обрабатывает запрос...',
    'chat.clear.button': 'Очистить',
    'chat.clear.title': 'Очистить текущий чат',
    
    // Session Management
    'session.label': 'Сессия:',
    'session.none': 'не создана',
    'session.create': 'Создать сессию',
    'session.create.short': 'Создать',
    'session.current': 'Сессия:',
    'session.no.active': 'Нет активной сессии',
    
    // Model Selection
    'model.label': 'Модель:',
    'model.search.placeholder': 'Поиск моделей...',
    'model.not.found': 'Модели не найдены',
    'model.not.found.search': 'Не найдено моделей по запросу',
    'model.set.default': 'По умолчанию',
    'model.setting.default': 'Сохранение...',
    'model.context': 'Контекст:',
    'model.context.tokens': 'токенов',
    
    // File Upload
    'file.attach': 'Прикрепить файл',
    'file.remove': 'Удалить',
    
    // Voice Recording
    'voice.unavailable.title': 'Голосовая диктовка недоступна',
    'voice.unavailable.desc': 'Ваш браузер не поддерживает распознавание речи',
    'voice.error.title': 'Ошибка распознавания',
    'voice.error.desc': 'Не удалось распознать речь. Попробуйте еще раз.',
    
    // Errors and Messages
    'error.no.session': 'Нет активной сессии',
    'error.session.create': 'Ошибка создания сессии',
    'error.session.create.desc': 'Не удалось создать сессию для отправки сообщения',
    'error.message.process': 'Ошибка',
    'error.message.process.desc': 'Не удалось обработать сообщение',
    'error.clear.chat': 'Ошибка очистки чата',
    'error.clear.chat.desc': 'Не удалось очистить чат',
    
    // Success Messages
    'success.session.created': 'Сессия создана',
    'success.chat.cleared': 'Чат очищен',
    'success.chat.cleared.desc': 'Все сообщения удалены из текущей сессии',
    
    // AI Coordination
    'coordination.title': '🤝 Координация действий ИИ',
    'coordination.stop': '⏸️ Стоп',
    'coordination.continue': '✅ Продолжай',
    'coordination.different': '🔄 Другой подход',
    'coordination.screenshot': '📸 Скриншот',
    'coordination.check': '⚠️ Проверь',
    
    // Quick Actions
    'quick.stop': 'Стоп! Подожди.',
    'quick.continue': 'Продолжай, делаешь правильно.',
    'quick.different': 'Попробуй другой подход.',
    'quick.screenshot': 'Нужно сделать скриншот для проверки.',
    'quick.check': 'Что-то пошло не так, проверь внимательно.',
    
    // View Modes
    'view.chat': 'Чат',
    'view.automation': 'Автоматизация',
    'view.events': 'События Link Language',
    
    // Automation Mode
    'automation.mode.on': 'Режим автоматизации ВКЛ - ИИ может выполнять команды',
    'automation.mode.off': 'Режим чата - только ответы ИИ, без команд',
    'session.clear': 'Очистить сообщения сессии',
    
    // Info Display
    'info.model': 'Модель:',
    'info.session': 'Сессия:',
    'info.session.not.created': 'Сессия не создана',
    
    // Dashboard
    'dashboard.title': 'Панель автоматизации',
    'dashboard.back': 'Назад к чату',
    'dashboard.browser': 'Браузер',
    'dashboard.files': 'Файлы',
    'dashboard.logs': 'Логи',
    
    // EventBoard
    'events.title': 'События Link Language',
    'events.empty': 'Событий пока нет',
    'events.empty.desc': 'События автоматизации браузера появятся здесь',
    'events.screenshot': 'Скриншот',
    'events.navigate': 'Перейти по URL',
    'events.browser.control': 'Управление браузером',
    'events.session.required': 'Выберите активную сессию',
    'events.url.required': 'Нужен URL',
    'events.error.screenshot': 'Ошибка скриншота',
    'events.error.navigation': 'Ошибка навигации',
    'events.refresh': 'Обновить'
  }
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en'); // Default to English

  useEffect(() => {
    const savedLanguage = localStorage.getItem('eiros-language') as Language;
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'ru')) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage);
    localStorage.setItem('eiros-language', newLanguage);
  };

  const t = (key: string, defaultValue?: string): string => {
    return translations[language][key as keyof typeof translations['en']] || defaultValue || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}