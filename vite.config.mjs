import { defineConfig } from 'vite';
import { resolve } from 'path';

// Two independent entry points, two independent bundles.
// Visiting index.html never downloads three.js, the GLTF loader,
// or the landscape model — none of that is referenced by that
// page at all. Only experience.html pulls in the 3D stack.
export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'index.html'),
                experience: resolve(import.meta.dirname, 'experience.html')
            }
        }
    }
});
