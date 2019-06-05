import { terser } from 'rollup-plugin-terser';
import replace from '@rollup/plugin-replace';
import babel from 'rollup-plugin-babel';
import pkg from './package.json';
import csso from 'csso';
import fs from 'fs';

const css = csso.minify(fs.readFileSync('src/main.css', 'utf-8')).css;

const config = {
    input: 'src/main.js',
    output: [{
        name: 'panoramaTour',
        file: pkg.main,
        format: 'umd'
    }],
    plugins: [
        replace({ __minifiedCSS__: JSON.stringify(css) }),
        babel({ exclude: ['node_modules/**'] }),
        terser()
    ]
};

export default config;
