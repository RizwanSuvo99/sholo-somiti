import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * Emits a self-contained server with only the files actually reached, so the
   * production image carries neither the toolchain nor the full node_modules.
   */
  output: 'standalone',
}

export default nextConfig
