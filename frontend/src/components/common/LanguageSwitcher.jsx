import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "bn", label: "বাংলা" },
];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t("language")}
      className="inline-flex overflow-hidden rounded-md border border-gray-300 text-sm"
    >
      {LANGUAGES.map(({ code, label }) => {
        const active = i18n.resolvedLanguage === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => i18n.changeLanguage(code)}
            aria-pressed={active}
            className={
              active
                ? "bg-blue-600 px-3 py-1.5 font-medium text-white"
                : "bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-100"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
