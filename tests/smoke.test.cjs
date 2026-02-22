const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('env-guard-monitor has monitor entry', () => {
  assert.equal(fs.existsSync('src/monitor.js'), true);
});
