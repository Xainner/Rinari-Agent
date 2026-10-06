// Los enlaces del resultado a un video, una imagen grande o un PDF del
// workspace ya no pasan por la vista de texto (512 KiB): el video se
// reproduce por tramos, la imagen se ve y el PDF ofrece abrirse fuera o en su
// carpeta, con la ruta que aprobó el Engine. Los tonos de aviso se sirven
// desde la app.
const assert = require('node:assert/strict')
const { shell } = require('electron')
const { copyFileSync, mkdirSync, realpathSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { ui, click, clickText, command, evaluate, input, reload, report, scenario, screenshot, useLocalModel, wait } = require('../harness.cjs')

scenario(async () => {
  await useLocalModel()
  const root = join(ui.data, 'Promo'); mkdirSync(join(root, 'out'), { recursive: true })
  copyFileSync(join(__dirname, 'clip.mp4'), join(root, 'out', 'clip.mp4'))
  writeFileSync(join(root, 'out', 'manual.pdf'), '%PDF-1.4\n% prueba\n')
  // Un audio real (un tono de la app) para el reproductor del chat.
  copyFileSync(join(__dirname, '..', '..', '..', 'public', 'sounds', 'rinari', 'success.mp3'), join(root, 'out', 'voz.mp3'))
  const { project } = await command('project_add', { path: root, name: 'Promo' })
  await command('session_create', { project_id: project.id, title: 'Entrega' })
  await reload()
  await clickText('Entrega', 'aside button', { includes: true })
  await wait('Boolean(document.querySelector(".composer-surface"))')
  // Un póster de más de 512 KiB, con ruido para que no comprima.
  const png = await evaluate(`(() => {const c=document.createElement('canvas');c.width=900;c.height=900;const x=c.getContext('2d');const d=x.createImageData(900,900);for(let i=0;i<d.data.length;i++)d.data[i]=(Math.random()*255)|0;x.putImageData(d,0,0);return c.toDataURL('image/png').split(',')[1]})()`)
  writeFileSync(join(root, 'out', 'poster.png'), Buffer.from(png, 'base64'))
  assert(Buffer.from(png, 'base64').length > 512 * 1024, 'the poster exceeds the old 512 KiB limit')

  await input('.composer-surface textarea', 'Entrega la promo')
  await click('.composer-surface button[aria-label="Enviar mensaje"]')
  await wait(`Boolean(document.querySelector('a[data-file-path="out/clip.mp4"]'))`)

  await click('a[data-file-path="out/clip.mp4"]')
  await wait(`document.querySelector('video')?.src.startsWith('app://rinari/__media/')`)
  await wait(`document.querySelector('video').readyState >= 1 && document.querySelector('video').duration > 1.5`)
  // Saltar a mitad pide otro tramo del archivo.
  await evaluate(`(() => {const v=document.querySelector('video');v.currentTime=1.5})()`)
  await wait(`!document.querySelector('video').seeking && document.querySelector('video').currentTime >= 1.4`)
  await screenshot('video')

  await click('a[data-file-path="out/poster.png"]')
  await wait(`[...document.querySelectorAll('img')].some(i=>i.src.startsWith('app://rinari/__media/') && i.naturalWidth===900)`)
  await screenshot('poster')

  await click('a[data-file-path="out/manual.pdf"]')
  await wait(`document.body.innerText.includes('no tiene un visor')`)
  // «Abrir en el Explorador»: el host recibe la ruta aprobada por el Engine.
  const revealed = []
  const original = shell.showItemInFolder
  shell.showItemInFolder = (path) => { revealed.push(path) }
  try {
    await evaluate(`[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('Abrir en el Explorador de archivos')).at(-1).click()`)
    await wait('true')
    const deadline = Date.now() + 5000
    while (!revealed.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
  } finally {
    shell.showItemInFolder = original
  }
  assert.equal(revealed.length, 1)
  // El Engine devuelve la ruta canónica (sin nombres cortos 8.3 como RUNNER~1).
  assert.equal(revealed[0].toLowerCase(), realpathSync.native(join(root, 'out', 'manual.pdf')).toLowerCase())
  await screenshot('pdf-actions')

  // El enlace a un audio lleva su reproductor en el mensaje; no carga nada
  // hasta pulsarlo y luego suena desde la URL que aprobó el Engine.
  assert.equal(await evaluate(`document.querySelectorAll('audio').length`), 0)
  await click('button[aria-label="Reproducir voz.mp3"]')
  await wait(`(() => {const a=document.querySelector('audio[aria-label="voz.mp3"]');return Boolean(a && a.src.startsWith('app://rinari/__media/') && a.readyState >= 1 && a.duration > 0.3 && !a.error)})()`)
  await screenshot('inline-audio')

  // Los tonos de aviso están en el build y se reproducen.
  const tone = await evaluate(`(async () => {const r=await fetch('sounds/rinari/success.mp3');const a=new Audio('sounds/soft/attention.mp3');await new Promise((ok,ko)=>{a.onloadedmetadata=ok;a.onerror=ko});return {type:r.headers.get('content-type'),duration:a.duration}})()`)
  assert.equal(tone.type, 'audio/mpeg')
  assert(tone.duration > 0.3)
  report({ passed: ['video plays and seeks by ranges', 'large PNG shown as an image', 'PDF offers outside/folder; reveal gets the Engine path', 'audio link plays inline after a click', 'notification tones are served'] })
}, { width: 1500, height: 900 })
