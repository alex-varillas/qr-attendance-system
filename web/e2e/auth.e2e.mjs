import { apiCall, assert, clickText, expectText, fill, waitForPath } from './harness.mjs'

export const OWNER = { email: 'owner@example.com', password: 'Correct-Horse-9', name: 'Olivia', last: 'Owner', business: 'Corner Bakery' }

export const title = 'Authentication and setup'

export const scenarios = (stack) => [
  ['a brand new installation sends everyone to the setup', async (page) => {
    await page.goto(`${stack.baseUrl}/`)
    await waitForPath(page, '/setup')
    await expectText(page, 'Configura tu negocio')
    await page.goto(`${stack.baseUrl}/login`)
    await waitForPath(page, '/setup')
  }],

  ['the setup creates the owner and the business, then the working hours', async (page) => {
    await page.goto(`${stack.baseUrl}/setup`)
    await fill(page, '#business_name', OWNER.business)
    await page.select('#timezone', 'America/Lima')
    await page.select('#locale', 'es')
    await fill(page, '#name', OWNER.name)
    await fill(page, '#last_name', OWNER.last)
    await fill(page, '#email', OWNER.email)
    await fill(page, '#password', OWNER.password)
    await fill(page, '#confirm', OWNER.password)
    await clickText(page, 'Continuar')
    await expectText(page, 'Tu horario de trabajo')
    await clickText(page, 'Guardar y entrar')
    await waitForPath(page, '/dashboard')
    await expectText(page, OWNER.business)
    const business = (await stack.sql('SELECT name, timezone, locale FROM business')).rows[0]
    assert(business.name === OWNER.business && business.timezone === 'America/Lima', 'the business was not saved')
    const schedule = (await stack.sql("SELECT to_char(start_time, 'HH24:MI') AS s FROM schedules WHERE is_default")).rows[0]
    assert(schedule?.s === '09:00', 'the default schedule was not saved')
  }],

  ['the setup cannot be run a second time', async (page) => {
    await page.goto(`${stack.baseUrl}/setup`)
    await waitForPath(page, '/login')
    const response = await apiCall(page, 'POST', '/setup', { email: 'x@example.com', password: 'Another-Pass-1', name: 'X', last_name: 'Y', business_name: 'Z' })
    assert(response.status === 409, `expected 409, got ${response.status}`)
  }],

  ['a wrong password is refused and the right one signs in and out', async (page) => {
    await page.goto(`${stack.baseUrl}/login`)
    await fill(page, '#email', OWNER.email)
    await fill(page, '#password', 'not the password')
    await clickText(page, 'Ingresar')
    await expectText(page, 'Correo o contraseña incorrectos.')
    await fill(page, '#password', OWNER.password)
    await clickText(page, 'Ingresar')
    await waitForPath(page, '/dashboard')
    await expectText(page, OWNER.business)
    await page.click('button[title="Cerrar sesión"]')
    await waitForPath(page, '/login')
    await page.goto(`${stack.baseUrl}/dashboard`)
    await waitForPath(page, '/login')
  }],

  ['the session survives a reload and is httpOnly', async (page) => {
    await page.goto(`${stack.baseUrl}/login`)
    await fill(page, '#email', OWNER.email)
    await fill(page, '#password', OWNER.password)
    await clickText(page, 'Ingresar')
    await waitForPath(page, '/dashboard')
    await page.reload()
    await expectText(page, OWNER.business)
    const session = (await page.cookies()).find((cookie) => cookie.name === 'qras_session')
    assert(session?.httpOnly === true, 'the session cookie must be httpOnly')
    const visible = await page.evaluate(() => document.cookie)
    assert(!visible.includes('qras_session'), 'JavaScript must not be able to read the session')
  }],

  ['without email configured, forgot-password explains how to get back in', async (page) => {
    await page.goto(`${stack.baseUrl}/forgot-password`)
    await fill(page, '#email', OWNER.email)
    await clickText(page, 'Continuar')
    await expectText(page, 'Este sistema no envía correos.')
    await expectText(page, 'npm run reset-password')
  }],

  ['an administrator joins with the invitation link, once', async (page) => {
    await page.goto(`${stack.baseUrl}/login`)
    await apiCall(page, 'POST', '/auth/login', { email: OWNER.email, password: OWNER.password })
    const created = await apiCall(page, 'POST', '/employees', { name: 'Ada', last_name: 'Admin', role: 'admin' })
    const invite = await apiCall(page, 'POST', `/employees/${created.body.id}/invite`, { email: 'ada@example.com' })
    assert(invite.status === 200, 'the invitation was not created')
    await apiCall(page, 'POST', '/auth/logout')

    await page.goto(invite.body.link)
    await expectText(page, 'Te invitaron a administrar Corner Bakery')
    await expectText(page, 'ada@example.com')
    await fill(page, '#password', 'Ada-Password-7')
    await fill(page, '#confirm', 'Ada-Password-7')
    await clickText(page, 'Guardar contraseña y entrar')
    await waitForPath(page, '/dashboard')
    await expectText(page, 'Administrador')

    // The link cannot be used a second time.
    await apiCall(page, 'POST', '/auth/logout')
    await page.goto(invite.body.link)
    await expectText(page, 'Esta invitación no es válida o ya venció.')
  }],
]
