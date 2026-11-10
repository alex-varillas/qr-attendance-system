import { apiCall, assert, expectText, login } from './harness.mjs'
import { OWNER } from './auth.e2e.mjs'

export const title = 'Dashboard'

async function rowText(page, name) {
  for (const row of await page.$$('tbody tr')) {
    const text = await row.evaluate((el) => el.innerText)
    if (text.includes(name)) return text
  }
  return null
}

export const scenarios = () => [
  ['the dashboard lists the active employees and who already checked in today', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await expectText(page, 'Presentes')
    await expectText(page, 'Ivan Import')
    const ivan = await rowText(page, 'Ivan Import')
    assert(/\d{2}:\d{2}/.test(ivan), `Ivan checked in earlier, so his row should show a time: ${JSON.stringify(ivan)}`)
    // The owner is not part of the attendance table.
    assert((await rowText(page, 'Olivia Owner')) === null, 'the owner must not be listed')
    // Employees that were deactivated do not appear either.
    assert((await rowText(page, 'Eva Employee')) === null, 'an inactive employee must not be listed')
  }],

  ['the counters reflect the day', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await expectText(page, 'Presentes')
    const readCounter = () => {
      const label = [...document.querySelectorAll('p')].find((p) => p.textContent.trim() === 'Presentes')
      return Number(label?.previousElementSibling?.textContent)
    }
    // The counter starts at 0 until the day's marks arrive.
    await page.waitForFunction((read) => new Function(`return (${read})()`)() > 0, { timeout: 8000 }, readCounter.toString())
    const presentes = await page.evaluate((read) => new Function(`return (${read})()`)(), readCounter.toString())
    const checkedIn = (await st.sql("SELECT count(DISTINCT employee_id)::int AS n FROM attendance_records WHERE type = 'checkin'")).rows[0].n
    assert(presentes >= checkedIn - 1 && presentes <= checkedIn + 3, `presentes=${presentes}, people who checked in=${checkedIn}`)
  }],

  ['a check-in appears on an open dashboard without reloading the page', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    const created = await apiCall(page, 'POST', '/employees', { name: 'Liv', last_name: 'Live' })
    assert(created.status === 201, 'could not create the employee')
    await page.reload()
    await expectText(page, 'Liv Live')
    const before = await rowText(page, 'Liv Live')
    assert(!/\d{2}:\d{2}/.test(before), `she has not checked in yet: ${JSON.stringify(before)}`)

    // Another device scans the QR code and checks in. This page is not reloaded.
    const business = (await st.sql('SELECT id FROM business')).rows[0].id
    const phone = await st.newPage()
    try {
      await phone.goto(`${st.baseUrl}/checkin/${business}`)
      const marked = await apiCall(phone, 'POST', '/public/checkin', { employee_id: created.body.id })
      assert(marked.status === 201, `the check-in failed: ${JSON.stringify(marked.body)}`)
    } finally {
      await phone.browserContext?.close().catch(() => {})
    }

    await page.waitForFunction(
      () => [...document.querySelectorAll('tbody tr')].some((row) => row.innerText.includes('Liv Live') && /\d{2}:\d{2}/.test(row.innerText)),
      { timeout: 10000 },
    ).catch(() => {
      throw new Error('the dashboard did not update by itself after the check-in')
    })
  }],

  ['the date picker moves to another day and back to today', async (page, st) => {
    await login(page, st.baseUrl, OWNER.email, OWNER.password)
    await expectText(page, 'Presentes')
    // Yesterday: nobody checked in, so nobody shows a time.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => /Hoy,/.test(b.innerText))
      button?.click()
    })
    await expectText(page, 'Ir a hoy')
    await page.evaluate(() => {
      const days = [...document.querySelectorAll('button')].filter((b) => /^\d{1,2}$/.test(b.innerText.trim()) && !b.disabled)
      // the day before today is the last enabled day cell but one
      days.at(-2)?.click()
    })
    await page.waitForFunction(() => !/Hoy,/.test(document.body.innerText), { timeout: 5000 })
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((b) => /^(Lun|Mar|Mié|Jue|Vie|Sáb|Dom)/.test(b.innerText.trim()))
      button?.click()
    })
    await expectText(page, 'Ir a hoy')
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Ir a hoy')?.click())
    await expectText(page, 'Hoy,')
  }],
]
