/**
 * Prueba de humo de script.js sobre un DOM simulado.
 * Cubre lo que puede romperse en silencio: el orden aleatorio con limite y la
 * restauracion del progreso guardado, que rehidrata las preguntas por id.
 * Uso: node scripts/test_app.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const RAIZ = path.join(__dirname, '..');

function elemento() {
    const el = {
        className: '', textContent: '', innerHTML: '', id: '',
        hidden: false, disabled: false, checked: false, value: '',
        style: {}, children: [], onclick: null, onerror: null, src: '',
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
        appendChild(c) { el.children.push(c); return c; },
        append(...cs) { el.children.push(...cs); },
        // Lo justo de <dialog> para poder simular la elección del usuario
        returnValue: '', abierto: false, _oyentes: {},
        addEventListener(evt, fn) { (el._oyentes[evt] ||= []).push(fn); },
        showModal() { el.abierto = true; },
        close(v) {
            if (v !== undefined) el.returnValue = v;
            el.abierto = false;
            const fns = el._oyentes.close || [];
            el._oyentes.close = [];
            for (const fn of fns) fn();
        },
    };
    return el;
}

function crearEntorno() {
    const porId = new Map();
    const pantallas = ['pantallaSeleccion', 'pantallaQuiz', 'pantallaResultado'].map(id => {
        const e = elemento();
        e.id = id;
        e.className = 'pantalla';
        return e;
    });
    for (const p of pantallas) porId.set(p.id, p);

    const almacen = new Map();
    const sandbox = {
        console,
        document: {
            getElementById(id) {
                if (!porId.has(id)) { const e = elemento(); e.id = id; porId.set(id, e); }
                return porId.get(id);
            },
            createElement: () => elemento(),
            querySelectorAll: (sel) => (sel === '.pantalla' ? pantallas : []),
        },
        localStorage: {
            getItem: k => (almacen.has(k) ? almacen.get(k) : null),
            setItem: (k, v) => almacen.set(k, String(v)),
            removeItem: k => almacen.delete(k),
        },
        fetch: async (ruta) => {
            const contenido = fs.readFileSync(path.join(RAIZ, ruta), 'utf8');
            return { json: async () => JSON.parse(contenido) };
        },
        alert: () => {},
        window: { addEventListener: () => {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'script.js'), 'utf8'), sandbox);

    // Las variables declaradas con let no se adhieren al objeto global del contexto:
    // hay que leerlas y escribirlas evaluando dentro de el.
    const ev = (expr) => vm.runInContext(expr, sandbox);
    const el = (id) => sandbox.document.getElementById(id);
    const val = (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, sandbox) ?? 'null');
    return { ev, val, el, pantallas, almacen };
}

const visible = (pantallas) => pantallas.find(p => !p.hidden).id;

(async () => {
    const e1 = crearEntorno();

    await e1.ev('cargarIndice()');
    const indice = e1.val('indice');
    assert.ok(indice.length >= 1, 'el índice debe cargar materias');
    const slug = indice[0].slug;

    // La rejilla de materias se pinta tras resolver el fetch: comprueba que llega al DOM
    const rejilla = e1.el('materias');
    const visibles = indice.filter(i => !i.oculta);
    assert.strictEqual(rejilla.children.length, visibles.length, 'una tarjeta por materia visible');
    assert.ok(indice.some(i => i.oculta), 'el índice debe traer alguna materia oculta que probar');
    const titulos = rejilla.children.map(c => c.children[0].textContent);
    for (const oculta of indice.filter(i => i.oculta)) {
        assert.ok(!titulos.includes(oculta.titulo), `${oculta.titulo} no debe pintarse`);
    }
    const primera = rejilla.children[0];
    assert.strictEqual(primera.className, 'materia');
    assert.strictEqual(primera.children[0].textContent, visibles[0].titulo, 'la tarjeta muestra el título');
    assert.strictEqual(primera.children[1].textContent, `${visibles[0].totalPreguntas} preguntas`);
    assert.ok(typeof primera.onclick === 'function', 'la tarjeta debe ser clicable');

    e1.el('ajusteAleatorio').checked = true;
    e1.el('ajusteLimite').value = '10';

    await e1.ev('empezarMateria(indice[0])');
    assert.strictEqual(e1.val('preguntas.length'), 10, 'el límite debe recortar a 10');
    assert.ok(e1.val('respuestas').every(r => r === null), 'arranca sin respuestas');
    assert.strictEqual(visible(e1.pantallas), 'pantallaQuiz');

    const ordenOriginal = e1.val('preguntas.map(p => p.id)');
    assert.strictEqual(new Set(ordenOriginal).size, 10, 'sin preguntas repetidas');

    // La pregunta y sus opciones llegan al DOM
    assert.strictEqual(e1.el('questionText').textContent, e1.val('preguntas[0].enunciado'));
    const opciones = e1.el('optionsContainer');
    assert.strictEqual(opciones.children.length, e1.val('preguntas[0].opciones.length'));
    assert.strictEqual(opciones.children[0].textContent, e1.val('preguntas[0].opciones[0]'));
    assert.strictEqual(e1.el('totalQuestions').textContent, 10);

    const todas = JSON.parse(fs.readFileSync(path.join(RAIZ, `data/${slug}.json`), 'utf8')).preguntas;
    assert.notDeepStrictEqual(ordenOriginal, todas.slice(0, 10).map(p => p.id), 'el orden aleatorio debe alterar la secuencia');

    // Responde las tres primeras: la 1 y la 3 bien, la 2 mal a proposito
    e1.ev('seleccionarOpcion(preguntas[0].respuestaCorrecta - 1)');
    e1.ev('nextQuestion()');
    e1.ev('seleccionarOpcion(preguntas[1].respuestaCorrecta === 1 ? 1 : 0)');
    e1.ev('nextQuestion()');
    e1.ev('seleccionarOpcion(preguntas[2].respuestaCorrecta - 1)');

    const respuestasAntes = e1.val('respuestas');
    const actualAntes = e1.val('actual');
    assert.deepStrictEqual(respuestasAntes.slice(3), new Array(7).fill(null), 'solo tres respondidas');

    // Simula recargar la pagina: entorno nuevo, mismo localStorage
    const guardado = e1.almacen.get(`cuestionario:${slug}`);
    assert.ok(guardado, 'el progreso debe haberse guardado');

    const e2 = crearEntorno();
    e2.almacen.set(`cuestionario:${slug}`, guardado);
    await e2.ev('cargarIndice()');

    // Entrar en una materia con progreso debe preguntar, nunca reanudar en silencio
    const dlg = e2.el('dialogoProgreso');
    let pendiente = e2.ev('elegirMateria(indice[0])');
    assert.ok(dlg.abierto, 'debe abrirse el diálogo de progreso');
    assert.match(e2.el('dialogoTexto').textContent, /3 de 10/, 'el diálogo informa del avance');

    // Esc cierra sin elegir: no debe pasar nada
    dlg.close('');
    await pendiente;
    assert.strictEqual(e2.val('materia'), null, 'cancelar no debe entrar en la materia');
    assert.ok(e2.almacen.get(`cuestionario:${slug}`), 'cancelar no debe borrar el progreso');

    pendiente = e2.ev('elegirMateria(indice[0])');
    dlg.close('continuar');
    await pendiente;

    assert.deepStrictEqual(e2.val('preguntas.map(p => p.id)'), ordenOriginal, 'el orden debe restaurarse igual');
    assert.deepStrictEqual(e2.val('respuestas'), respuestasAntes, 'las respuestas deben restaurarse');
    assert.strictEqual(e2.val('actual'), actualAntes, 'la posición debe restaurarse');
    assert.ok(e2.val('preguntas').every(p => p && p.enunciado), 'las preguntas se rehidratan completas');

    // Completa el resto acertando: 9 de 10, porque la segunda se fallo adrede
    e2.ev(`
        while (respuestas.some(r => r === null)) {
            actual = respuestas.findIndex(r => r === null);
            seleccionarOpcion(preguntas[actual].respuestaCorrecta - 1);
        }
        mostrarResultados();
    `);
    const marcador = e2.el('finalScore').textContent;
    assert.strictEqual(marcador, '9 de 10 preguntas correctas (90%)', `marcador inesperado: ${marcador}`);
    assert.strictEqual(visible(e2.pantallas), 'pantallaResultado');

    // Reiniciar limpia el progreso guardado
    await e2.ev('reiniciarMateria()');
    assert.ok(e2.val('respuestas').every(r => r === null), 'reiniciar deja las respuestas vacías');
    assert.strictEqual(visible(e2.pantallas), 'pantallaQuiz');

    // "Empezar de nuevo" desde el diálogo descarta el progreso anterior
    const e3 = crearEntorno();
    e3.almacen.set(`cuestionario:${slug}`, guardado);
    await e3.ev('cargarIndice()');
    const dlg3 = e3.el('dialogoProgreso');
    const p3 = e3.ev('elegirMateria(indice[0])');
    dlg3.close('reiniciar');
    await p3;
    assert.ok(e3.val('respuestas').every(r => r === null), 'empezar de nuevo vacía las respuestas');
    assert.notDeepStrictEqual(e3.val('preguntas.map(p => p.id)'), ordenOriginal, 'debe rebarajar');

    console.log('test_app OK');
})();
