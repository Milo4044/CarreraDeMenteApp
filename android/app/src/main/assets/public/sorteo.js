// ============================================================
//  sorteo.js · elige la próxima pregunta sin repetir
// ============================================================
import { normalizar } from './csv.js';

/**
 * @param {Array}  preguntas  todas las preguntas cargadas
 * @param {{categoria?: string, estrella?: boolean}} modo  una categoría (clave normalizada) o estrella
 * @param {Set<number>} jugadas  ids ya usados; se vacía para ese grupo cuando se agotan
 * @param {() => number} azar  inyectable para poder testear
 */
export function sortear(preguntas, modo, jugadas, azar = Math.random) {
  // Las Estrella solo salen con el botón Estrella; las categorías sacan las comunes.
  const grupo = preguntas.filter((p) =>
    modo.estrella ? p.estrella : !p.estrella && normalizar(p.categoria) === modo.categoria
  );
  if (grupo.length === 0) return null;

  let disponibles = grupo.filter((p) => !jugadas.has(p.id));
  if (disponibles.length === 0) {           // se jugaron todas: arrancamos de nuevo
    grupo.forEach((p) => jugadas.delete(p.id));
    disponibles = grupo;
  }
  const elegida = disponibles[Math.floor(azar() * disponibles.length)];
  jugadas.add(elegida.id);
  return elegida;
}
