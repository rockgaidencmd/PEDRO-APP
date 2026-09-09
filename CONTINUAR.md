# Cómo continuar la extracción

Guía para retomar el proyecto desde cualquier máquina. Todo lo necesario está
en el repo: PDFs, scripts, chunks y datos.

## Qué es esto

Cuestionario web sobre 32 PDFs de medicina (CTO Editorial / UEES). Los PDFs no
tienen capa de texto — son raster puro impreso desde Chrome (`pdffonts` no
devuelve nada) — así que no hay script que los parsee. La extracción la hacen
subagentes que **leen las páginas como imágenes**.

## Estado

**4.195 preguntas, 31 materias, 1.883 de 2.221 páginas (85%).**

Falta:

| Pendiente | Páginas |
|---|---|
| infecto | 142 |
| cardiología 26-221 | 196 |

Cardiología solo tiene extraídas las páginas 1-25.

## El pipeline

Tres pasos. El segundo es el único que consume tokens.

### 1. Renderizar las páginas a PNG

```
scripts/extract_pages.sh pdfs/INFECTO.pdf
```

Genera `pages/infecto/p-001.png ...` a 144 dpi. Acepta varios PDFs de una vez.
`pages/` está en `.gitignore` a propósito: son cientos de MB regenerables en
segundos. El ancho del cero a la izquierda depende del total de páginas del
documento (`p-01` con menos de 100 páginas, `p-001` con más) — compruébalo con
`ls pages/<slug>/ | head -3` antes de escribir los prompts.

### 2. Lanzar un subagente por chunk

Un agente por cada ~18-20 páginas, **todos en paralelo**. Usar Opus: en una
prueba A/B sobre las mismas 12 páginas, Opus cometió 0 errores con 99k tokens y
Sonnet 3 errores con 124k. Sonnet "corrige" las erratas del original, que es
justo lo que no queremos.

Prompt de cada agente, literal:

```
Lee /ruta/al/repo/scripts/INSTRUCCIONES_EXTRACCION.md y síguelas al pie de la letra.

Tu tarea:
- materia (slug): infecto
- páginas PNG en: /ruta/al/repo/pages/infecto/ (archivos p-001.png .. p-142.png)
- rango a emitir: páginas 1 a 18
- páginas de contexto (leer solo para resolver cortes, nunca emitir desde ellas): p-019.png
- escribe el JSON en: /ruta/al/repo/data/chunks/infecto__001-018.json
```

Las diez reglas viven en `scripts/INSTRUCCIONES_EXTRACCION.md`, no en el prompt:
así cada agente cuesta ~100 tokens de instrucciones en vez de ~700.

**La regla que sostiene todo:** cada agente emite solo las preguntas cuyo
*enunciado empieza* dentro de su rango, y lee una página de contexto a cada lado
para cerrar las que quedan a caballo. Validado en once tandas: sin duplicados ni
huecos en ningún borde.

**La segunda regla que importa:** transcripción literal, erratas incluidas. El
original está lleno de faltas y el trabajo no es arreglarlas. Contrastado contra
la extracción previa que se había hecho con otra IA: 10 de 10 claves coincidían,
y donde el texto difería el original nos daba la razón.

### 3. Unir, validar y publicar

```
python3 scripts/merge.py
```

Lee `data/chunks/*.json` y genera `data/<materia>.json`, `data/index.json` y tres
informes: `anomalias.md`, `claves-revisar.md`, `imagenes-pendientes.md`.
Es idempotente: se puede correr las veces que haga falta.

**Cuidado:** `merge.py` reconstruye todo desde `data/chunks/`. Si esa carpeta
está vacía, deja `index.json` sin materias y la app en blanco. Por eso los
chunks están versionados — no los borres.

Los archivos que empiezan por `_` se ignoran (`_ab_opus.json` es el resto de la
prueba Opus contra Sonnet).

Comprobaciones antes de dar nada por bueno:

```
python3 scripts/merge.py --self-check && node scripts/test_app.js
```

La primera valida las reglas de fusión; la segunda monta un DOM simulado y prueba
la app entera: carga del índice, orden aleatorio con límite, guardado y
restauración del progreso, marcador final.

## Rangos ya calculados para lo que falta

**infecto** (142 páginas, 8 chunks):
1-18, 19-36, 37-54, 55-72, 73-90, 91-108, 109-126, 127-142

**cardiología 26-221** (196 páginas, 10 chunks):
26-45, 46-65, 66-85, 86-105, 106-125, 126-145, 146-165, 166-185, 186-205, 206-221

Cardiología ya tiene un chunk previo (`cardiologia__001-025.json`); el agente de
26-45 debe leer p-025 como contexto y no emitir desde ella.

Una tanda de 8 chunks tarda unos 13 minutos de punta a punta y consume bastante
plan. Conviene hacerlas de dos materias como mucho.

## Cómo va la calidad

- **35 claves a revisar** de 4.195 preguntas (0,8%), en `data/claves-revisar.md`.
  Casi todas son el mismo defecto del original: el banco tenía 5 opciones y se
  adaptó a 4 sin renumerar los comentarios. La clave estructurada
  (`respuestaCorrecta`) es la fiable; lo que falla es el texto del comentario.
- **480 anomalías** en `data/anomalias.md`, reportadas por los propios agentes.
  Las que más pesan son unidades imposibles por rasterización: la µ perdida en
  concentraciones, exponentes caídos, guiones de rango que desaparecen
  ("escayola durante 23 meses" era 2-3 meses). Nefro, farmacología y digestivo
  son las materias más afectadas.
- **48 preguntas sin explicación** en el original: unas con `Comentario:` vacío,
  otras que dicen "Comentada en vídeo".
- **65 imágenes pendientes**, 62 de ellas en la materia IMAGEN, que está oculta
  en la app (`OCULTAS` en `merge.py`). Su JSON sí se publica: si algún día
  aparecen las capturas, el trabajo no se pierde.
- **Duplicados del banco original.** No son error de extracción: el mismo
  enunciado aparece dos veces en varias materias. Bioética es el caso grave —
  repite preguntas con las *opciones cambiadas* y la *misma clave numérica*, así
  que la respuesta correcta cambia según la versión (p24 y p34, p22 y p28). Un
  detector de duplicados tendría que comparar por similitud, no por igualdad, y
  marcar aparte las que se contradicen.

## Decisiones abiertas

- **Visibilidad del repo.** El material es de un curso de pago para alumnos
  inscritos y el repo es público, con los PDFs originales dentro. Se cierra con
  `gh repo edit rockgaidencmd/PEDRO-APP --visibility private` (hace falta admin).
- **Conseguir los PDFs con texto.** El material está en una web para alumnos; un
  Ctrl+P desde ahí podría dar un PDF con capa de texto. Eso permitiría extraer
  con script, sin tokens, y arreglaría de raíz las unidades rotas.
- **Detector de duplicados.**
