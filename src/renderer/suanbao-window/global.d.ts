import type { SuanbaoPetWindowApi } from '@shared/types/suanbao'

declare global {
  interface Window {
    suanbaoAPI: SuanbaoPetWindowApi
  }
}
