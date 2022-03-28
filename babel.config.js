// can't be `.babelrc` because Jest won't work with it: https://github.com/facebook/jest/issues/10256

module.exports = {
  sourceMaps: true,
  presets: [
    '@babel/env',
    [
      '@babel/typescript',
      {
        jsxPragma: 'h',
      },
    ],
  ],
  plugins: [
    [
      '@babel/plugin-transform-react-jsx',
      {
        pragma: 'h',
      },
    ],
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-syntax-import-meta',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-json-strings',
    '@babel/plugin-proposal-function-sent',
    '@babel/plugin-proposal-numeric-separator',
    '@babel/plugin-proposal-throw-expressions',
    '@babel/plugin-proposal-export-default-from',
  ],
}
