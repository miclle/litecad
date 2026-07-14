import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { useTranslation } from 'react-i18next'

import i18n from 'src/i18n'
import LanguageSwitcher from './LanguageSwitcher'

function LanguageProbe() {
  const { t } = useTranslation()
  return (
    <div>
      <LanguageSwitcher />
      <span>{t('nav.newProject')}</span>
      <span>{t('project.route.opening')}</span>
    </div>
  )
}

describe('LanguageSwitcher', () => {
  afterEach(async () => {
    cleanup()
    window.localStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('switches visible copy between English and Chinese', async () => {
    const user = userEvent.setup()

    render(<LanguageProbe />)

    expect(screen.getByText('New project')).toBeTruthy()
    expect(screen.getByText('Opening project')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Language'), 'zh')

    expect(await screen.findByText('新建项目')).toBeTruthy()
    expect(screen.getByText('正在打开项目')).toBeTruthy()
    expect(window.localStorage.getItem('litecad:language')).toBe('zh')
    expect(document.documentElement.lang).toBe('zh-CN')
  })
})
