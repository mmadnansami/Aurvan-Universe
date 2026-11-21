import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BOOTSTRAP_DATA,
  OFFICIAL_PLATFORM_LOGO_URL,
  isValidBootstrapPayload,
} from './defaultBootstrap';

test('DEFAULT_BOOTSTRAP_DATA includes official logo, 3 institutions, 9 ranks, and 8 divisions', () => {
  assert.equal(DEFAULT_BOOTSTRAP_DATA.settings.platform_logo_url, OFFICIAL_PLATFORM_LOGO_URL);
  assert.equal(DEFAULT_BOOTSTRAP_DATA.institutions.length, 3);
  assert.deepEqual(
    DEFAULT_BOOTSTRAP_DATA.institutions.map((i) => i.code),
    ['AURVAN_POLICE', 'SAB', 'SIA']
  );
  assert.equal(DEFAULT_BOOTSTRAP_DATA.ranks.length, 9);
  assert.equal(DEFAULT_BOOTSTRAP_DATA.regions.length, 8);
  assert.deepEqual(
    DEFAULT_BOOTSTRAP_DATA.regions.map((r) => r.code),
    ['DHK', 'CTG', 'RAJ', 'KHL', 'BAR', 'SYL', 'RNG', 'MYM']
  );
  assert.ok(DEFAULT_BOOTSTRAP_DATA.content.hero?.media_url);
  assert.ok(DEFAULT_BOOTSTRAP_DATA.content.universe_intro?.body);
});

test('isValidBootstrapPayload validates bootstrap shape and rejects HTML or empty objects', () => {
  assert.equal(isValidBootstrapPayload(DEFAULT_BOOTSTRAP_DATA), true);
  assert.equal(isValidBootstrapPayload(null), false);
  assert.equal(isValidBootstrapPayload('<!doctype html><html></html>'), false);
  assert.equal(isValidBootstrapPayload({ settings: {}, content: {}, institutions: [], ranks: [], regions: [] }), false);
});
