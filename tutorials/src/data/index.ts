// Screenshots and click positions written by capture.mjs, one file per video and language.
import type { Lang } from '../script'
import registrarEs from './registrar-ofrenda.es.json'
import registrarEn from './registrar-ofrenda.en.json'
import informeEs from './informe-mensual.es.json'
import informeEn from './informe-mensual.en.json'
import conteoEs from './conteo-domingo.es.json'
import conteoEn from './conteo-domingo.en.json'
import miembroEs from './nuevo-miembro.es.json'
import miembroEn from './nuevo-miembro.en.json'
import corregirEs from './corregir-ofrenda.es.json'
import corregirEn from './corregir-ofrenda.en.json'
import constanciasEs from './constancias.es.json'
import constanciasEn from './constancias.en.json'

export interface Box { x: number; y: number; w: number; h: number }
export interface Capture { viewport: { width: number; height: number }; steps: { image: string; target: Box | null }[] }

export const captures: Record<string, Record<Lang, Capture>> = {
  'registrar-ofrenda': { es: registrarEs, en: registrarEn },
  'informe-mensual': { es: informeEs, en: informeEn },
  'conteo-domingo': { es: conteoEs, en: conteoEn },
  'nuevo-miembro': { es: miembroEs, en: miembroEn },
  'corregir-ofrenda': { es: corregirEs, en: corregirEn },
  constancias: { es: constanciasEs, en: constanciasEn },
}
