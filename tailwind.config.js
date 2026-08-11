/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kod: {
          // Tint colors
          tint: {
            primary: 'var(--kod-tint-primary)',
            secondary: 'var(--kod-tint-secondary)',
            tertiary: 'var(--kod-tint-tertiary)',
            white: 'var(--kod-tint-white)',
            black: 'var(--kod-tint-black)',
            gray: 'var(--kod-tint-gray)',
            disabled: 'var(--kod-tint-disabled)',
            brand: 'var(--kod-tint-brand)',
            placeholder: 'var(--kod-tint-placeholder)',
            error: 'var(--kod-tint-error)',
            'error-disabled': 'var(--kod-tint-error-disabled)',
            warning: 'var(--kod-tint-warning)',
            success: 'var(--kod-tint-success)',
          },

          // Border colors
          border: {
            primary: 'var(--kod-border-primary)',
            secondary: 'var(--kod-border-secondary)',
            warning: 'var(--kod-border-warning)',
            error: 'var(--kod-border-error)',
            success: 'var(--kod-border-success)',
            brand: 'var(--kod-border-brand)',
          },

          // Background colors
          background: {
            primary: 'var(--kod-background-primary)',
            'primary-hover': 'var(--kod-background-primary-hover)',
            secondary: 'var(--kod-background-secondary)',
            'secondary-hover': 'var(--kod-background-secondary-hover)',
            tertiary: 'var(--kod-background-tertiary)',
            'tertiary-hover': 'var(--kod-background-tertiary-hover)',
            disabled: 'var(--kod-background-disabled)',

            // Brand
            'brand-primary': 'var(--kod-background-brand-primary)',
            'brand-primary-hover': 'var(--kod-background-brand-primary-hover)',
            'brand-secondary': 'var(--kod-background-brand-secondary)',
            'brand-secondary-hover': 'var(--kod-background-brand-secondary-hover)',

            // Gray
            'gray-primary': 'var(--kod-background-gray-primary)',
            'gray-primary-hover': 'var(--kod-background-gray-primary-hover)',
            'gray-secondary': 'var(--kod-background-gray-secondary)',
            'gray-secondary-hover': 'var(--kod-background-gray-secondary-hover)',

            // Success
            'success-primary': 'var(--kod-background-success-primary)',
            'success-primary-hover': 'var(--kod-background-success-primary-hover)',
            'success-secondary': 'var(--kod-background-success-secondary)',
            'success-secondary-hover': 'var(--kod-background-success-secondary-hover)',

            // Error
            'error-primary': 'var(--kod-background-error-primary)',
            'error-primary-hover': 'var(--kod-background-error-primary-hover)',
            'error-secondary': 'var(--kod-background-error-secondary)',
            'error-secondary-hover': 'var(--kod-background-error-secondary-hover)',

            // Warning
            'warning-primary': 'var(--kod-background-warning-primary)',
            'warning-primary-hover': 'var(--kod-background-warning-primary-hover)',
            'warning-secondary': 'var(--kod-background-warning-secondary)',
            'warning-secondary-hover': 'var(--kod-background-warning-secondary-hover)',

            // Mask
            'mask-overlay': 'var(--kod-background-mask-overlay)',
            'mask-lighten': 'var(--kod-background-mask-lighten)',
          },
        },
      },
      spacing: {
        none: 'var(--kod-spacing-none)',
        '3xs': 'var(--kod-spacing-3xs)',
        xxs: 'var(--kod-spacing-xxs)',
        xs: 'var(--kod-spacing-xs)',
        sm: 'var(--kod-spacing-sm)',
        md: 'var(--kod-spacing-md)',
        lg: 'var(--kod-spacing-lg)',
        xl: 'var(--kod-spacing-xl)',
        xxl: 'var(--kod-spacing-xxl)',
      },
      borderRadius: {
        none: 'var(--kod-radius-none)',
        xs: 'var(--kod-radius-xs)',
        sm: 'var(--kod-radius-sm)',
        md: 'var(--kod-radius-md)',
        lg: 'var(--kod-radius-lg)',
        xl: 'var(--kod-radius-xl)',
        xxl: 'var(--kod-radius-xxl)',
      },
      animation: {
        'fade-in': 'fadeIn 1s ease-out',
        flash: 'flash 0.5s ease-in-out 2',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        flash: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('tailwind-scrollbar')],
  corePlugins: {
    preflight: false,
  },
}
