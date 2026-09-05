let indice = [];
let materia = null;
let preguntas = [];
let respuestas = [];
let actual = 0;

const clave = (slug) => `cuestionario:${slug}`;

function leerProgreso(slug) {
    try {
        return JSON.parse(localStorage.getItem(clave(slug)));
    } catch {
        return null;
    }
}

function guardarProgreso() {
    try {
        localStorage.setItem(clave(materia.slug), JSON.stringify({
            ids: preguntas.map(p => p.id),
            respuestas,
            actual
        }));
    } catch {
        // Modo privado o almacenamiento lleno: el cuestionario sigue funcionando sin persistir
    }
}

function borrarProgreso(slug) {
    try {
        localStorage.removeItem(clave(slug));
    } catch {}
}

function mostrarPantalla(id) {
    for (const p of document.querySelectorAll('.pantalla')) {
        p.hidden = p.id !== id;
    }
}

// --- Selección de materia ---

async function cargarIndice() {
    try {
        const respuesta = await fetch('data/index.json');
        indice = await respuesta.json();
    } catch (error) {
        console.error('Error al cargar el índice:', error);
        document.getElementById('materias').innerHTML =
            '<p class="aviso-error">No se pudo cargar la lista de materias. ' +
            'Recuerda que la página debe servirse por HTTP, no abrirse como archivo local.</p>';
        return;
    }
    pintarMaterias();
}

function pintarMaterias() {
    const contenedor = document.getElementById('materias');
    contenedor.innerHTML = '';

    for (const item of indice) {
        if (item.oculta) continue;
        const progreso = leerProgreso(item.slug);
        const hechas = progreso ? progreso.respuestas.filter(r => r !== null).length : 0;

        const tarjeta = document.createElement('button');
        tarjeta.className = 'materia';
        tarjeta.onclick = () => elegirMateria(item);

        const titulo = document.createElement('span');
        titulo.className = 'materia-titulo';
        titulo.textContent = item.titulo;

        const detalle = document.createElement('span');
        detalle.className = 'materia-detalle';
        detalle.textContent = hechas
            ? `${hechas} de ${progreso.ids.length} respondidas`
            : `${item.totalPreguntas} preguntas`;

        tarjeta.append(titulo, detalle);
        if (hechas) tarjeta.classList.add('con-progreso');
        contenedor.appendChild(tarjeta);
    }
}

async function elegirMateria(item) {
    const progreso = leerProgreso(item.slug);
    const hechas = progreso ? progreso.respuestas.filter(r => r !== null).length : 0;
    if (!hechas) return empezarMateria(item);

    const dialogo = document.getElementById('dialogoProgreso');
    document.getElementById('dialogoTexto').textContent =
        `Ya llevas ${hechas} de ${progreso.ids.length} preguntas respondidas en ${item.titulo}.`;
    dialogo.returnValue = '';
    dialogo.showModal();

    // Con method="dialog" el botón pulsado queda en returnValue; Esc lo deja vacío
    const decision = await new Promise(resolve => {
        dialogo.addEventListener('close', () => resolve(dialogo.returnValue), { once: true });
    });
    if (decision !== 'continuar' && decision !== 'reiniciar') return;

    if (decision === 'reiniciar') borrarProgreso(item.slug);
    return empezarMateria(item, decision === 'reiniciar');
}

function barajar(lista) {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}

async function empezarMateria(item, forzarReinicio = false) {
    let todas;
    try {
        const respuesta = await fetch(`data/${item.slug}.json`);
        todas = (await respuesta.json()).preguntas;
    } catch (error) {
        console.error('Error al cargar la materia:', error);
        alert('No se pudo cargar esa materia.');
        return;
    }

    materia = item;
    const progreso = forzarReinicio ? null : leerProgreso(item.slug);

    if (progreso) {
        // Reconstruye la sesión guardada respetando el orden en que se generó
        const porId = new Map(todas.map(p => [p.id, p]));
        preguntas = progreso.ids.map(id => porId.get(id)).filter(Boolean);
        respuestas = progreso.respuestas;
        actual = Math.min(progreso.actual, preguntas.length - 1);
    } else {
        const aleatorio = document.getElementById('ajusteAleatorio').checked;
        const limite = Number(document.getElementById('ajusteLimite').value);
        preguntas = aleatorio ? barajar(todas) : [...todas];
        if (limite > 0) preguntas = preguntas.slice(0, limite);
        respuestas = new Array(preguntas.length).fill(null);
        actual = 0;
    }

    document.getElementById('tituloCabecera').textContent = materia.titulo;
    document.getElementById('subtituloCabecera').textContent = 'Prueba de conocimiento médico';
    document.getElementById('totalQuestions').textContent = preguntas.length;
    guardarProgreso();
    mostrarPantalla('pantallaQuiz');
    mostrarPregunta();
}

