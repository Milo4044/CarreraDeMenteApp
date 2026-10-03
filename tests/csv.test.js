import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerPreguntas, parsearCSV, decodificar } from '../www/csv.js';
import { sortear } from '../www/sorteo.js';

const CSV = `categoria;pregunta;opcion_a;opcion_b;opcion_c;respuesta;estrella
Historia;¿En qué año llegó Colón a América?;1492;1500;1453;A;
Geografía;"¿Capital de Australia?
(pista: no es Sídney)";Sídney;Canberra;Melbourne;Canberra;
Deportes;¿Deporte del "birdie"?;;;;Golf;
Arte;¿Quién pintó Las Meninas?;Goya;Velázquez;Picasso;2;1
Arte;Fila rota;Goya;Velázquez;Picasso;Dalí;
Naturaleza;;;;;algo;
`;

test('lee preguntas con opciones, abiertas, comillas y saltos de línea', () => {
  const { preguntas, avisos } = leerPreguntas(CSV);
  assert.equal(preguntas.length, 4);
  assert.equal(avisos.length, 2);

  const [colon, canberra, golf, meninas] = preguntas;
  assert.equal(colon.correcta, 'A');
  assert.equal(colon.respuesta, '1492');
  assert.equal(canberra.correcta, 'B');                 // respuesta por texto
  assert.match(canberra.pregunta, /\n\(pista/);          // salto de línea dentro de comillas
  assert.deepEqual(golf.opciones, []);                   // pregunta abierta
  assert.equal(golf.respuesta, 'Golf');
  assert.equal(meninas.correcta, 'B');                   // respuesta por número
  assert.equal(meninas.estrella, true);
  assert.equal(colon.estrella, false);
});

test('detecta coma y tabulación, BOM y encabezados con tildes/mayúsculas', () => {
  const coma = '﻿Categoría,Pregunta,Respuesta\nArte,¿Quién pintó la Mona Lisa?,Leonardo da Vinci\n';
  assert.equal(leerPreguntas(coma).preguntas[0].respuesta, 'Leonardo da Vinci');
  const tab = 'categoria\tpregunta\trespuesta\nArte\t¿Algo?\tSí\n';
  assert.equal(leerPreguntas(tab).preguntas.length, 1);
});

test('categorías: las clásicas primero, con color, y estrellas contadas aparte', () => {
  const { categorias } = leerPreguntas(CSV);
  assert.deepEqual(categorias.map((c) => c.nombre), ['Historia', 'Geografía', 'Arte', 'Deportes']);
  const arte = categorias.find((c) => c.nombre === 'Arte');
  assert.equal(arte.total, 0);
  assert.equal(arte.estrellas, 1);
  assert.match(arte.color, /^#[0-9A-F]{6}$/i);
});

test('errores claros: columnas faltantes y CSV vacío', () => {
  assert.throws(() => leerPreguntas('foo;bar\n1;2'), /faltan las columnas: categoria, pregunta, respuesta/);
  assert.throws(() => leerPreguntas(''), /vacío/);
});

test('decodifica UTF-8 y, si no es válido, Windows-1252', () => {
  assert.equal(decodificar(new TextEncoder().encode('Geografía')), 'Geografía');
  assert.equal(decodificar(Uint8Array.from([0x47, 0x65, 0x6f, 0x67, 0x72, 0x61, 0x66, 0xed, 0x61])), 'Geografía');
});

test('parsearCSV respeta comillas escapadas', () => {
  assert.deepEqual(parsearCSV('a,"di ""hola""",c\n'), [['a', 'di "hola"', 'c']]);
});

test('sorteo: no repite hasta agotar, separa Estrella de categorías', () => {
  const { preguntas } = leerPreguntas(
    'categoria,pregunta,respuesta,estrella\nArte,P1,r,\nArte,P2,r,\nArte,P3,r,1\nHistoria,P4,r,\n'
  );
  const jugadas = new Set();
  const a = sortear(preguntas, { categoria: 'arte' }, jugadas);
  const b = sortear(preguntas, { categoria: 'arte' }, jugadas);
  assert.notEqual(a.id, b.id);
  assert.ok(!a.estrella && !b.estrella);
  const c = sortear(preguntas, { categoria: 'arte' }, jugadas);   // ya se agotaron las 2 comunes: reinicia
  assert.ok([a.id, b.id].includes(c.id));
  assert.equal(sortear(preguntas, { estrella: true }, jugadas).pregunta, 'P3');
  assert.equal(sortear(preguntas, { categoria: 'ciencia' }, jugadas), null);
});
