import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apiCall, assert, clickText, expectNoText, expectText, fill, login, wait, waitForPath } from './harness.mjs'
import { OWNER } from './auth.e2e.mjs'

export const title = 'Employees'

const openEmployees = async (page, stack) => {
  await login(page, stack.baseUrl, OWNER.email, OWNER.password)
  await page.goto(`${stack.baseUrl}/employees`)
  await expectText(page, 'empleados activos')
}

export const scenarios = (stack) => [
  ['the owner adds an employee with a PIN, and only a hash is stored', async (page) => {
    await openEmployees(page, stack)
    await clickText(page, 'Agregar empleado')
    await fill(page, 'input[placeholder="Juan"]', 'Eva')
    await fill(page, 'input[placeholder="Pérez"]', 'Employee')
    await fill(page, 'input[placeholder="Nro. de documento"]', '55555')
    await fill(page, 'input[placeholder="Vendedor"]', 'Baker')
    await fill(page, 'input[placeholder="0000"]', '4321')
    await clickText(page, 'Agregar empleado', 'button[type="submit"]')
    await expectText(page, 'Eva Employee')
    await expectText(page, '55555')
    const row = (await stack.sql("SELECT pin_enabled, pin_hash FROM employees WHERE name = 'Eva'")).rows[0]
    assert(row.pin_enabled === true, 'the PIN should be enabled')
    assert(row.pin_hash.startsWith('$argon2') && !row.pin_hash.includes('4321'), 'the PIN must be stored as a hash')
  }],

  ['the owner edits an employee and the change is saved', async (page) => {
    await openEmployees(page, stack)
    await expectText(page, 'Eva Employee')
    const rows = await page.$$('tbody tr')
    let edited = false
    for (const row of rows) {
      const text = await row.evaluate((el) => el.innerText)
      if (text.includes('Eva Employee')) {
        await (await row.$('button[aria-label="Editar"]')).click()
        edited = true
        break
      }
    }
    assert(edited, 'could not find the row of Eva')
    await fill(page, 'input[placeholder="Vendedor"]', 'Head baker')
    await clickText(page, 'Guardar cambios')
    await expectText(page, 'Head baker')
    const saved = (await stack.sql("SELECT puesto FROM employees WHERE name = 'Eva'")).rows[0]
    assert(saved.puesto === 'Head baker', 'the change was not saved')
  }],

  ['deactivating an employee asks first and hides them until inactive ones are shown', async (page) => {
    await openEmployees(page, stack)
    const rows = await page.$$('tbody tr')
    for (const row of rows) {
      if ((await row.evaluate((el) => el.innerText)).includes('Eva Employee')) {
        await (await row.$('button[aria-label="Desactivar"]')).click()
        break
      }
    }
    await expectText(page, 'No podrá marcar asistencia')
    await clickText(page, 'Sí, desactivar')
    await wait(400)
    await expectNoText(page, 'Eva Employee')
    await page.click('input[type="checkbox"]')
    await expectText(page, 'Eva Employee')
    await expectText(page, 'Inactivo')
    assert((await stack.sql("SELECT active FROM employees WHERE name = 'Eva'")).rows[0].active === false, 'Eva should be inactive')
  }],

  ['departments can be created from the Areas dialog', async (page) => {
    await openEmployees(page, stack)
    await clickText(page, 'Áreas')
    await fill(page, 'input[placeholder="Nueva área (ej. Ventas)"]', 'Kitchen')
    await page.keyboard.press('Enter')
    await expectText(page, 'Kitchen')
    assert((await stack.sql("SELECT count(*)::int AS n FROM departments WHERE name = 'Kitchen'")).rows[0].n === 1, 'the department was not saved')
  }],

  ['employees can be imported from a CSV file, skipping duplicates', async (page) => {
    await openEmployees(page, stack)
    const file = path.join(os.tmpdir(), `qras-import-${Date.now()}.csv`)
    fs.writeFileSync(file, 'nombre,apellido,dni,puesto,dias_descanso\nIvan,Import,2001,Clerk,empresa\nOlga,Import,2002,Clerk,empresa\nEva,Duplicate,55555,Baker,empresa\n')
    await clickText(page, 'Importar CSV')
    const input = await page.waitForSelector('input[type="file"]')
    await input.uploadFile(file)
    await expectText(page, '1 ya existen')
    await clickText(page, 'Importar 2 empleados')
    await expectText(page, 'Importación exitosa')
    await expectText(page, '2 empleados creados')
    fs.rmSync(file, { force: true })
    assert((await stack.sql("SELECT count(*)::int AS n FROM employees WHERE last_name = 'Import'")).rows[0].n === 2, 'the two rows should exist')
  }],

  ['the owner invites an administrator, who joins with the copied link', async (page, st) => {
    await openEmployees(page, st)
    await apiCall(page, 'POST', '/employees', { name: 'Gina', last_name: 'Grants', role: 'admin' })
    await page.reload()
    await expectText(page, 'Gina Grants')
    const rows = await page.$$('tbody tr')
    for (const row of rows) {
      if ((await row.evaluate((el) => el.innerText)).includes('Gina Grants')) {
        await clickText(row, 'Invitar', 'button')
        break
      }
    }
    await fill(page, '#invite-email', 'gina@example.com')
    await clickText(page, 'Crear invitación')
    await expectText(page, 'Invitación para Gina Grants')
    const link = await page.$eval('#share-link', (el) => el.value)
    assert(/\/accept-invite\?token=/.test(link), `unexpected link ${link}`)
    await clickText(page, 'Cerrar')
    await expectText(page, 'Invitación pendiente')

    const other = await st.newPage()
    try {
      await other.goto(link)
      await expectText(other, 'Te invitaron a administrar Corner Bakery')
      await fill(other, '#password', 'Gina-Password-8')
      await fill(other, '#confirm', 'Gina-Password-8')
      await clickText(other, 'Guardar contraseña y entrar')
      await waitForPath(other, '/dashboard')
      await expectText(other, 'Administrador')
      // An administrator without permissions does not even see Settings.
      await expectNoText(other, 'Configuración')
    } finally {
      await other.browserContext?.close().catch(() => {})
    }
    await page.reload()
    await expectText(page, 'Acceso activo')
  }],

  ['the owner grants a permission and the administrator gets the menu entry', async (page, st) => {
    await openEmployees(page, st)
    const rows = await page.$$('tbody tr')
    for (const row of rows) {
      if ((await row.evaluate((el) => el.innerText)).includes('Gina Grants')) {
        await (await row.$('button[aria-label="Editar"]')).click()
        break
      }
    }
    await expectText(page, 'Permisos adicionales')
    await wait(500) // let the modal finish animating before clicking inside it
    // The modal has other switches (the schedule one): pick the permission by its label.
    const permissionSwitch = () => {
      const label = [...document.querySelectorAll('p')].find((p) => p.textContent.trim() === 'Gestión de feriados')
      return label?.closest('div.flex')?.querySelector('button[role="switch"]')
    }
    await page.evaluate((find) => new Function(`return (${find})()`)().click(), permissionSwitch.toString())
    await page.waitForFunction(
      (find) => new Function(`return (${find})()`)()?.getAttribute('aria-checked') === 'true',
      { timeout: 5000 },
      permissionSwitch.toString(),
    )
    const granted = (await st.sql("SELECT permissions FROM employees WHERE name = 'Gina'")).rows[0].permissions
    assert(Object.values(granted).some((value) => value === true), `a permission should be on, found ${JSON.stringify(granted)}`)

    const gina = await st.newPage()
    try {
      await login(gina, st.baseUrl, 'gina@example.com', 'Gina-Password-8')
      await expectText(gina, 'Configuración')
    } finally {
      await gina.browserContext?.close().catch(() => {})
    }
  }],
]
