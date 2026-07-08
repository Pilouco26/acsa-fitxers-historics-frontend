# ACSA — Guía del flujo principal

**ACSA** (Fitxers històrics) es una aplicación web para digitalizar, clasificar y archivar documentos históricos en PDF. El menú lateral muestra cuatro pasos en orden: **Escáner → Clasificador → Revisión → Documents**.

---

## Resumen del flujo

```
Escanear PDF  →  Subir al servidor  →  Clasificar con IA  →  Revisar y aprobar  →  Archivo final
   (Escáner)        (_PENDENTS)         (Clasificador)         (Revisión)          (Documents)
```

Cada documento pasa por estos estados hasta quedar archivado con un nombre y carpeta definitivos.

---

## 1. Escáner

**Objetivo:** introducir PDFs nuevos en la bandeja de entrada del sistema.

1. Escanee el documento con **Epson Scan** o la aplicación **Escanear** de Windows.
2. Guarde el resultado como **PDF** en su ordenador.
3. En la web, arrastre el PDF a la zona de subida o haga clic para seleccionarlo (máx. 50 MB por archivo; se permiten varios a la vez).

Los archivos se envían al servidor, a la carpeta de entrada **`_PENDENTS`**. La tabla inferior confirma los PDF subidos con su nombre y ruta.

---

## 2. Clasificador

**Objetivo:** analizar automáticamente los PDF nuevos y proponer nombre, empresa, tipo y resumen.

1. Pulse **Processar documents**.
2. El sistema ejecuta **OCR** y **clasificación con IA** (Gemini). El proceso puede tardar varios minutos.
3. Siga el progreso en pantalla. Puede cancelar el trabajo si es necesario.
4. Al terminar, los documentos se **asignan al archivo** en modo revisión (aún no son definitivos).

Mientras el trabajo está activo, verá un indicador de progreso también en otras pestañas del menú.

---

## 3. Revisión

**Objetivo:** validar manualmente cada documento clasificado antes de archivarlo.

1. Abra la lista de **documentos pendientes de revisión**.
2. Haga clic en una fila para ver la **vista previa del PDF**, el **nombre propuesto** y el **resumen**.
3. Corrija el nombre o el resumen si hace falta.
4. Pulse **Aprovar** para confirmar el documento, o **Eliminar** si no debe conservarse.

Las filas en **rojo** pueden indicar **documentos repetidos**; conviene comprobarlos antes de aprobar. Tras aprobar, el documento sale de esta lista.

---

## 4. Documents

**Objetivo:** consultar el **archivo definitivo** de documentos ya aprobados.

- Busque por texto, nombre o carpeta de empresa.
- Ordene las columnas y navegue por páginas.
- Abra un documento para ver su PDF y, si es necesario, ajustar el nombre.

Aquí solo aparecen documentos con estado **aprobado**; es el catálogo final del archivo histórico.

---

## Consejos rápidos

| Paso | Qué hacer si… |
|------|----------------|
| Escáner | Solo se aceptan archivos **PDF**. |
| Clasificador | No hay PDF nuevos en `_PENDENTS` → vuelva al paso 1. |
| Revisión | La lista está vacía → espere a que termine el Clasificador. |
| Documents | No ve un documento → debe estar **aprobado** en Revisión. |

**Orden habitual:** escanear y subir → clasificar → revisar uno a uno → consultar en Documents.
