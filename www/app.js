// ============================================================
//  Carrera de Mente · app (Capacitor / Vanilla JS, 100% offline)
//
//  Flujo: menú → pregunta → (suspenso) → resultado → vuelve solo al menú
// ============================================================
import { leerPreguntas, decodificar, normalizar } from './csv.js';
import { sortear } from './sorteo.js';
import * as sonidos from './sonidos.js';

// ---------- ⚙️ AJUSTES (tocá estos números a gusto) ----------
const SEGUNDOS_SUSPENSO = 3;   // demora antes de revelar si fue correcto o error
const SEGUNDOS_VUELTA = 12;    // tiempo que se ve el resultado antes de volver al menú (10–15)
const ARCHIVO_INCLUIDO = 'preguntas.csv';   // CSV que viaja dentro del APK (www/preguntas.csv)
const CLAVE_GUARDADO = 'carrera-de-mente.csv';
// -------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const MAYUS = (s) => s.toLocaleUpperCase('es');

const el = {
  menu: $('menu'), pregunta: $('pregunta'),
  categorias: $('categorias'), btnEstrella: $('btn-estrella'),
  origen: $('origen'), btnImportar: $('btn-importar'), btnOriginal: $('btn-original'), archivo: $('archivo'),
  tarjeta: $('tarjeta'), pCategoria: $('p-categoria'), pEstrella: $('p-estrella'), pTexto: $('p-texto'),
  opciones: $('opciones'), abierta: $('abierta'), cajaRespuesta: $('caja-respuesta'), pRespuesta: $('p-respuesta'),
  btnVer: $('btn-ver'), btnCorrecto: $('btn-correcto'), btnIncorrecto: $('btn-incorrecto'),
  suspenso: $('suspenso'), resultado: $('resultado'), rTitulo: $('r-titulo'), rDetalle: $('r-detalle'),
  vuelta: $('vuelta'), vueltaBarra: $('vuelta-barra'), vueltaSeg: $('vuelta-seg'), btnVolver: $('btn-volver'),
  toast: $('toast'),
};

let datos = { preguntas: [], categorias: [] };
const jugadas = new Set();
let actual = null;                 // pregunta en pantalla
let eleccion = null;               // letra que tocó el juez (null en preguntas abiertas)
let fase = 'menu';                 // menu | respondiendo | suspenso | resultado
let temporizadores = [];           // timeouts/intervals de la pregunta en curso

// ---------- Utilidades ----------
function colorTexto(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#2b1d00' : '#ffffff';
}

function aviso(msg, { error = false, ms = 4500 } = {}) {
  el.toast.textContent = msg;
  el.toast.classList.toggle('error', error);
  el.toast.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.toast.hidden = true), ms);
}

const guardado = {
  leer() { try { return localStorage.getItem(CLAVE_GUARDADO); } catch { return null; } },
  escribir(txt) { try { localStorage.setItem(CLAVE_GUARDADO, txt); return true; } catch { return false; } },
  borrar() { try { localStorage.removeItem(CLAVE_GUARDADO); } catch { /* nada */ } },
};

// Mantiene la pantalla prendida mientras se juega (si el sistema lo permite).
let wakeLock = null;
async function mantenerPantalla() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* no soportado */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) mantenerPantalla(); });

// ---------- Carga de preguntas ----------
async function cargarIncluido() {
  const res = await fetch(ARCHIVO_INCLUIDO);
  if (!res.ok) throw new Error(`No encontré ${ARCHIVO_INCLUIDO} dentro de la app.`);
  return leerPreguntas(decodificar(await res.arrayBuffer()));
}

async function iniciar() {
  let origen = 'incluido';
  try {
    const propio = guardado.leer();
    if (propio) {
      try { datos = leerPreguntas(propio); origen = 'propio'; }
      catch { guardado.borrar(); datos = await cargarIncluido(); }
    } else {
      datos = await cargarIncluido();
    }
    pintarMenu(origen);
  } catch (e) {
    el.categorias.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'estado';
    p.textContent = `No pude cargar las preguntas. ${e.message} Probá con "Cargar mi CSV".`;
    el.categorias.append(p);
  }
}

