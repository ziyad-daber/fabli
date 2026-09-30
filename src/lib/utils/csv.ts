import { NextResponse } from 'next/server'

/**
 * Utilitaires d'export CSV (§8 : « Exporter les données principales au format
 * CSV »).
 *
 * Les valeurs sont échappées selon RFC 4180 et un BOM UTF-8 est préposé : sans
 * lui, Excel casse les accents sur les noms de fournisseurs marocains.
 */

export interface CsvColumn<T> {
  key: string
  label: string
  value?: (row: T) => unknown
}

const DELIMITER = ';'

/**
 * Échappe une valeur CSV. Le séparateur de champ étant `;`, c'est lui — et
 * non la virgule — qui déclenche le quoting, tout comme les retours ligne et
 * les guillemets.
 */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''

  let text: string
  if (value instanceof Date) text = value.toISOString()
  else if (typeof value === 'object') text = JSON.stringify(value)
  else text = String(value)

  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/**
 * Construit un CSV.
 *
 * Le séparateur de champ est le point-virgule : c'est le séparateur par
 * défaut d'Excel en configuration française et il évite le piège de la
 * virgule décimale. Un BOM UTF-8 est ajouté par `csvResponse` pour que les
 * accents s'affichent correctement.
 */
export function toCsv<T>(columns: Array<CsvColumn<T>>, rows: T[]): string {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(DELIMITER)
  const body = rows.map((row) => {
    const record = row as Record<string, unknown>
    return columns
      .map((column) =>
        escapeCsvValue(column.value ? column.value(row) : record[column.key])
      )
      .join(DELIMITER)
  })
  return [header, ...body].join('\r\n')
}

export function csvResponse(csv: string, filename: string): NextResponse {
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}