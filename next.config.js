const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development', // Apaga el service worker en local para no molestar
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ... si tenías otras configuraciones acá adentro, dejalas intactas
};

module.exports = withPWA(nextConfig);