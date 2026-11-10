# DCAM CRM para iPad 2

Versión diseñada para Safari de iOS 9. Usa la cuenta, los datos y la conexión de WhatsApp del CRM existente.

## Publicar

Copiar la carpeta `public/ipad` de esta entrega dentro del repositorio `Francoldk/crm-whatsapp-simple`. Se agrega una carpeta; no se debe reemplazar toda la carpeta `public`.

Confirmar los cuatro archivos nuevos en la rama que despliega Cloudflare. El proyecto actual es Next.js/OpenNext y sirve estos archivos estáticos sin nuevas dependencias, variables ni claves.

Después de un despliegue exitoso, la dirección prevista es:

`https://crm.dechinaalmundo.com.ar/ipad/index.html`

La publicación en esa dirección debe verificarse después de subir los archivos. Este paquete no significa que ya esté publicado.

## Usar en el iPad

1. Abrir la dirección anterior en Safari.
2. Ingresar con el usuario y la contraseña habituales del CRM.
3. Tocar Compartir → Agregar a inicio → Agregar.
4. Abrir el ícono «DCAM CRM».

El menú incluye las instrucciones para agregar el ícono y cerrar sesión.

## Funciones

- Consulta de conversaciones y búsqueda por nombre, teléfono o último mensaje.
- Filtro por los estados reales de los contactos.
- Resumen de clientes, cotizados y cerrados dentro de los contactos devueltos por el servidor.
- Historial con los últimos 70 mensajes y botón para consultar los anteriores.
- Respuesta de texto por WhatsApp desde el mismo chat, con botón Enviar, borradores en memoria por conversación y protección contra doble toque.
- Ficha del cliente, producto, peso, volumen, FOB, cotización y notas registradas.
- Enlaces para abrir imágenes, documentos y otros adjuntos autorizados por el CRM.
- Reproductor MP3 para iPad: las notas Ogg/Opus se convierten en el servidor al reproducirlas y se conserva el original. Requiere publicar el conversor en el repositorio de WhatsApp; ver `AUDIO-IPAD.md`.
- Actualización cada 30 segundos cuando está abierta y visible, y botón de actualización manual.

Permite consultar el CRM y responder mensajes de texto. Los cambios en clientes, cotizaciones, SOL y usuarios se realizan desde el CRM completo.

El texto se borra del cuadro después de que el servidor confirma el envío. Si falla, permanece en el cuadro. Si la conexión se corta sin confirmación, se indica revisar el historial antes de reenviar. No se reintentan envíos automáticamente. El webhook existente guarda el mensaje una sola vez; la vista iPad no inserta otra copia.

## Integración

Las peticiones se realizan al mismo dominio mediante XMLHttpRequest, conservando las cookies de NextAuth:

- GET `/api/auth/session`
- GET `/api/auth/csrf`
- POST `/api/auth/callback/credentials`
- POST `/api/auth/signout`
- GET `/api/conversations`
- POST `/api/send-message` (JSON, con teléfono y JID exactos del cliente)
- GET `/api/media-file?id=...`

Los campos coinciden con el código actual del repositorio, revisado en el commit `856dc64`. No se incluyen contraseñas, claves de Supabase ni una copia de la base de datos. No se persisten conversaciones ni contraseñas en localStorage.

## Verificación y límites

Se verificaron la sintaxis ECMAScript 5, los flujos de acceso y cierre con respuestas simuladas de NextAuth, la búsqueda, los filtros, la lectura del historial, la conservación de valores cero, el tratamiento de textos como texto seguro, el vencimiento de sesión y la pausa de actualizaciones en segundo plano. También se verificaron el destino y formato JSON del envío, los borradores separados por chat, el bloqueo del doble toque, la conservación del texto ante errores y la ausencia de reintentos automáticos. Los envíos de prueba usaron un servidor simulado; no se mandaron mensajes a clientes reales.

Se revisó la interfaz en navegador con datos ficticios, incluida una vista de 768 × 1024. Falta la prueba física en el iPad 2 y la prueba de acceso contra el servidor real. Durante esta preparación, la URL principal devolvió «Site Unavailable» desde este entorno.

La lista y el historial usan la API existente: el servidor actualmente envía los contactos con sus mensajes en una sola respuesta. La interfaz limita los elementos visibles para reducir el trabajo del iPad, pero una base de datos muy grande también puede requerir paginación del servidor.

Requiere Internet y una conexión HTTPS aceptada por el iPad. No necesita una instalación de App Store, jailbreak ni un archivo IPA. No ofrece uso sin conexión o notificaciones en segundo plano.

## Revertir

Eliminar únicamente `public/ipad` y volver a desplegar. La app no realiza migraciones en la base de datos.
