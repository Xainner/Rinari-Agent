/** Nombre del producto que instala este setup: la Nightly se arma con `VITE_RINARI_SETUP_NIGHTLY`. */
export const PRODUCT: string = import.meta.env.VITE_RINARI_SETUP_NIGHTLY ? 'Rinari Agent Nightly' : 'Rinari Agent'
