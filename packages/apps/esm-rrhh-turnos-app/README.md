# @sihsalus/esm-rrhh-turnos-app

Gestión de turnos del personal clínico-asistencial del Hospital II-1 Santa Clotilde: rol mensual, *Mis turnos* y asistencia frente a las marcaciones del reloj biométrico ZKTeco. Las pantallas y reglas vienen del prototipo de alta fidelidad (resultado R2.2 de la tesis) y se portan por fases.

- Ruta: `/rrhh-turnos`. Menú en `app-menu-item-slot`, orden 29 (junto a «Programación de turnos y recursos», 28).
- No confundir con `esm-staff-scheduling-app`, que programa ambientes y cupos de citas.

## Qué hay hoy

| Pantalla | Requisito | Qué muestra |
|---|---|---|
| Mis turnos | RF04, RF15 | Rol del mes del trabajador que inició sesión, próximo turno, horas frente al mínimo (150 h) y guardias frente al tope por año de ingreso |
| Asistencia | RF08 | Turnos ya ocurridos con su ingreso, salida y estado (asistió, inasistencia, sin salida, sin ingreso), filtro por UPSS y resumen |

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/domain/` | Reglas puras, sin React ni estado global: códigos del rol, parámetros, horas, guardias, cruces, bloques SUSALUD, validación TuASUSALUD (`reglas.ts`) y cruce turno-marcación (`asistencia.ts`) |
| `src/api/` | Contrato `FuenteDatos` y sus dos implementaciones: `demo` (datos sintéticos deterministas) y `frappe` (API REST de Frappe HR) |
| `src/rrhh.resource.ts` | Hooks SWR y vínculo usuario de SIH SALUS ↔ trabajador |
| `src/mis-turnos/`, `src/asistencia/` | Pantallas |

## Configuración

| Clave | Por defecto | Uso |
|---|---|---|
| `fuenteDatos` | `demo` | `demo` mientras no haya Frappe HR en el ambiente; `frappe` para leerlo |
| `frappeUrl` | `/rrhh` | Ruta de Frappe HR publicada por el gateway |
| `demoTrabajadorId` | `HSC-0004` | Trabajador que se muestra en la demo si el usuario no está vinculado |

## Origen de los datos en Frappe HR

| Componente | Frappe HR |
|---|---|
| Trabajador | `Employee` (`user_id` = usuario de SIH SALUS, `department` = UPSS, `attendance_device_id` = PIN del reloj) |
| Turno de un día | `Shift Assignment` cuyo `Shift Type` se llama como el código del rol (M, T, GDO, GNO, …) |
| Marcación | `Employee Checkin`, que el servicio de integración crea desde el reloj ZKTeco con `add_log_based_on_employee_field` |

El componente no habla con el reloj. La asistencia que muestra es un cruce informativo; la asistencia oficial la calcula Frappe HR (`Attendance`). No se calculan tardanzas ni descuentos.

## Desarrollo

```sh
yarn workspace @sihsalus/esm-rrhh-turnos-app test
yarn workspace @sihsalus/esm-rrhh-turnos-app typescript
yarn workspace @sihsalus/esm-rrhh-turnos-app lint
SIHSALUS_DEV_APPS=esm-rrhh-turnos-app,esm-login-app yarn start
```

## Pendiente

- Privilegios `app:home.rrhh.*` en `sihsalus-content`. Hoy la ruta y el menú piden `app:home.rrhh.misTurnos`, y *Asistencia* aún no se restringe por rol (debe verla la UGRH y el jefe de su UPSS).
- Calendario del jefe, aprobación, reportes y configuración del prototipo.
- Los nombres de los códigos del rol están en español porque son el catálogo oficial de la GERESA.