function pintarMenu(origen) {
  el.categorias.replaceChildren(
    ...datos.categorias.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-categoria';
      b.style.setProperty('--color', c.color);
      b.style.setProperty('--color-texto', colorTexto(c.color));
      b.disabled = c.total === 0;
      const nombre = document.createElement('span');
      nombre.textContent = c.nombre;
      const cuantas = document.createElement('small');
      cuantas.textContent = `${c.total} preguntas`;
      b.append(nombre, cuantas);
      b.addEventListener('click', () => jugar({ categoria: c.clave }));
      return b;
    })
  );
  const estrellas = datos.categorias.reduce((s, c) => s + c.estrellas, 0);
  el.btnEstrella.disabled = estrellas === 0;
  el.origen.textContent =
    `${datos.preguntas.length} preguntas · ${estrellas} estrella · ` +
    (origen === 'propio' ? 'tu CSV cargado' : 'CSV incluido en la app');
  el.btnOriginal.hidden = origen !== 'propio';
}

async function importarCSV(archivo) {
  if (!archivo) return;
  try {
    const texto = decodificar(await archivo.arrayBuffer());
    const nuevo = leerPreguntas(texto);          // si el CSV está mal, falla acá y no pisa nada
    datos = nuevo;
    jugadas.clear();
    const guardo = guardado.escribir(texto);
    pintarMenu('propio');
    let msg = `✔ ${nuevo.preguntas.length} preguntas cargadas.`;
    if (nuevo.avisos.length) msg += ` ${nuevo.avisos.length} filas ignoradas (ej: ${nuevo.avisos[0]})`;
    if (!guardo) msg += ' No pude guardarlas: al cerrar la app habrá que cargarlas de nuevo.';
    aviso(msg, { ms: 7000 });
  } catch (e) {
    aviso(`No pude leer ese CSV. ${e.message}`, { error: true, ms: 8000 });
  } finally {
    el.archivo.value = '';
  }
}

// ---------- Flujo de una pregunta ----------
function jugar(modo) {
  sonidos.desbloquear();           // dentro del toque, para que el celular deje sonar
  mantenerPantalla();
  const p = sortear(datos.preguntas, modo, jugadas);
  if (!p) return aviso('No hay preguntas para esa opción.', { error: true });
  mostrarPregunta(p);
}

function limpiarTemporizadores() {
  temporizadores.forEach((t) => { clearTimeout(t); clearInterval(t); });
  temporizadores = [];
}

function mostrarPregunta(p) {
  limpiarTemporizadores();
  actual = p;
  fase = 'respondiendo';
  const cat = datos.categorias.find((c) => normalizar(c.nombre) === normalizar(p.categoria));
  const color = cat?.color ?? '#6d28d9';

  el.tarjeta.className = 'tarjeta';
  el.tarjeta.classList.toggle('estrella', p.estrella);
  el.tarjeta.classList.toggle('con-opciones', p.opciones.length > 0);
  el.tarjeta.style.setProperty('--color', color);
  el.tarjeta.style.setProperty('--color-texto', colorTexto(color));
  el.pCategoria.textContent = p.categoria;
  el.pEstrella.hidden = !p.estrella;
  el.pTexto.textContent = p.pregunta;
  el.suspenso.hidden = el.resultado.hidden = el.vuelta.hidden = true;

  if (p.opciones.length) {
    el.abierta.hidden = true;
    el.opciones.hidden = false;
    el.opciones.replaceChildren(
      ...p.opciones.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opcion';
        b.dataset.letra = o.letra;
        const letra = document.createElement('span');
        letra.className = 'letra';
        letra.textContent = o.letra;
        const texto = document.createElement('span');
        texto.textContent = MAYUS(o.texto);          // las opciones se muestran en MAYÚSCULA
        b.append(letra, texto);
        b.addEventListener('click', () => responder(o.letra === p.correcta, o.letra));
        return b;
      })
    );
  } else {
    el.opciones.hidden = true;
    el.opciones.replaceChildren();
    el.abierta.hidden = false;
    el.pRespuesta.textContent = MAYUS(p.respuesta);
    el.cajaRespuesta.hidden = true;
    el.btnVer.hidden = false;
    el.btnCorrecto.disabled = el.btnIncorrecto.disabled = false;
  }

  mostrarVista('pregunta');
  history.pushState({ v: 'pregunta' }, '');          // el botón "atrás" del celular vuelve al menú
  sonidos.reproducir('timer');                        // 🔊 arranca la tensión
}

