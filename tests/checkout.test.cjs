const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const template = readFileSync(`${__dirname}/../template.tpl`, 'utf8');
const permissions = JSON.parse(template.split('___WEB_PERMISSIONS___')[1].split('___TESTS___')[0]);
const globals = permissions.find(p => p.instance.key.publicId === 'access_globals')
  .instance.param[0].value.listItem.map(entry => Object.fromEntries(
    entry.mapKey.map((key, i) => [key.string, entry.mapValue[i].string ?? entry.mapValue[i].boolean])
  ));
const source = template
  .split('___SANDBOXED_JS_FOR_WEB_TEMPLATE___')[1]
  .split('___WEB_PERMISSIONS___')[0];

function checkout(state = 'missing') {
  const calls = [];
  const logs = [];
  const timers = [];
  let now = 0;
  let available = state !== 'missing';
  let analyticsReady = state === 'loaded';
  let successes = 0;
  let failures = 0;
  const data = {
    transaction_id: 'synthetic-order',
    total_base_amount: '29',
    total_final_amount: '25',
    currency: 'EUR',
    products: [{ item_id: 'synthetic-product', price: 25, quantity: 2 }],
    gtmOnSuccess: () => successes++,
    gtmOnFailure: () => failures++,
  };
  const apis = {
    assertThat: value => ({ isArray: () => { assert.ok(Array.isArray(value)); return true; } }),
    makeNumber: Number,
    logToConsole: (...args) => logs.push(args),
    copyFromWindow: path => {
      assert.ok(globals.some(g => g.key === path && g.read), `Missing read permission for ${path}`);
      if (path === 'JoinStories.sendCartValidated') return available ? () => {} : undefined;
      assert.equal(path, 'joinStories.globalScript.loaded');
      return analyticsReady;
    },
    callLater: callback => timers.push({ at: now + 1, callback }),
    getTimestampMillis: () => now,
    callInWindow: (path, ...args) => {
      assert.ok(globals.some(g => g.key === path && g.execute), `Missing execute permission for ${path}`);
      assert.equal(path, 'JoinStories.sendCartValidated');
      assert.ok(available && analyticsReady);
      calls.push(JSON.parse(JSON.stringify(args[0])));
    },
  };
  vm.runInNewContext(source, { data, require: name => {
    assert.ok(name in apis, `Unexpected API ${name}`);
    return apis[name];
  } });
  return {
    calls, logs, timers,
    get successes() { return successes; },
    get failures() { return failures; },
    ready() { available = true; analyticsReady = true; },
    controllerReady() { available = true; },
    advance(ms) {
      const end = now + ms;
      while (timers.length && timers[0].at <= end) {
        const timer = timers.shift();
        now = timer.at;
        timer.callback();
      }
      now = end;
    },
  };
}

test('tracks immediately when the global script is ready', () => {
  const tag = checkout('loaded');
  assert.equal(tag.successes, 1);
  assert.equal(tag.failures, 0);
  assert.equal(tag.timers.length, 0);
  assert.equal(tag.calls[0].transaction_id, 'synthetic-order');
  assert.equal(tag.calls[0].total_base_amount, 29);
  assert.equal(tag.calls[0].products[0].product_id, 'synthetic-product');
});

test('waits for a delayed global script and sends the checkout once', () => {
  const tag = checkout();
  assert.equal(tag.failures, 0);
  assert.equal(tag.successes, 0);
  tag.advance(200);
  tag.ready();
  tag.advance(5000);
  assert.equal(tag.calls.length, 1);
  assert.equal(tag.successes, 1);
  assert.equal(tag.failures, 0);
  assert.equal(tag.timers.length, 0);
});

test('fails once after five seconds when the global script stays absent', () => {
  const tag = checkout();
  assert.equal(tag.failures, 0);
  tag.advance(4999);
  assert.equal(tag.failures, 0);
  tag.advance(1);
  assert.equal(tag.failures, 1);
  assert.equal(tag.calls.length, 0);
  assert.equal(tag.successes, 0);
  assert.equal(tag.timers.length, 0);
  tag.advance(10000);
  assert.equal(tag.failures, 1);
});

test('accepts a global script that becomes ready at the last attempt', () => {
  const tag = checkout();
  tag.advance(4999);
  tag.ready();
  tag.advance(1);
  assert.equal(tag.calls.length, 1);
  assert.equal(tag.successes, 1);
  assert.equal(tag.failures, 0);
});


test('waits when the controller exists before analytics initialization', () => {
  const tag = checkout('controller');
  tag.advance(200);
  assert.equal(tag.calls.length, 0);
  assert.equal(tag.successes, 0);
  tag.ready();
  tag.advance(5000);
  assert.equal(tag.calls.length, 1);
  assert.equal(tag.successes, 1);
  assert.equal(tag.failures, 0);
});

test('keeps waiting when the controller appears before analytics during a retry', () => {
  const tag = checkout();
  tag.controllerReady();
  tag.advance(200);
  assert.equal(tag.calls.length, 0);
  assert.equal(tag.successes, 0);
  tag.ready();
  tag.advance(5000);
  assert.equal(tag.calls.length, 1);
  assert.equal(tag.successes, 1);
  assert.equal(tag.failures, 0);
});


test('does not request the reserved setTimeout global rejected by GTM import', () => {
  assert.ok(!globals.some(g => g.key === 'setTimeout'));
});
