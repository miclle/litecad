import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SupportedLanguage } from 'src/i18n'
import { supportedLanguages } from 'src/i18n'

const languageLabels: Record<SupportedLanguage, string> = {
  en: 'language.english',
  zh: 'language.chinese',
}

function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const currentLanguage: SupportedLanguage = i18n.language === 'zh' ? 'zh' : 'en'

  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-sm border border-[#cfc6b2] bg-[#fcfaf3] px-2 text-sm font-medium text-[#303329]">
      <Languages className="size-4 text-[#52625a]" />
      <span className="sr-only">{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        className="bg-transparent text-sm outline-none"
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
        value={currentLanguage}
      >
        {supportedLanguages.map((language) => (
          <option key={language} value={language}>
            {t(languageLabels[language])}
          </option>
        ))}
      </select>
    </label>
  )
}

export default LanguageSwitcher
