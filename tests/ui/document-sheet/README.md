# document-sheet

**Qué fija.** Un XLSX del workspace se abre en el visor documental y
«Contenido» es una cuadrícula con sus hojas. Una fórmula sin resultado
calculado se ve pendiente (nunca un 0 inventado), un texto que empieza por
«=» sigue siendo texto, los identificadores conservan sus ceros y «Fórmulas»
enseña la fórmula de cada celda.

**Cómo.** El modelo falso enlaza `out/presupuesto.xlsx`, generado con el
compilador de libros del CLI (`tests/unit/documents/test_spreadsheets.py`,
`BOOK`). El escenario abre el libro, revisa celdas de dos hojas y alterna la
vista de fórmulas.
