#!/usr/bin/env python3
"""Une los chunks extraidos por materia, valida y genera los JSON que consume la app."""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHUNKS = ROOT / "data" / "chunks"
OUT = ROOT / "data"

TITULOS: dict[str, str] = {
    "anastesiologia": "Anestesiología",
    "anatomia": "Anatomía",
    "anatomia-patologica": "Anatomía Patológica",
    "bioetica": "Bioética",
    "bioquimica": "Bioquímica",
    "cardiologia": "Cardiología",
    "cirugia": "Cirugía",
    "dermatologia": "Dermatología",
    "digestivo": "Digestivo",
    "embriologia": "Embriología",
    "endocrino": "Endocrinología",
    "epidemio": "Epidemiología",
    "farmacologia": "Farmacología",
    "fisiologia": "Fisiología",
    "genetica": "Genética",
    "ginecologia": "Ginecología",
    "hematologia": "Hematología",
    "histologia": "Histología",
    "imagen": "Diagnóstico por Imagen",
    "infecto": "Infectología",
    "inmuno": "Inmunología",
    "nefro": "Nefrología",
    "neumologia": "Neumología",
    "neurologia": "Neurología",
    "oftalmo": "Oftalmología",
    "oncologia": "Oncología",
    "otorrino": "Otorrinolaringología",
    "pediatria": "Pediatría",
    "psiquiatria": "Psiquiatría",
    "reumatologia": "Reumatología",
    "traumato": "Traumatología",
    "urologia": "Urología",
}


# Materias extraidas pero que no se ofrecen todavia en la app. IMAGEN esta aqui
# porque sus 62 preguntas dependen de imagenes que aun no existen en img/.
# Para volver a mostrarla, basta con quitarla de este conjunto.
OCULTAS: set[str] = {"imagen"}


def validar(pregunta: dict, materia: str) -> list[str]:
    errores: list[str] = []
    pagina = pregunta.get("paginaPdf", "?")
    donde = f"{materia} p{pagina}"

    if not str(pregunta.get("enunciado", "")).strip():
        errores.append(f"{donde}: enunciado vacío")

    opciones = pregunta.get("opciones")
    if not isinstance(opciones, list) or len(opciones) < 2:
        errores.append(f"{donde}: opciones inválidas ({opciones!r})")
        return errores
    if any(not str(o).strip() for o in opciones):
        errores.append(f"{donde}: alguna opción vacía")

    correcta = pregunta.get("respuestaCorrecta")
    if not isinstance(correcta, int) or not 1 <= correcta <= len(opciones):
        errores.append(f"{donde}: respuestaCorrecta {correcta!r} fuera de rango 1-{len(opciones)}")

    # La explicación vacía NO es error: hay preguntas del original con "Comentario:"
    # sin texto. Se puede responder igual, así que solo se reporta.

    return errores


CITA_OPCION = re.compile(
    r"(?:opci[oó]n|respuesta)\s+(\d+)\s*(?:es\s+la\s+)?(?:correcta|es\s+correcta)"
    r"|respuesta\s+correcta\s*[:.]?\s*(?:es\s+la\s+|por\s+tanto\s+es\s+la\s+)?(\d+)",
    re.IGNORECASE,
)


# El banco marca la negación en mayúsculas: "señale la INCORRECTA", "es FALSO que",
# "NO forma parte", "todas EXCEPTO". Ahí el comentario llama "correctas" a las opciones
# que NO son la clave, así que comparar números induce a error.
NEGATIVA = re.compile(r"\b(INCORRECT[AO]|FALS[AO]|EXCEPTO|NO|CONTRAINDICADO)\b")


def revisar_clave(pregunta: dict) -> str | None:
    """El banco original era de 5 opciones y se adaptó a 4: la clave se renumeró
    pero algunos comentarios conservan la numeración vieja. Solo se reporta, ya
    que la clave estructurada ('Resp. Correcta: N') es la fiable."""
    citados = {
        int(g)
        for m in CITA_OPCION.finditer(pregunta["explicacion"])
        for g in m.groups()
        if g
    }
    if not citados:
        return None

    n = len(pregunta["opciones"])
    fuera = sorted(x for x in citados if x > n)
    if fuera:
        return f"la explicación cita la opción {fuera[0]} y solo hay {n}"

    # Un comentario que repasa opción por opción cita varios números y no contradice
    # nada; la contradicción real es la que señala una sola opción distinta a la clave.
    # Ambos filtros son necesarios: en una pregunta negativa el comentario puede citar
    # un único número y aun así no estar señalando la clave.
    if NEGATIVA.search(pregunta["enunciado"]):
        return None
    if len(citados) == 1 and pregunta["respuestaCorrecta"] not in citados:
        return (
            f"respuestaCorrecta={pregunta['respuestaCorrecta']} "
            f"pero la explicación señala la {citados.pop()}"
        )
    return None


