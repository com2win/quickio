// server/templates/engine.js
// Moteur de rendu minimaliste pour templates Quickio
// Variables : {{var}}, {{#if var}}...{{/if}}, {{#each arr}}...{{/each}}

const fs   = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname);

function render(templateName, data) {
  const file = path.join(TEMPLATES_DIR, templateName + '.html');
  if (!fs.existsSync(file)) throw new Error('Template introuvable : ' + templateName);
  let tpl = fs.readFileSync(file, 'utf8');
  return compile(tpl, data);
}

function compile(tpl, data) {
  // {{#if var}} ... {{else}} ... {{/if}}
  tpl = tpl.replace(/\{\{#if ([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
    const [ifPart, elsePart = ''] = inner.split(/\{\{else\}\}/);
    return getValue(data, key.trim()) ? compile(ifPart, data) : compile(elsePart, data);
  });

  // {{#each arr}} ... {{/each}}
  tpl = tpl.replace(/\{\{#each ([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, inner) => {
    const arr = getValue(data, key.trim());
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return arr.map((item, i) => {
      const itemData = Object.assign({}, data, item, {
        '@index': i,
        '@last':  i === arr.length - 1,
        'this':   item
      });
      return compile(inner, itemData);
    }).join('');
  });

  // {{var}} — échappé HTML
  tpl = tpl.replace(/\{\{([^#\/!][^}]*)\}\}/g, (_, key) => {
    const val = getValue(data, key.trim());
    if (val === null || val === undefined) return '';
    return String(val);
  });

  return tpl;
}

function getValue(data, key) {
  // Support this.prop, @index, @last
  if (key === 'this') return data;
  const parts = key.split('.');
  let val = data;
  for (const p of parts) {
    if (val == null) return '';
    val = val[p];
  }
  return val ?? '';
}

module.exports = { render };