/** El juez marcó lo que respondieron. No se revela al instante: primero el suspenso. */
function responder(acerto, letraElegida) {
  if (fase !== 'respondiendo') return;
  fase = 'suspenso';
  eleccion = letraElegida ?? null;

  if (letraElegida) {
    el.opciones.querySelectorAll('.opcion').forEach((b) => {
      b.disabled = true;
      b.classList.toggle('elegida', b.dataset.letra === letraElegida);
      b.classList.toggle('apagada', b.dataset.letra !== letraElegida);
    });
  } else {
    el.btnCorrecto.disabled = el.btnIncorrecto.disabled = true;
    el.btnVer.hidden = true;
  }
  el.suspenso.hidden = false;                         // el reloj sigue sonando durante el suspenso

  temporizadores.push(setTimeout(() => revelar(acerto), SEGUNDOS_SUSPENSO * 1000));
}

function revelar(acerto) {
  fase = 'resultado';
  sonidos.detener('timer');
  sonidos.reproducir(acerto ? 'exito' : 'error');     // 🔊 éxito o chicharra

  el.suspenso.hidden = true;
  el.tarjeta.classList.toggle('error', !acerto);
  el.resultado.className = `resultado ${acerto ? 'ok' : 'mal'}`;
  el.rTitulo.textContent = acerto ? '¡Correcto!' : '¡Incorrecto!';
  el.rDetalle.textContent = acerto ? '' : `Era: ${MAYUS(actual.respuesta)}`;
  el.resultado.hidden = false;

  if (actual.opciones.length) {
    el.opciones.querySelectorAll('.opcion').forEach((b) => {
      const esCorrecta = b.dataset.letra === actual.correcta;
      const fueElegida = b.dataset.letra === eleccion;
      b.classList.remove('elegida');
      b.classList.toggle('correcta', esCorrecta);                 // verde: la correcta
      b.classList.toggle('incorrecta', fueElegida && !esCorrecta); // rojo: la que eligieron si estaba mal
      b.classList.toggle('apagada', !esCorrecta && !fueElegida);
    });
  } else {
    el.cajaRespuesta.hidden = false;
  }

  iniciarVuelta();
}

function iniciarVuelta() {
  el.vuelta.hidden = false;
  el.vueltaBarra.style.setProperty('--duracion', `${SEGUNDOS_VUELTA}s`);
  el.vueltaBarra.style.animation = 'none';
  void el.vueltaBarra.offsetWidth;
  el.vueltaBarra.style.animation = '';

  let faltan = SEGUNDOS_VUELTA;
  el.vueltaSeg.textContent = `(${faltan})`;
  temporizadores.push(setInterval(() => {
    faltan -= 1;
    el.vueltaSeg.textContent = `(${Math.max(faltan, 0)})`;
  }, 1000));
  temporizadores.push(setTimeout(volverAlMenu, SEGUNDOS_VUELTA * 1000));
}

// ---------- Navegación ----------
function mostrarVista(nombre) {
  el.menu.classList.toggle('activa', nombre === 'menu');
  el.pregunta.classList.toggle('activa', nombre === 'pregunta');
  window.scrollTo({ top: 0 });
}

function irAlMenu() {
  limpiarTemporizadores();
  sonidos.detener('timer');
  fase = 'menu';
  actual = null;
  mostrarVista('menu');
}

function volverAlMenu() {
  if (history.state?.v === 'pregunta') history.back();   // dispara popstate → irAlMenu
  else irAlMenu();
}

window.addEventListener('popstate', () => { if (fase !== 'menu') irAlMenu(); });

// ---------- Eventos ----------
el.btnEstrella.addEventListener('click', () => jugar({ estrella: true }));
el.btnVer.addEventListener('click', () => { el.cajaRespuesta.hidden = false; el.btnVer.hidden = true; });
el.btnCorrecto.addEventListener('click', () => responder(true));
el.btnIncorrecto.addEventListener('click', () => responder(false));
el.btnVolver.addEventListener('click', volverAlMenu);
el.btnImportar.addEventListener('click', () => el.archivo.click());
el.archivo.addEventListener('change', () => importarCSV(el.archivo.files[0]));
el.btnOriginal.addEventListener('click', async () => {
  guardado.borrar();
  jugadas.clear();
  try { datos = await cargarIncluido(); pintarMenu('incluido'); aviso('Volví al CSV incluido en la app.'); }
  catch (e) { aviso(e.message, { error: true }); }
});

iniciar();
