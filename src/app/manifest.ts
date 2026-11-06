import type {MetadataRoute} from 'next';

// Lets clients add WOWPRO to their phone's home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WOWPRO by WowStampa',
    short_name: 'WOWPRO',
    description: 'Area riservata premium per i clienti WowStampa.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafb',
    theme_color: '#0a0d15',
    lang: 'it',
    icons: [
      {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png'},
      {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png'},
      {src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
  };
}
