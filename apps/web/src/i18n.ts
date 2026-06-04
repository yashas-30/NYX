import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      chat: 'Chat',
      settings: 'Settings',
      models: 'Local Models',
      search: 'Search',
      type_message: 'Type a message...',
      send: 'Send',
      // add more keys as needed
    },
  },
  es: {
    translation: {
      chat: 'Chat',
      settings: 'Configuración',
      models: 'Modelos Locales',
      search: 'Buscar',
      type_message: 'Escribe un mensaje...',
      send: 'Enviar',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
