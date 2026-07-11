const test = require('node:test');
const assert = require('node:assert/strict');
const { findOfflineEntry, renderOfflineEntry } = require('../dictionary-utils');

test('findOfflineEntry resolves simple offline dictionary entries', () => {
  const dictionaryData = {
    study: {
      pos: 'verb',
      definition: 'To devote time and attention to learning.',
      synonyms: ['learn']
    }
  };

  const result = findOfflineEntry(dictionaryData, 'study');

  assert.ok(result);
  assert.equal(result.word, 'study');
  assert.equal(result.entry.definition, 'To devote time and attention to learning.');
});

test('renderOfflineEntry formats simple offline definitions', () => {
  const html = renderOfflineEntry({
    pos: 'verb',
    definition: 'To learn something carefully.',
    synonyms: ['study']
  }, 'en-US', 'study');

  assert.match(html, /study/);
  assert.match(html, /To learn something carefully\./);
  assert.match(html, /Synonyms/);
});
