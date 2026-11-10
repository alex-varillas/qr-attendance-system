# Asistia | QR Attendance System

Control de asistencia por QR de código abierto para un solo negocio. Los empleados marcan escaneando un código QR con su celular (sin instalar ninguna app), y el dueño y los administradores ven el día en un dashboard y exportan reportes. Lo ejecutas en tu propio servidor, así que los datos son tuyos.

Versión en inglés: [README.md](README.md)

## Funciones

- **Marcación por QR, sin app.** Cada sede tiene su propio código QR. El empleado lo escanea, elige su nombre, ingresa un PIN opcional de 4 dígitos y marca su entrada, el inicio o fin del refrigerio, o su salida.
- **Verificación de ubicación (opcional).** Activada, el servidor rechaza una marcación fuera del radio permitido de la sede y guarda el intento bloqueado. La ubicación es obligatoria, no una sugerencia.
- **Dashboard en vivo.** Quién llegó, quién tardó y quién falta, actualizado a medida que la gente marca, sin recargar.
- **Empleados, sedes y áreas**, con horario semanal por negocio, sede o empleado, excepciones de horario para un día puntual y feriados.
- **Vacaciones, justificación de ausencias y horas extra**, con un paso de aprobación.
- **Estadísticas y reportes.** Estadísticas por empleado y reportes de asistencia en Excel y PDF, guardados en el servidor para consultarlos después.
- **Roles y permisos.** El dueño puede hacer todo; los administradores gestionan a los empleados comunes y reciben permisos adicionales solo si el dueño se los da. Los empleados no tienen cuenta.
- **Interfaz en español e inglés**, a elegir por instalación.
- **Autoalojado.** Docker Compose con PostgreSQL, HTTPS automático opcional y correo opcional.

## Inicio rápido

Necesitas Docker con Compose.

```sh
git clone <url-del-repositorio>
cd qr-attendance-system
cp .env.example .env        # define POSTGRES_PASSWORD con un valor largo y aleatorio
docker compose up -d
```

Abre <http://localhost:3000>. La primera pantalla crea el negocio y la cuenta del dueño. Después no hay registro público: los administradores entran con un enlace de invitación del dueño.

Los navegadores solo permiten la cámara y la ubicación en HTTPS (o en `localhost`), así que una instalación real necesita HTTPS. [docs/installation.md](docs/installation.md) (en inglés) explica el HTTPS automático, cómo instalar sin Docker, las actualizaciones, las copias de seguridad y cómo recuperar una contraseña perdida.

## Documentación

La documentación está en inglés:

- [Instalación](docs/installation.md): Docker, HTTPS, sin Docker, actualizaciones, copias de seguridad, recuperación.
- [Configuración](docs/configuration.md): todas las variables de entorno, correo, proxy inverso, qué sale de tu servidor.
- [Arquitectura](docs/architecture.md): componentes, modelo de datos, cómo se valida una marcación, modelo de seguridad.
- [Desarrollo](docs/development.md): ejecutarlo en local, pruebas, migraciones, traducciones.
- [Cómo contribuir](CONTRIBUTING.md), [Política de seguridad](SECURITY.md), [Código de conducta](CODE_OF_CONDUCT.md), [Historial de cambios](CHANGELOG.md).

## Tecnología

- Frontend: React 19, Vite, Tailwind CSS, TanStack Query.
- Backend: Node.js 24, TypeScript, Fastify, PostgreSQL (Drizzle para el esquema y las migraciones, SQL parametrizado para las consultas).
- Instalación: Docker Compose, con Caddy para el HTTPS opcional.

## Desarrollo

Requisitos: Node.js 24 o superior, y Docker para la base de datos.

```sh
npm run install:all     # instala server/ y web/
npm run db:dev          # PostgreSQL de desarrollo en el puerto 55432
cp server/.env.example server/.env
npm run dev:server      # API en http://localhost:3000
npm run dev:web         # app web en http://localhost:5173
```

## Verificación

```sh
npm run db:test                   # PostgreSQL desechable para las pruebas, en el puerto 55433
npm test                          # pruebas de integración del servidor y pruebas unitarias de la web
npm run lint                      # tipos del servidor y lint de la app web
npm run test:e2e                  # pruebas en un navegador real de toda la app (compila la web antes)
npm --prefix web run i18n:check   # todos los textos tienen traducción al inglés
```

## Estructura

```
server/   API: rutas Fastify, reglas de marcación, migraciones (server/drizzle), pruebas
web/      App web: React, traducciones (web/src/i18n), pruebas de extremo a extremo (web/e2e)
docs/     Guías
Dockerfile, docker-compose.yml, Caddyfile   Instalación
```

## Licencia

MIT. Ver [LICENSE](LICENSE).
