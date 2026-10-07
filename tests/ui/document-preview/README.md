# document-preview

**Qué fija.** Un PPTX del workspace se abre en el visor documental, nunca
como texto. Se ven sus diapositivas renderizadas por el Engine con Office local
o LibreOffice, con miniaturas; en un equipo sin ninguno (el runner de la CI)
aparece un aviso explícito con «Abrir externamente». «Contenido» muestra lo que
leyó el Engine: títulos, texto, datos del gráfico y notas. «Verificación»
valida bajo demanda: la estructura sale correcta y la revisión visual nunca se
da por hecha sin que alguien revise las páginas. «Revisiones» lista el original.

**Cómo.** El modelo falso enlaza `out/ventas.pptx` (3 diapositivas, un gráfico
nativo y notas, generado con los builders de pruebas del CLI). El escenario
pulsa el enlace, espera las 3 miniaturas o el aviso, revisa el contenido,
pulsa «Validar» y comprueba el estado de cada dimensión.
