import { expect, it } from 'vitest'
import { matchImageTools } from './mcpImageTools'

it('proposes a tool per operation from the server tool names', () => {
  expect(matchImageTools(['list_models', 'generate_image', 'edit_image', 'image_variations', 'upscale_image', 'remove_background'])).toEqual({
    generate: 'generate_image', edit: 'edit_image', variations: 'image_variations', upscale: 'upscale_image', remove_background: 'remove_background',
  })
})

it('a tool serves one operation, the most specific first', () => {
  // «remove_bg» no es «editar» ni «crear»; «create_variation» es una variación.
  expect(matchImageTools(['remove_bg', 'create_variation', 'txt2img'])).toEqual({ remove_background: 'remove_bg', variations: 'create_variation', generate: 'txt2img' })
})

it('proposes nothing for tools that do not look like images', () => {
  expect(matchImageTools(['search', 'read_file', 'credited'])).toEqual({})
})
