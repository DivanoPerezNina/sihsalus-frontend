# @sihsalus/esm-rrhh-turnos-app

Gestión de turnos del personal clínico-asistencial del Hospital II-1 Santa Clotilde: rol mensual por UPSS, aprobación y publicación, _Mis turnos_, asistencia frente al reloj biométrico, reportes (TuASUSALUD y DIRESA) y cierre del mes. El backend de turnos es Frappe HR; las integraciones (OpenMRS, Keycloak, FHIR y reloj) viven en el repositorio `sihsalus-rrhh-integracion`.

- Ruta: `/rrhh-turnos`. Menú en `app-menu-item-slot`, orden 29 (junto a «Programación de turnos y recursos», 28).
- No confundir con `esm-staff-scheduling-app`, que programa ambientes y cupos de citas.

## Pestañas y privilegios

Cada pestaña exige su privilegio; el menú aparece con cualquiera de ellos y, sin ninguno, la página queda cerrada. La interfaz solo oculta o bloquea: Frappe HR autoriza cada lectura y escritura con sus propios roles.

| Pestaña             | Privilegio                                                | Requisitos                                                                           | Qué hace                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mis turnos          | `app:home.rrhh.misTurnos`                                 | RF03, RF13, RF14, RF15, RF20, RNF04, RNF05                                           | Rol propio del mes, próximo turno y recordatorio, aviso de rol publicado y de turnos modificados, confirmar o avisar que no asistirá, copia de los próximos días para consultar sin conexión      |
| Calendario          | `app:home.rrhh.programacion` (ver), `.editar`, `.aprobar` | RF01, RF02, RF05, RF18, RF19, RF21, RF22, RF23, RF25, RF26, RF29, RF30, RNF06, RNF09 | Matriz persona × día de una UPSS; crear, modificar, mover y cancelar turnos con sus validaciones; enviar, aprobar u observar y publicar; restricción a la red del hospital con acceso excepcional |
| Asistencia          | `app:home.rrhh.asistencia`                                | RF08                                                                                 | Turnos ya ocurridos frente a las marcaciones del reloj                                                                                                                                            |
| Turnos por servicio | `app:home.rrhh.consolidado` (y `.cierre`)                 | RF04, RF28                                                                           | Todas las UPSS del mes; registro de lo ejecutado sin tocar lo programado; cierre del mes                                                                                                          |
| Reportes            | `app:home.rrhh.reportes`                                  | RF06, RF07, RF24, RF27, RF31                                                         | Plantilla oficial TuASUSALUD (solo de cronogramas publicados, con registros observados), rol DIRESA (Registro y Ejecutado) y Excel por servicio y fechas                                          |
| Sincronización      | `app:home.rrhh.sincronizacion`                            | RF11, RF12                                                                           | Eventos de la capa de integración y sus reintentos                                                                                                                                                |
| Configuración       | `app:home.rrhh.configuracion`                             | RNF03                                                                                | Parámetros de las reglas de negocio (con motivo obligatorio) e historial de cambios                                                                                                               |

Los privilegios y roles («SIH SALUS Mis turnos», «… Programación de turnos [editar|aprobar]», «… Gestión de RRHH») están en `sihsalus-content`.

## Estructura

| Carpeta                                                                                                           | Contenido                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/domain/`                                                                                                     | Reglas puras, sin React ni estado global: códigos del rol, parámetros, horas, guardias, cruces, bloques SUSALUD, validación TuASUSALUD, flujo del cronograma y cruce turno-marcación |
| `src/api/`                                                                                                        | Contrato `FuenteDatos` y sus dos implementaciones: `demo` (datos sintéticos en memoria) y `frappe` (API REST de Frappe HR)                                                           |
| `src/rrhh.resource.ts`                                                                                            | Hooks SWR; `src/privilegios.ts`: privilegios por pestaña                                                                                                                             |
| `src/calendario/`, `mis-turnos/`, `asistencia/`, `consolidado/`, `reportes/`, `sincronizacion/`, `configuracion/` | Pantallas                                                                                                                                                                            |

## Configuración

| Clave                                   | Por defecto                  | Uso                                                                               |
| --------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `fuenteDatos`                           | `demo`                       | `demo` mientras no haya Frappe HR en el ambiente; `frappe` para usarlo            |
| `frappeUrl`                             | `/rrhh`                      | Frappe HR publicado por el gateway                                                |
| `integracionUrl`                        | `/rrhh-integracion`          | Capa de integración (Camel): responde si la petición viene de la red del hospital |
| `ipress`                                | Hospital II-1 Santa Clotilde | Datos de la IPRESS para TuASUSALUD y DIRESA                                       |
| `demoTrabajadorId`, `demoEnRedHospital` | `HSC-0004`, `true`           | Solo para la fuente demo                                                          |

Las reglas de negocio (horas mínimas, tope de guardias, meses por adelantado, aprobación del director, recordatorio, acceso excepcional, días de copia sin conexión) **no** están aquí: se leen del backend y se editan en la pestaña Configuración.

## Origen de los datos en Frappe HR

`Employee` (trabajador), `Shift Assignment` con `Shift Type` = código del rol (turno de un día), `Employee Checkin` (marcación del reloj) y los DocTypes propios `Cronograma Turnos`, `Turno Ejecutado`, `Bitacora Turnos`, `Parametros Turnos`, `Acceso Excepcional` y `Evento Sincronizacion`. El detalle, los permisos y cómo levantar todo en local están en el README de `sihsalus-rrhh-integracion`.

Notas de comportamiento que conviene conocer:

- El rol del mes se lee por `docstatus = 1`, sin filtrar por `status`: Frappe HR pasa a `Inactive` las asignaciones de periodos pasados.
- La asistencia que se muestra es un cruce informativo entre turnos y marcaciones; no calcula tardanzas ni descuentos.
- La restricción por red es de interfaz (cerrada por defecto si la integración no responde); la definitiva corresponde al gateway.
- El aviso de rol publicado y de turnos modificados es interno a la app, a la espera del canal de notificaciones de SIH SALUS.

## Desarrollo

```sh
yarn workspace @sihsalus/esm-rrhh-turnos-app test
yarn workspace @sihsalus/esm-rrhh-turnos-app typescript
yarn workspace @sihsalus/esm-rrhh-turnos-app lint
SIHSALUS_DEV_APPS=esm-rrhh-turnos-app,esm-login-app,esm-home-app yarn start
```

Las pruebas de punta a punta en navegador contra OpenMRS, Frappe HR y la integración locales están en `sihsalus-rrhh-integracion/pruebas`.

## Pendiente

- Exportación a PDF (RF07 se cubre con Excel) y feriados desde el calendario de Frappe HR (hoy solo se distinguen los domingos).
- Reasignación asistida de un turno al que el trabajador no asistirá (hoy el jefe lo edita a mano en la matriz).
- Los nombres de los códigos del rol están en español porque son el catálogo oficial de la GERESA.
