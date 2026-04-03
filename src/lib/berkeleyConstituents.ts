import * as d3 from 'd3'
import csv from '../../data/constituents/9414816-berkeley.csv?raw'
import type { Constituent } from './tides'

const parsed = d3.csvParse(csv)

export const constituents: Constituent[] = parsed.map((row) => ({
  amplitude: parseFloat(row['Amplitude']!),
  phase: parseFloat(row['Phase']!),
  speed: parseFloat(row['Speed']!),
  description: row['Description']!,
}))
