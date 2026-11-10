import { apiCall, assert, clickText, expectNoText, expectText, fill, login } from './harness.mjs'
import { OWNER } from './auth.e2e.mjs'

export const title = 'Settings and holidays'

export const scenarios = () => [
  ['the owner changes the business details and they are saved', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await page.goto(`${st.baseUrl}/settings`)
    await expectText(page, 'Datos del negocio')
    await fill(page, '#settings-name', 'Corner Bakery & Cafe')
    await fill(page, '#settings-tax-id', 'TAX-123')
    await page.select('#settings-timezone', 'America/Bogota')
    await fill(page, '#settings-tolerance', '12')
    await clickText(page, 'Guardar cambios', 'button')
    await expectText(page, 'Cambios guardados')
    const row = (await st.sql('SELECT name, tax_id, timezone, tolerance_minutes FROM business')).rows[0]
    assert(row.name === 'Corner Bakery & Cafe', `name: ${row.name}`)
    assert(row.tax_id === 'TAX-123' && row.timezone === 'America/Bogota' && row.tolerance_minutes === 12, JSON.stringify(row))
    // The new name shows in the sidebar right away.
    await expectText(page, 'Corner Bakery & Cafe')
  }],

  ['the change survives a reload', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await page.goto(`${st.baseUrl}/settings`)
    await expectText(page, 'Datos del negocio')
    const value = await page.$eval('#settings-name', (input) => input.value)
    assert(value === 'Corner Bakery & Cafe', `the form should load the saved name, got ${value}`)
    assert((await page.$eval('#settings-timezone', (select) => select.value)) === 'America/Bogota', 'the time zone should be loaded')
  }],

  ['the owner adds a holiday from the calendar and can see it', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await page.goto(`${st.baseUrl}/settings`)
    await expectText(page, 'Feriados')
    await page.waitForSelector('button[title="Clic para agregar un feriado"]')
    await page.$eval('button[title="Clic para agregar un feriado"]', (button) => button.click())
    await fill(page, 'input[placeholder="Ej: Aniversario, Día del patrono..."]', 'Founders day')
    await clickText(page, 'Guardar', 'button')
    await expectText(page, 'Founders day')
    assert((await st.sql("SELECT count(*)::int AS n FROM holidays WHERE name = 'Founders day'")).rows[0].n === 1, 'the holiday should be saved')
  }],

  ['an administrator with only the holidays permission sees the calendar but not the business details', async (page, st) => {
    await login(page, st.baseUrl, 'gina@example.com', 'Gina-Password-8')
    await page.goto(`${st.baseUrl}/settings`)
    await expectText(page, 'Feriados')
    await expectNoText(page, 'Datos del negocio')
    await expectNoText(page, 'Tolerancia de tardanza')
  }],

  ['an administrator without any of those permissions is turned away from settings', async (page, st) => {
    await login(page, st.baseUrl, 'ada@example.com', 'Ada-Password-7')
    await page.goto(`${st.baseUrl}/settings`)
    await expectText(page, 'Acceso restringido')
    // ...and the server refuses the same change if it is attempted directly.
    const attempt = await apiCall(page, 'PATCH', '/business', { name: 'Hijacked' })
    assert(attempt.status === 403, `expected 403, got ${attempt.status}`)
    assert((await st.sql('SELECT name FROM business')).rows[0].name === 'Corner Bakery & Cafe', 'the name must not change')
  }],
]
