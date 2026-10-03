// ============================================================
//  csv.js · lee el CSV de preguntas y lo convierte en objetos
//
//  Columnas (el orden no importa, los nombres sí):
//    categoria ; pregunta ; opcion_a ; opcion_b ; opcion_c ; respuesta ; estrella
//
//  - opcion_a/b/c son opcionales: sin opciones la pregunta es "abierta".
//  - respuesta: la letra (A, B o C) o el texto exacto de la opción correcta.
//    En las preguntas abiertas es el texto de la respuesta.
//  - estrella: 1 / si / true para las preguntas difíciles (Pregunta Estrella).
//  - Acepta separador ; , o tabulación, comillas, saltos de línea dentro de
//    comillas y archivos guardados por Excel (UTF-8 o ANSI).
// ============================================================

const LETRAS = ['A', 'B', 'C'];

/** minúsculas, sin tildes y sin espacios sobrantes: "Geografía " -> "geografia" */
export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- Colores por categoría ----------
const COLORES_CONOCIDOS = {
  historia: '#F4C20D',
  geografia: '#1E88E5',
  naturaleza: '#43A047',
  espectaculos: '#EC407A',
  arte: '#8E24AA',
  deportes: '#FB8C00',
};
const COLORES_EXTRA = ['#00ACC1', '#D81B60', '#6D4C41', '#7CB342', '#5E35B1', '#F4511E'];
const ORDEN_CONOCIDAS = Object.keys(COLORES_CONOCIDOS);

// ---------- Lectura del archivo ----------

/** Decodifica bytes: UTF-8 y, si no es válido, Windows-1252 (Excel en español). */
export function decodificar(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function detectarSeparador(texto) {
  const primera = texto.split(/\r?\n/, 1)[0] ?? '';
  const cuentas = [';', ',', '\t'].map((s) => [s, primera.split(s).length - 1]);
  cuentas.sort((a, b) => b[1] - a[1]);
  return cuentas[0][1] > 0 ? cuentas[0][0] : ',';
}

/** Parser CSV con comillas ("" = comilla escapada) y saltos de línea dentro de campos. */
export function parsearCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const sep = detectarSeparador(texto);
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      filas.push(fila); fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// ---------- De filas a preguntas ----------

const ALIAS = {
  categoria: ['categoria', 'category', 'cat'],
  pregunta: ['pregunta', 'question', 'texto', 'textopregunta'],
  a: ['opciona', 'a', 'opcion1'],
  b: ['opcionb', 'b', 'opcion2'],
  c: ['opcionc', 'c', 'opcion3'],
  respuesta: ['respuesta', 'answer', 'correcta', 'respuestacorrecta', 'textorespuesta'],
  estrella: ['estrella', 'star', 'esestrella', 'dificil'],
};

function mapearColumnas(encabezado) {
  const limpios = encabezado.map((h) => normalizar(h).replace(/[\s_\-]+/g, ''));
  const col = {};
  for (const [campo, alias] of Object.entries(ALIAS)) {
    const i = limpios.findIndex((h) => alias.includes(h));
    if (i >= 0) col[campo] = i;
  }
  const faltan = ['categoria', 'pregunta', 'respuesta'].filter((c) => !(c in col));
  if (faltan.length) {
    throw new Error(
      `Al CSV le faltan las columnas: ${faltan.join(', ')}. ` +
      `Encontré: ${encabezado.map((h) => h.trim()).filter(Boolean).join(', ') || '(ninguna)'}.`
    );
  }
  return col;
}

const esVerdadero = (v) => ['1', 'si', 'true', 'verdadero', 'x', 'yes', 'estrella', 'star'].includes(normalizar(v));

/** Devuelve la letra de la opción correcta o null si "respuesta" no coincide con ninguna. */
function resolverCorrecta(respuesta, opciones) {
  const r = normalizar(respuesta);
  const numero = { '1': 'A', '2': 'B', '3': 'C' }[r];
  const letra = numero ?? (/^[abc]$/.test(r) ? r.toUpperCase() : null);
  if (letra && opciones.some((o) => o.letra === letra)) return letra;
  return opciones.find((o) => normalizar(o.texto) === r)?.letra ?? null;
}

/**
 * Convierte el texto de un CSV en { preguntas, categorias, avisos }.
 * Las filas inválidas se saltean y quedan listadas en "avisos".
 */
export function leerPreguntas(texto) {
  const filas = parsearCSV(texto).filter((f) => f.some((c) => c.trim() !== ''));
  if (filas.length === 0) throw new Error('El CSV está vacío.');

  const col = mapearColumnas(filas[0]);
  const get = (fila, campo) => (campo in col ? (fila[col[campo]] ?? '').trim() : '');

  const preguntas = [];
  const avisos = [];

  filas.slice(1).forEach((fila, idx) => {
    const n = idx + 2; // número de fila como la ve el usuario en Excel
    const categoria = get(fila, 'categoria').replace(/\s+/g, ' ');
    const texto = get(fila, 'pregunta');
    const respuesta = get(fila, 'respuesta');

    if (!categoria || !texto) return avisos.push(`Fila ${n}: falta la categoría o la pregunta.`);
    if (!respuesta) return avisos.push(`Fila ${n}: falta la respuesta.`);

    const opciones = LETRAS
      .map((letra) => ({ letra, texto: get(fila, letra.toLowerCase()) }))
      .filter((o) => o.texto !== '');

    const base = { id: preguntas.length, categoria, pregunta: texto, estrella: esVerdadero(get(fila, 'estrella')) };

    if (opciones.length >= 2) {
      const correcta = resolverCorrecta(respuesta, opciones);
      if (!correcta) return avisos.push(`Fila ${n}: la respuesta "${respuesta}" no coincide con ninguna opción.`);
      preguntas.push({ ...base, opciones, correcta, respuesta: opciones.find((o) => o.letra === correcta).texto });
    } else {
      preguntas.push({ ...base, opciones: [], correcta: null, respuesta });
    }
  });

  if (preguntas.length === 0) throw new Error('No encontré ninguna pregunta válida en el CSV.');
  return { preguntas, categorias: armarCategorias(preguntas), avisos };
}

/** Lista de categorías con color y cantidad. Primero las 6 clásicas, luego las demás. */
function armarCategorias(preguntas) {
  const mapa = new Map();
  for (const p of preguntas) {
    const clave = normalizar(p.categoria);
    if (!mapa.has(clave)) mapa.set(clave, { nombre: p.categoria, total: 0, estrellas: 0 });
    mapa.get(clave)[p.estrella ? 'estrellas' : 'total']++;
  }
  const lista = [...mapa.entries()].sort(([a], [b]) => {
    const ia = ORDEN_CONOCIDAS.indexOf(a), ib = ORDEN_CONOCIDAS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  let extra = 0;
  return lista.map(([clave, c]) => ({ ...c, clave, color: COLORES_CONOCIDOS[clave] ?? COLORES_EXTRA[extra++ % COLORES_EXTRA.length] }));
}