function volverASeleccion() {
    materia = null;
    document.getElementById('tituloCabecera').textContent = 'Cuestionarios';
    document.getElementById('subtituloCabecera').textContent = 'Elige una materia para empezar';
    pintarMaterias();
    mostrarPantalla('pantallaSeleccion');
}

function reiniciarMateria() {
    const item = materia;
    borrarProgreso(item.slug);
    return empezarMateria(item, true);
}

// --- Cuestionario ---

function mostrarPregunta() {
    const pregunta = preguntas[actual];
    const elegida = respuestas[actual];
    const respondida = elegida !== null;

    document.getElementById('currentQuestion').textContent = actual + 1;
    document.getElementById('questionText').textContent = pregunta.enunciado;

    mostrarImagen(pregunta);

    const contenedor = document.getElementById('optionsContainer');
    contenedor.innerHTML = '';

    pregunta.opciones.forEach((opcion, indiceOpcion) => {
        const boton = document.createElement('button');
        boton.className = 'option';
        boton.textContent = opcion;
        boton.onclick = () => seleccionarOpcion(indiceOpcion);

        if (respondida) {
            boton.disabled = true;
            boton.classList.add('disabled');
            if (indiceOpcion === pregunta.respuestaCorrecta - 1) {
                boton.classList.add('correct');
            } else if (indiceOpcion === elegida) {
                boton.classList.add('incorrect');
            }
        }
        contenedor.appendChild(boton);
    });

    const feedback = document.getElementById('feedback');
    if (respondida) {
        const acierto = elegida === pregunta.respuestaCorrecta - 1;
        feedback.className = 'feedback show ' + (acierto ? 'correct' : 'incorrect');
        feedback.innerHTML = '<strong>' + (acierto ? '✓ Correcto' : '✗ Incorrecto') +
            '</strong><br><br>' + pregunta.explicacion.replace(/\n/g, '<br>');
    } else {
        feedback.className = 'feedback';
    }

    document.getElementById('prevBtn').disabled = actual === 0;
    const ultima = actual === preguntas.length - 1;
    document.getElementById('nextBtn').textContent =
        ultima && respondida ? 'Ver resultados' : 'Siguiente →';

    document.getElementById('progressFill').style.width =
        ((actual + 1) / preguntas.length) * 100 + '%';
}

function mostrarImagen(pregunta) {
    const figura = document.getElementById('imagenPregunta');
    const img = document.getElementById('imagenPreguntaImg');
    const aviso = document.getElementById('imagenPreguntaAviso');

    if (!pregunta.imagen) {
        figura.hidden = true;
        return;
    }

    // La imagen puede no existir todavía: el archivo se añade a mano en img/
    figura.hidden = false;
    aviso.hidden = true;
    img.hidden = false;
    img.onerror = () => {
        img.hidden = true;
        aviso.hidden = false;
    };
    img.src = 'img/' + pregunta.imagen;
}

function seleccionarOpcion(indiceOpcion) {
    if (respuestas[actual] !== null) return;
    respuestas[actual] = indiceOpcion;
    guardarProgreso();
    mostrarPregunta();
}

function nextQuestion() {
    if (actual < preguntas.length - 1) {
        actual++;
        guardarProgreso();
        mostrarPregunta();
    } else if (respuestas.every(r => r !== null)) {
        mostrarResultados();
    }
}

function previousQuestion() {
    if (actual > 0) {
        actual--;
        guardarProgreso();
        mostrarPregunta();
    }
}

function mostrarResultados() {
    const aciertos = respuestas.filter(
        (r, i) => r === preguntas[i].respuestaCorrecta - 1
    ).length;
    const porcentaje = Math.round((aciertos / preguntas.length) * 100);

    document.getElementById('finalScore').textContent =
        `${aciertos} de ${preguntas.length} preguntas correctas (${porcentaje}%)`;
    mostrarPantalla('pantallaResultado');
}

window.addEventListener('DOMContentLoaded', cargarIndice);