def cargar_chunks() -> tuple[dict[str, list[dict]], dict[str, list[str]]]:
    """Agrupa preguntas y anomalías por materia respetando el orden de página. Los
    chunks con prefijo _ son comparaciones A/B y no entran al resultado."""
    por_materia: dict[str, list[dict]] = {}
    anomalias: dict[str, list[str]] = {}
    for ruta in sorted(CHUNKS.glob("*.json")):
        if ruta.name.startswith("_"):
            continue
        datos = json.loads(ruta.read_text(encoding="utf-8"))
        por_materia.setdefault(datos["materia"], []).extend(datos["preguntas"])
        # Los chunks extraidos antes de introducir el campo no lo traen
        anomalias.setdefault(datos["materia"], []).extend(datos.get("anomalias", []))
    for preguntas in por_materia.values():
        preguntas.sort(key=lambda p: p["paginaPdf"])
    return por_materia, anomalias


def main() -> int:
    por_materia, anomalias = cargar_chunks()
    if not por_materia:
        print("No hay chunks en data/chunks/", file=sys.stderr)
        return 1

    errores: list[str] = []
    indice: list[dict] = []
    pendientes: list[str] = []
    claves: list[str] = []
    sin_explicacion: list[str] = []

    for materia, preguntas in sorted(por_materia.items()):
        titulo = TITULOS.get(materia, materia.replace("-", " ").title())
        con_imagen = 0

        for idx, pregunta in enumerate(preguntas, start=1):
            errores.extend(validar(pregunta, materia))
            pregunta["id"] = idx
            aviso = revisar_clave(pregunta)
            if aviso:
                claves.append(f"- {titulo} #{idx} (p{pregunta['paginaPdf']}): {aviso}")
            if not pregunta["explicacion"].strip():
                sin_explicacion.append(f"- {titulo} #{idx} (p{pregunta['paginaPdf']})")
            if pregunta.get("imagen"):
                con_imagen += 1
                inicio = pregunta["enunciado"][:70].replace("\n", " ")
                pendientes.append(
                    f"- [ ] `img/{pregunta['imagen']}` — {titulo} p{pregunta['paginaPdf']} — {inicio}..."
                )

        salida = {
            "titulo": f"Cuestionario de {titulo}",
            "especialidad": titulo,
            "totalPreguntas": len(preguntas),
            "preguntas": preguntas,
        }
        (OUT / f"{materia}.json").write_text(
            json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        entrada = {
            "slug": materia,
            "titulo": titulo,
            "totalPreguntas": len(preguntas),
            "conImagen": con_imagen,
        }
        if materia in OCULTAS:
            entrada["oculta"] = True
        indice.append(entrada)
        print(f"{materia}: {len(preguntas)} preguntas, {con_imagen} con imagen")

    (OUT / "index.json").write_text(
        json.dumps(indice, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    cabecera = "# Imágenes pendientes\n\nCapturar cada imagen del origen y guardarla con la ruta indicada.\n\n"
    (OUT / "imagenes-pendientes.md").write_text(
        cabecera + ("\n".join(pendientes) if pendientes else "_Ninguna._") + "\n",
        encoding="utf-8",
    )

    cabecera_claves = (
        "# Claves a revisar\n\nLa explicación cita una numeración que no cuadra con las "
        "opciones mostradas. La clave estructurada es la fiable; esto afecta solo al texto "
        "del comentario.\n\n"
    )
    (OUT / "claves-revisar.md").write_text(
        cabecera_claves + ("\n".join(claves) if claves else "_Ninguna._") + "\n",
        encoding="utf-8",
    )

    bloques = [
        f"## {TITULOS.get(m, m)}\n\n" + "\n".join(f"- {a}" for a in sorted(avisos))
        for m, avisos in sorted(anomalias.items())
        if avisos
    ]
    if sin_explicacion:
        bloques.append(
            "## Preguntas sin explicación\n\nEl original trae la etiqueta "
            "\"Comentario:\" sin texto debajo. Se pueden responder, pero no dan "
            "retroalimentación.\n\n" + "\n".join(sin_explicacion)
        )
    n_anomalias = sum(len(a) for a in anomalias.values())
    (OUT / "anomalias.md").write_text(
        "# Anomalías del material original\n\nDetectadas al leer las páginas. No son "
        "erratas ortográficas (esas se transcriben y ya está), sino cosas que pueden "
        "llevar a estudiar algo incorrecto.\n\n"
        + ("\n\n".join(bloques) if bloques else "_Ninguna._")
        + "\n",
        encoding="utf-8",
    )

    total = sum(i["totalPreguntas"] for i in indice)
    print(f"\nTotal: {total} preguntas en {len(indice)} materias, {len(pendientes)} imágenes pendientes")
    print(f"Claves a revisar: {len(claves)} ({len(claves) / total:.1%})")
    print(f"Anomalías reportadas por los extractores: {n_anomalias}")
    print(f"Preguntas sin explicación en el original: {len(sin_explicacion)}")

    if errores:
        print(f"\n{len(errores)} problemas de validación:", file=sys.stderr)
        for e in errores:
            print(f"  {e}", file=sys.stderr)
        return 1
    return 0


def self_check() -> None:
    ok = {
        "enunciado": "¿Cuál?",
        "opciones": ["a", "b", "c", "d"],
        "respuestaCorrecta": 4,
        "explicacion": "porque sí",
        "paginaPdf": 3,
    }
    assert validar(ok, "x") == []
    assert validar({**ok, "respuestaCorrecta": 5}, "x")
    assert validar({**ok, "respuestaCorrecta": 0}, "x")
    assert validar({**ok, "opciones": ["a"]}, "x")
    assert validar({**ok, "enunciado": "  "}, "x")
    # El original trae preguntas con "Comentario:" vacío: se reportan, no bloquean
    assert validar({**ok, "explicacion": ""}, "x") == []
    # 3 opciones con respuesta 3 es válido: el numero de opciones no siempre es 4
    assert validar({**ok, "opciones": ["a", "b", "c"], "respuestaCorrecta": 3}, "x") == []

    assert revisar_clave({**ok, "explicacion": "sin numeros aqui"}) is None
    assert revisar_clave({**ok, "explicacion": "la opción 4 es correcta"}) is None
    assert revisar_clave({**ok, "explicacion": "La respuesta correcta por tanto es la 5."})
    assert revisar_clave({**ok, "explicacion": "la opción 2 correcta"})
    # La forma con dos puntos es la mas comun del banco y debe detectarse
    assert revisar_clave({**ok, "respuestaCorrecta": 1, "explicacion": "Respuesta correcta: 2. Los bronquiolos..."})
    assert revisar_clave({**ok, "explicacion": "Respuesta correcta: 4. El estómago..."}) is None
    # Comentario que repasa opcion por opcion: cita varios numeros, no contradice nada
    assert revisar_clave({
        **ok,
        "respuestaCorrecta": 2,
        "explicacion": "respuesta 1 correcta. respuesta 3 correcta. respuesta 4 correcta.",
    }) is None
    # Una opcion inexistente se reporta aunque se citen varias
    assert revisar_clave({**ok, "explicacion": "respuesta 1 correcta. La respuesta correcta es la 5."})
    # Pregunta negativa citando un solo numero: "correcta" significa "afirmacion cierta"
    assert revisar_clave({
        **ok,
        "enunciado": "Respecto a los siguientes conceptos, ¿cuál es FALSO?",
        "respuestaCorrecta": 4,
        "explicacion": "la respuesta 1 es correcta ya que...",
    }) is None
    # Pero una opcion inexistente se reporta tambien en preguntas negativas
    assert revisar_clave({
        **ok,
        "enunciado": "señale la respuesta INCORRECTA:",
        "explicacion": "La respuesta correcta por tanto es la 5.",
    })
    print("self-check OK")


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        self_check()
    else:
        sys.exit(main())
