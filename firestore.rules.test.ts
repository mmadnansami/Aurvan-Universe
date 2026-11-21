import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(import.meta.dirname, 'firestore.rules');
const draftPath = path.resolve(import.meta.dirname, 'DRAFT_firestore.rules');
const blueprintPath = path.resolve(import.meta.dirname, 'firebase-blueprint.json');

function loadRulesText(): string {
  if (fs.existsSync(rulesPath)) return fs.readFileSync(rulesPath, 'utf8');
  return fs.readFileSync(draftPath, 'utf8');
}

test('firebase-blueprint.json defines all required entities and Firestore paths', () => {
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
  const requiredPaths = [
    '/test/connection',
    '/platform/bootstrap',
    '/admins/{uid}',
    '/users/{uid}',
    '/users/{uid}/private/{docId}',
    '/users/{uid}/notifications/{notifId}',
    '/users/{uid}/careerHistory/{entryId}',
    '/users/{uid}/caseProgress/{caseId}',
    '/users/{uid}/caseNotes/{caseId}',
    '/users/{uid}/timeline/{itemId}',
    '/users/{uid}/connections/{connId}',
    '/cases/{caseId}',
    '/cases/{caseId}/chapters/{chapterId}',
    '/cases/{caseId}/evidence/{evidenceId}',
    '/cases/{caseId}/characters/{charId}',
    '/cases/{caseId}/witnesses/{witnessId}',
    '/cases/{caseId}/interrogations/{questionId}',
    '/cases/{caseId}/hints/{hintId}',
    '/caseSolutions/{caseId}',
    '/reports/{reportId}',
    '/mediaAssets/{assetId}',
    '/documents/{docId}',
    '/audioAssets/{audioId}',
    '/models3d/{modelId}',
    '/adminLogs/{logId}',
  ];
  for (const p of requiredPaths) {
    assert.ok(blueprint.firestore[p], `Missing blueprint path ${p}`);
  }
});

test('Firestore rules enforce the Eight Pillars and Dirty Dozen defenses', () => {
  const rules = loadRulesText();
  assert.match(rules, /rules_version = '2';/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /isValidId\(/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\['full_name', 'bio', 'updatedAt'\]\)/);
  assert.match(rules, /match \/caseSolutions\/\{caseId\}[\s\S]*?allow get: if isValidId\(caseId\) && isAdmin\(\)/);
  assert.match(rules, /existing\(\)\.status == 'PUBLISHED' \|\| isAdmin\(\)/);
  assert.match(rules, /existing\(\)\.is_confidential == false/);
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/cases\/\$\(incoming\(\)\.case_id\)\)/);
  assert.match(rules, /incoming\(\)\.status == 'SUBMITTED'/);
});
