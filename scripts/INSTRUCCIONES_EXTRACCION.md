# Instrucciones de extracción

Extraes preguntas de examen médico desde imágenes de páginas de un PDF rasterizado
(sin capa de texto). Debes LEER las imágenes con la herramienta Read, una por una.
Tu tarea concreta (materia, rango de páginas, rutas) viene en el mensaje que te asignó.

## Estructura de cada pregunta en el documento

```
<enunciado, en negrita>
Imagen                          <- enlace azul subrayado, puede estar o no
    1. opción
    2. opción
    ...
Resp. Correcta: N
Comentario:
<explicación, uno o varios párrafos>
------------------------------o------------------------------
```

El separador con la "o" en el centro cierra cada pregunta.

## Reglas

1. Lee TODAS las páginas de tu rango. No extrapoles ni adivines el contenido de una
   página que no leíste.
2. Emite SOLO las preguntas cuyo ENUNCIADO EMPIEZA dentro de tu rango. Si la primera
   página de tu rango arranca a media pregunta cuyo enunciado venía de antes, esa
   pregunta NO es tuya: ignórala por completo. Si una pregunta arranca en tu última
   página y sigue más allá, lee la página de contexto posterior para completarla y sí
   la emites, con `paginaPdf` = la página donde EMPIEZA el enunciado.
3. Transcribe TEXTUALMENTE. No corrijas erratas del original, no resumas, no
   reformules, no traduzcas. Respeta tildes, ñ, comillas y mayúsculas tal como
   aparecen. Si el original dice "compromia" o "intraperícárdica", lo escribes así,
   con la errata. **Esta regla es la más importante de todas**: es material de estudio
   médico y una "corrección" tuya es una corrupción del dato. En especial NO añadas ni
   quites tildes respecto a lo que ves en la imagen.
4. Las primeras páginas suelen ser portada, aviso legal y logo repetido; también puede
   haber índices. Todo lo que no sea un bloque de pregunta se ignora, sin emitir nada.
5. `respuestaCorrecta` es el entero de "Resp. Correcta: N", tal cual (1-indexado). Si
   el comentario contradice ese número, respeta SIEMPRE el de "Resp. Correcta:" y
   menciónalo en tu reporte.
6. El número de opciones NO siempre es 4. Emite las que haya.
7. Si la pregunta depende de una imagen (enlace "Imagen" en azul subrayado, o el texto
   dice "la imagen vinculada", "en relación a la imagen", "la imagen adjunta", "la
   imagen que se muestra" o similar), añade el campo `imagen` con el valor
   `<slug>/pNNN-K.png`, donde NNN es el número de página con **3 dígitos** (página 7 ->
   p007) y K es el ordinal de esa pregunta con imagen dentro de esa página, empezando
   en 1. NNN es la página donde EMPIEZA EL ENUNCIADO, aunque el enlace caiga en la
   siguiente. Si no depende de imagen, OMITE el campo por completo.
8. La explicación completa va en `explicacion`, uniendo sus párrafos con `\n\n`.
9. No añadas campo `id`: se asigna al unir los chunks.
10. Anota en el campo `anomalias` (lista de textos, a nivel raíz del JSON) todo lo que
    un lector deba saber para no estudiar algo incorrecto: comentarios que contradicen
    la clave, explicaciones internamente incoherentes, datos numéricos imposibles,
    caracteres que no se rasterizaron (una µ ausente en una concentración cambia la
    dosis por un millón), tablas que tuviste que linealizar. Cada entrada empieza por
    la página: `"p42: Resp. Correcta 1 pero el comentario abre con 'Respuesta correcta:
    2'"`. Las erratas ortográficas corrientes NO van aquí: se transcriben y ya está,
    serían cientos. Si no hay nada que anotar, pon una lista vacía.

## Salida

Escribe en la ruta que te indicaron un JSON con esta forma exacta:

```json
{
  "materia": "<slug>",
  "paginaInicio": 14,
  "paginaFin": 25,
  "anomalias": [
    "p18: el comentario repite la etiqueta 'Comentario:' dos veces",
    "p25: Resp. Correcta 4 pero el comentario cierra con 'la respuesta correcta es la 5' y solo hay 4 opciones"
  ],
  "preguntas": [
    {
      "paginaPdf": 15,
      "enunciado": "...",
      "opciones": ["...", "..."],
      "respuestaCorrecta": 2,
      "explicacion": "...",
      "imagen": "<slug>/p015-1.png"
    }
  ]
}
```

## Reporte final

Es lo ÚNICO que devuelves. NO pegues el JSON en tu respuesta.

- páginas leídas
- número de preguntas emitidas
- número de preguntas con imagen, y en qué páginas
- qué páginas eran portada/relleno y saltaste
- cómo resolviste los cortes en los bordes de tu rango
- anomalías: opciones distintas de 4, falta "Resp. Correcta", comentario que
  contradice la clave, texto ilegible
