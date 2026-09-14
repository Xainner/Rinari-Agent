// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useWindowBounds } from './useWindowBounds'
const win = vi.hoisted(() => ({isMaximized:vi.fn().mockResolvedValue(false),outerSize:async()=>({width:1456,height:939}),innerSize:async()=>({width:1440,height:900}),outerPosition:async()=>({x:0,y:0}),setSize:vi.fn().mockResolvedValue(undefined),setPosition:vi.fn().mockResolvedValue(undefined)}))
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>true}))
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>win,currentMonitor:async()=>({workArea:{size:{width:1280,height:720},position:{x:0,y:0}}}),PhysicalSize:class {constructor(public width:number,public height:number){}},PhysicalPosition:class {constructor(public x:number,public y:number){}}}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
function Bounds(){useWindowBounds();return null}
it('accounts for native window borders when clamping to the work area',async()=>{
  render(<Bounds />)
  await waitFor(()=>expect(win.setSize).toHaveBeenCalledWith({width:1264,height:681}))
})
it('leaves maximized windows under native window management',async()=>{
  win.isMaximized.mockResolvedValueOnce(true)
  render(<Bounds />)
  await waitFor(()=>expect(win.isMaximized).toHaveBeenCalledOnce())
  expect(win.setSize).not.toHaveBeenCalled()
})
