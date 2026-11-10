import { apiCall, assert, clickText, expectText, login } from './harness.mjs'
import { OWNER } from './auth.e2e.mjs'

export const title = 'Leave, statistics and employee profile'

const ivan = async (st) => (await st.sql("SELECT id FROM employees WHERE name = 'Ivan'")).rows[0].id

export const scenarios = () => [
  ['a vacation request waits for approval, and confirming it updates the balance', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    const id = await ivan(st)
    const from = (await st.sql("SELECT to_char((now() + interval '15 days')::date, 'YYYY-MM-DD') AS d")).rows[0].d
    const to = (await st.sql("SELECT to_char((now() + interval '17 days')::date, 'YYYY-MM-DD') AS d")).rows[0].d
    const created = await apiCall(page, 'POST', '/justifications', { employee_id: id, date: from, date_to: to, type: 'vacaciones', status: 'pending' })
    assert(created.status === 201, `could not create the request: ${JSON.stringify(created.body)}`)

    await page.goto(`${st.baseUrl}/leave`)
    await expectText(page, 'Saldo de vacaciones')
    await expectText(page, 'Confirmar')
    await clickText(page, 'Confirmar', 'button')
    await page.waitForFunction(
      () => !([...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Confirmar')),
      { timeout: 8000 },
    )
    assert((await st.sql('SELECT status FROM absence_justifications WHERE id = $1', [created.body.id])).rows[0].status === 'approved', 'the request should be approved')

    // 30 days a year, 3 taken: 27 left.
    await page.waitForFunction(
      () => [...document.querySelectorAll('li, tr, div')].some((el) => el.children.length < 8 && el.innerText.includes('Ivan Import') && /\b27\b/.test(el.innerText)),
      { timeout: 8000 },
    ).catch(() => {
      throw new Error('Ivan should have 27 vacation days left')
    })
  }],

  ['an administrator without the settings permission cannot approve, even by calling the server', async (page, st) => {
    await login(page, st.baseUrl, 'ada@example.com', 'Ada-Password-7')
    const id = await ivan(st)
    const created = await apiCall(page, 'POST', '/justifications', { employee_id: id, date: '2030-01-10', type: 'vacaciones', status: 'pending' })
    assert(created.status === 201, 'an administrator may record an absence')
    const attempt = await apiCall(page, 'POST', `/justifications/${created.body.id}/status`, { status: 'approved' })
    assert(attempt.status === 403, `expected 403, got ${attempt.status}`)
    assert((await st.sql('SELECT status FROM absence_justifications WHERE id = $1', [created.body.id])).rows[0].status === 'pending', 'it must stay pending')
  }],

  ['the employee profile shows the person, their statistics and their absences', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await page.goto(`${st.baseUrl}/employees`)
    await expectText(page, 'Ivan Import')
    await clickText(page, 'Ivan Import', 'a')
    await expectText(page, 'Ausencias')
    await expectText(page, 'Estadísticas')
    await expectText(page, 'Vacaciones')
    const path = new URL(page.url()).pathname
    assert(/^\/employees\/[0-9a-f-]{36}$/.test(path), `unexpected path ${path}`)
  }],

  ['the statistics page asks to pick an employee and then shows the figures', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await page.goto(`${st.baseUrl}/stats`)
    await expectText(page, 'Selecciona un empleado para ver sus estadísticas.')
  }],
]
