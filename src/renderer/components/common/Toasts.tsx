import { Snackbar } from '@mui/material'
import { useMediaQuery, useTheme } from '@mui/material'
import { useStore } from 'zustand'
import { uiStore } from '@/stores/uiStore'
import * as toastActions from '../../stores/toastActions'

function Toasts() {
  const toasts = useStore(uiStore, (state) => state.toasts)
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const isMobileBuild = process.env.CHATBOX_BUILD_TARGET === 'mobile_app'
  return (
    <>
      {toasts.map((toast) => (
        <Snackbar
          className="Snackbar"
          key={toast.id}
          open
          onClose={() => toastActions.remove(toast.id)}
          message={toast.content}
          anchorOrigin={
            isMobileBuild && isSmallScreen
              ? { vertical: 'top', horizontal: 'center' }
              : { vertical: 'top', horizontal: 'right' }
          }
          sx={isMobileBuild && isSmallScreen ? { top: '45%' } : undefined}
          autoHideDuration={toast.duration ?? 3000}
        />
      ))}
    </>
  )
}

export default Toasts
