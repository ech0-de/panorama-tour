import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import css from 'rollup-plugin-import-css';

const config = {
  input: 'src/main.ts',
  output: [{
    name: 'panoramaTour',
    file: 'dist/panorama-tour.min.js',
    format: 'umd'
  }],
  plugins: [
    nodeResolve(),
    typescript({ include: 'src/*.ts' }),
    css({ minify: true, output: 'panorama-tour.min.css' }),
    terser()
  ],
  onwarn(warning, handler) {
    if (warning.code === 'THIS_IS_UNDEFINED') {
      return;
    }

    handler(warning);
  }
};

export default config;
