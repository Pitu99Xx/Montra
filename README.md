# Montra

Gestión de finanzas personales: todas tus cuentas bancarias en un solo lugar, con conversión de divisas,
evolución del patrimonio y recordatorios para actualizar los saldos.

Webapp instalable en el iPhone (PWA) sobre Firebase: Authentication (Google), Firestore, Cloud Functions,
Cloud Messaging y Hosting.

- **App:** https://montra-gestion.web.app (también https://montra-832b1.web.app)
- **Diseño:** azul marino y oro, Playfair Display + Inter, logo «B4».

## Funciones

- **Acceso:** inicio de sesión con Google; la sesión se mantiene y la app pide un código de 4 dígitos o
  Face ID cada vez que vuelve a primer plano. La primera cuenta que entra queda como propietaria única.
- **Cuentas:** alta, edición (nombre, color, divisa, tipo), reordenación y borrado. El total se calcula en la
  divisa elegida en Ajustes con los tipos del BCE del día.
- **Actualizar saldos:** todas las cuentas en una pantalla; cada guardado añade un punto a la evolución.
- **Evolución:** gráfica del total y de las cuentas que elijas; al tocar un punto se ven fecha y saldo.
- **Ajustes:** cambiar PIN, Face ID, divisa del total, tema (oscuro / claro / sistema), notificaciones y
  recordatorios semanales con los días y la hora que quieras.

## Estructura

| Ruta | Qué hay |
| --- | --- |
| `src/` | App React + TypeScript (Vite) |
| `public/sw.js` | Service worker: notificaciones push |
| `functions/` | Cloud Functions: `updateRates` (tipos diarios), `sendReminders` (cada 5 min), `onUserRequest` (prueba de avisos) |
| `firestore.rules` | Reglas: solo la propietaria puede leer y escribir |
| `scripts/ensure-firebase.mjs` | Prepara el proyecto antes de desplegar (APIs, Firestore, sitio de Hosting, dominios) |
| `scripts/make-icons.mjs` | Genera el logo y los iconos de la PWA |
| `.github/workflows/` | `deploy.yml` despliega todo; `ci.yml` compila en cada push |

## Datos (Firestore)

```
meta/owner                       { uid }                      propietaria única
users/{uid}                      ajustes, PIN (hash PBKDF2), recordatorios
users/{uid}/accounts/{id}        cuenta y saldo actual
users/{uid}/snapshots/{id}       punto de la evolución (valores en EUR + tipos de ese momento)
users/{uid}/devices/{id}         tokens de notificaciones
rates/latest                     tipos de cambio del BCE (los escribe la función)
```

Las cuentas tienen un campo `kind` (`asset` / `liability`) preparado para tarjetas o préstamos que resten
del total en el futuro.

## Desarrollo

```bash
npm install && npm install --prefix functions
npm run dev            # http://localhost:5173
npm run build          # comprueba tipos y compila
```

## Despliegue

Automático con GitHub Actions al hacer push a `main` (o a mano desde *Actions → Desplegar en Firebase →
Run workflow*). Necesita el secreto `FIREBASE_SERVICE_ACCOUNT` con la clave JSON de una cuenta de servicio
del proyecto con permisos suficientes (ver más abajo).

Permisos de la cuenta de servicio `firebase-adminsdk-…@montra-832b1.iam.gserviceaccount.com`
(Google Cloud → IAM): **Propietario**, o como mínimo *Editor*, *Administrador de Cloud Functions*,
*Administrador de Cloud Run* y *Administrador de seguridad*.
