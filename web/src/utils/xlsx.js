// xlsx (SheetJS) is a heavy dependency: it is loaded on demand through a dynamic import, never a static one,
// so it does not end up in the main bundle.

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function loadXlsx() {
  return import('xlsx')
}
