// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n'
import { QuestionCard } from './Questions'
import { desktopApi, type QuestionRequest } from '../../services/desktop'

vi.mock('../../services/desktop', () => ({ desktopApi: { answer: vi.fn().mockResolvedValue({}) } }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const request: QuestionRequest = {
  request_id: 'q1',
  session_id: 's1',
  turn_id: 't1',
  status: 'pending',
  questions: [
    { id: 'choice', title: '¿Qué hacemos?', options: [{ label: 'Planificar', recommended: true }] },
  ],
}

it('waits for explicit submit after selecting an option', async () => {
  const user = userEvent.setup()
  render(<QuestionCard request={request} onResolved={vi.fn()} />)
  expect(desktopApi.answer).not.toHaveBeenCalled()
  await user.click(screen.getByRole('radio', { name: /Planificar/ }))
  expect(desktopApi.answer).not.toHaveBeenCalled()
  await user.click(screen.getByText('Enviar respuesta'))
  expect(desktopApi.answer).toHaveBeenCalledWith(request, { choice: 'Planificar' }, false)
})

it('retains a free answer while minimized and across question navigation', async () => {
  const user = userEvent.setup()
  const multiple = {
    ...request,
    questions: [...request.questions, { id: 'second', title: '¿Algo más?' }],
  }
  render(<QuestionCard request={multiple} onResolved={vi.fn()} />)
  await user.click(screen.getByRole('radio', { name: 'Otra' }))
  await user.type(screen.getByLabelText('Tu respuesta'), 'Mi alternativa')
  await user.click(screen.getByLabelText('Minimizar preguntas'))
  await user.click(screen.getByText(/Mostrar preguntas/))
  expect((screen.getByLabelText('Tu respuesta') as HTMLTextAreaElement).value).toBe(
    'Mi alternativa',
  )
  await user.click(screen.getByLabelText('Pregunta siguiente'))
  await user.type(screen.getByLabelText('Tu respuesta'), 'Sí')
  await user.click(screen.getByText('Enviar respuestas'))
  expect(desktopApi.answer).toHaveBeenCalledWith(
    multiple,
    { choice: 'Mi alternativa', second: 'Sí' },
    false,
  )
})

it('sends explicit skip rather than choosing the recommended option', async () => {
  const user = userEvent.setup()
  render(<QuestionCard request={request} onResolved={vi.fn()} />)
  await user.click(screen.getByText('Omitir'))
  expect(desktopApi.answer).toHaveBeenCalledWith(request, {}, true)
})

it('advances exactly once on a double click and never submits the last selection', async () => {
  const user = userEvent.setup()
  const multiple = { ...request, questions: [0,1,2].map(i => ({ id: `q${i}`, title: `Pregunta ${i}`, options: [{ label: 'Elegir' }] })) }
  render(<QuestionCard request={multiple} onResolved={vi.fn()} />)
  await user.dblClick(screen.getByRole('radio', {name:'Elegir'}))
  expect(screen.getByRole('heading').textContent).toBe('Pregunta 1')
  expect(document.activeElement).toBe(screen.getByRole('heading'))
  fireEvent.click(screen.getByRole('radio',{name:'Elegir'}),{detail:1})
  expect(screen.getByRole('heading').textContent).toBe('Pregunta 1')
  await new Promise(resolve=>setTimeout(resolve,260))
  await user.click(screen.getByRole('radio', {name:'Elegir'}))
  expect(screen.getByRole('heading').textContent).toBe('Pregunta 2')
  await new Promise(resolve=>setTimeout(resolve,260))
  await user.click(screen.getByRole('radio', {name:'Elegir'}))
  expect(desktopApi.answer).not.toHaveBeenCalled()
  await user.dblClick(screen.getByText('Enviar respuestas'))
  expect(desktopApi.answer).toHaveBeenCalledTimes(1)
  expect(desktopApi.answer).toHaveBeenCalledWith(multiple,{q0:'Elegir',q1:'Elegir',q2:'Elegir'},false)
})

it('keeps custom drafts separate from fixed choices and trims only when submitting', async () => {
  const user = userEvent.setup()
  render(<QuestionCard request={request} onResolved={vi.fn()} />)
  expect((screen.getByLabelText('Pregunta siguiente') as HTMLButtonElement).disabled).toBe(true)
  await user.click(screen.getByRole('radio',{name:'Otra'}))
  const input=screen.getByLabelText('Tu respuesta') as HTMLTextAreaElement
  expect(input.value).toBe('')
  expect(document.activeElement).toBe(input)
  expect(input.maxLength).toBe(8000)
  await user.type(input,'  mi respuesta{Enter}multilinea  ')
  await user.click(screen.getByRole('radio',{name:/Planificar/}))
  expect(screen.queryByRole('textbox')).toBeNull()
  await user.click(screen.getByRole('radio',{name:'Otra'}))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('  mi respuesta\nmultilinea  ')
  await user.click(screen.getByText('Enviar respuesta'))
  expect(desktopApi.answer).toHaveBeenCalledWith(request,{choice:'mi respuesta\nmultilinea'},false)
})

it('requires Continue for an intermediate Other and restores selection when navigating back', async () => {
  const user=userEvent.setup()
  const multiple={...request,questions:[...request.questions,{id:'last',title:'Última',options:[{label:'Fin'}]}]}
  render(<QuestionCard request={multiple} onResolved={vi.fn()} />)
  await user.click(screen.getByRole('radio',{name:'Otra'}))
  expect((screen.getByText('Continuar') as HTMLButtonElement).disabled).toBe(true)
  await user.type(screen.getByRole('textbox'),'  ')
  expect((screen.getByLabelText('Pregunta siguiente') as HTMLButtonElement).disabled).toBe(true)
  await user.type(screen.getByRole('textbox'),'Personalizada')
  expect(screen.getByRole('heading').textContent).toBe('¿Qué hacemos?')
  await user.click(screen.getByText('Continuar'))
  await user.click(screen.getByLabelText('Pregunta anterior'))
  expect(screen.getByRole('radio',{name:'Otra'}).getAttribute('aria-checked')).toBe('true')
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('  Personalizada')
})

it('normalizes model Other options and auto-focuses free-only questions', () => {
  const req={...request,questions:[{id:'free',title:'Pregunta libre',options:[{label:'  OtRa  '},{label:'OTHER'}]}]}
  render(<QuestionCard request={req} onResolved={vi.fn()} />)
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  expect(screen.getByRole('radio').textContent).toBe('Otra')
  expect(document.activeElement).toBe(screen.getByRole('textbox'))
  expect((screen.getByText('Enviar respuesta') as HTMLButtonElement).disabled).toBe(true)
})

it('selects a duplicate label by index and supports Space and Enter', async () => {
  const user=userEvent.setup()
  render(<QuestionCard request={{...request,questions:[{id:'dup',title:'Duplicados',options:[{label:'Sí'},{label:'Sí'}]}]}} onResolved={vi.fn()} />)
  screen.getAllByRole('radio',{name:'Sí'})[1]!.focus()
  await user.keyboard(' ')
  expect(screen.getAllByRole('radio').map(r=>r.getAttribute('aria-checked'))).toEqual(['false','true','false'])
  screen.getAllByRole('radio',{name:'Sí'})[0]!.focus()
  await user.keyboard('{Enter}')
  expect(screen.getAllByRole('radio').map(r=>r.getAttribute('aria-checked'))).toEqual(['true','false','false'])
})

it('locks every control during submission and retains answers after a recoverable failure', async () => {
  const user=userEvent.setup()
  let reject!: (reason: Error)=>void
  vi.mocked(desktopApi.answer).mockImplementationOnce(()=>new Promise((_,r)=>{reject=r}))
  render(<QuestionCard request={request} onResolved={vi.fn()} />)
  await user.click(screen.getByRole('radio',{name:'Otra'}))
  await user.type(screen.getByRole('textbox'),'conservar')
  await user.click(screen.getByText('Enviar respuesta'))
  expect(screen.getAllByRole('button').every(b=>(b as HTMLButtonElement).disabled)).toBe(true)
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  await act(async()=>reject(new Error('recuperable')))
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('conservar')
  expect((screen.getByText('Enviar respuesta') as HTMLButtonElement).disabled).toBe(false)
})

it('resets local state when request_id changes and localizes English controls', async () => {
  const user=userEvent.setup()
  const view=render(<I18nProvider lang="en"><QuestionCard request={request} onResolved={vi.fn()} /></I18nProvider>)
  await user.click(screen.getByRole('radio',{name:'Other'}))
  await user.type(screen.getByRole('textbox'),'first request')
  view.rerender(<I18nProvider lang="en"><QuestionCard request={{...request,request_id:'new'}} onResolved={vi.fn()} /></I18nProvider>)
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByText('Question 1 of 1')).toBeTruthy()
  expect((screen.getByText('Send response') as HTMLButtonElement).disabled).toBe(true)
})
