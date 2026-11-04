import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import bn from "./locales/bn.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      bn: { translation: bn },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "bn"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "app_language",
    },
  });

// Keep <html lang="..."> in sync (used for fonts, spacing, and screen readers)
const applyLang = (lng) => {
  document.documentElement.lang = (lng || "en").slice(0, 2);
};
applyLang(i18n.language);
i18n.on("languageChanged", applyLang);

export default i18n;
