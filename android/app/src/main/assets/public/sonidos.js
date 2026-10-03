// ============================================================
//  sonidos.js · reloj de tensión, éxito y error
//
//  👉 PONÉ TUS ARCHIVOS en www/audio/ con estos nombres:
//       timer.mp3  → reloj / tensión (se repite mientras se piensa)
//       exito.mp3  → respuesta correcta
//       error.mp3  → chicharra de respuesta incorrecta
//
//  Si un archivo no existe, se usa un sonido generado por el
//  navegador (WebAudio) para que la app funcione desde el primer día.
// ============================================================

const ARCHIVOS = {
  timer: 'audio/timer.mp3',
  exito: 'audio/exito.mp3',
  error: 'audio/error.mp3',
};

let ctx = null;
const audioCtx = () => {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* sin WebAudio: queda en silencio */ }
  return ctx;
};

function nota(frecuencia, inicio, duracion, { tipo = 'sine', volumen = 0.25 } = {}) {
  const c = audioCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = tipo;
  osc.frequency.value = frecuencia;
  const t = c.currentTime + inicio;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volumen, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duracion + 0.05);
}

// Respaldos generados (se usan solo si falta el mp3)
const SINTETICOS = {
  timer: { loop: true, ejecutar: () => { nota(900, 0, 0.06, { tipo: 'square', volumen: 0.08 }); nota(600, 0.5, 0.06, { tipo: 'square', volumen: 0.08 }); }, cadaMs: 1000 },
  exito: { ejecutar: () => [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.12, 0.35)) },
  error: { ejecutar: () => { nota(120, 0, 0.9, { tipo: 'sawtooth', volumen: 0.3 }); nota(95, 0, 0.9, { tipo: 'square', volumen: 0.2 }); } },
};

const elementos = {};
const intervalos = {};

function elemento(nombre) {
  if (!elementos[nombre]) {
    const a = new Audio(ARCHIVOS[nombre]);
    a.preload = 'auto';
    a.loop = nombre === 'timer';
    elementos[nombre] = a;
  }
  return elementos[nombre];
}

function usarRespaldo(nombre) {
  const s = SINTETICOS[nombre];
  if (s.loop) {
    detenerRespaldo(nombre);
    s.ejecutar();
    intervalos[nombre] = setInterval(s.ejecutar, s.cadaMs);
  } else {
    s.ejecutar();
  }
}

function detenerRespaldo(nombre) {
  clearInterval(intervalos[nombre]);
  delete intervalos[nombre];
}

/** Llamar dentro de un toque del usuario: los celulares no dejan sonar audio antes. */
export function desbloquear() {
  audioCtx();
  for (const nombre of Object.keys(ARCHIVOS)) {
    const a = elemento(nombre);
    a.muted = true;
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
            .catch(() => { a.muted = false; });
  }
}

export function reproducir(nombre) {
  const a = elemento(nombre);
  a.currentTime = 0;
  a.play().catch(() => usarRespaldo(nombre)); // archivo faltante -> sonido generado
}

export function detener(nombre) {
  detenerRespaldo(nombre);
  const a = elemento(nombre);
  a.pause();
  a.currentTime = 0;
}
