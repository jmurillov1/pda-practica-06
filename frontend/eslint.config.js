// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Identifier[name=/Empleado/i]',
          message:
            'El código se nombra en inglés: usa Employee. El español queda para atributos, rutas y mensajes.',
        },
        {
          selector: 'TSInterfaceDeclaration[id.name=/^I[A-Z]/]',
          message: 'No uses el prefijo húngaro I en interfaces.',
        },
        {
          selector: 'Property[key.name=/^(campo|mensaje)$/]',
          message: 'El sobre de respuesta usa claves en inglés: field, message.',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
