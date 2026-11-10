/** An error that maps to an HTTP status and a message that is safe to show to the client. */
export class HttpError extends Error {
  statusCode: number
  code: string | undefined

  constructor(statusCode: number, message: string, code?: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
  }
}

export const badRequest = (message: string, code?: string) => new HttpError(400, message, code)
export const unauthorized = (message = 'Authentication required') => new HttpError(401, message, 'unauthorized')
export const forbidden = (message = 'You do not have permission to do this') =>
  new HttpError(403, message, 'forbidden')
export const notFound = (message = 'Not found') => new HttpError(404, message, 'not_found')
export const conflict = (message: string, code?: string) => new HttpError(409, message, code)
export const badGateway = (message: string) => new HttpError(502, message, 'bad_gateway')
