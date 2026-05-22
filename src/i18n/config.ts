import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import translationEN from "./locales/en.json";
import translationJA from "./locales/ja.json";

const resources = {
  en: {
    translation: translationEN,
  },
  ja: {
    translation: translationJA,
  },
};

// Simple custom localStorage language detector
const getSavedLanguage = (): string => {
  const saved = localStorage.getItem("app_lang");
  if (saved === "ja" || saved === "en") {
    return saved;
  }
  // Fallback to system browser language or default to en
  const navLang = navigator.language;
  if (navLang && navLang.startsWith("ja")) {
    return "ja";
  }
  return "en";
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already safes from XSS
    },
  });

export default i18n;
