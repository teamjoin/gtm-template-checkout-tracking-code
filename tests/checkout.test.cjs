const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/../template.tpl`, 'utf8')
  .split('___SANDBOXED_JS_FOR_WEB_TEMPLATE___')[1]
  .split('___WEB_PERMISSIONS___')[0];

function checkout(ready = false) {
  const calls = [];
  const logs = [];
  const timers = [];
  let now = 0;
  let available = ready;
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
      assert.equal(path, 'JoinStories.sendCartValidated');
      return available ? () => {} : undefined;
    },
    callInWindow: (path, ...args) => {
      if (path === 'setTimeout') {
        timers.push({ at: now + args[1], callback: args[0] });
        return timers.length;
      }
      assert.equal(path, 'JoinStories.sendCartValidated');
      assert.ok(available);
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
    ready() { available = true; },
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
  const tag = checkout(true);
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
