import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCaseForPublish,
  canTransitionCaseStatus,
  isPlayerEligibleForCase,
  validateUploadFile,
  validateModel3DPayload,
  validateEmailAndPassword,
  slugifyCaseTitle,
} from './validation';

test('validateCaseForPublish rejects incomplete cases', () => {
  const res = validateCaseForPublish({
    case_code: 'CASE-01',
    title: 'Sample',
    short_description: 'Too short',
    full_story: 'Short',
    institution_id: null,
    region_id: null,
    difficulty: 'STANDARD',
    estimated_duration: '45m',
    player_tasks: [],
    evaluation_criteria: [],
    chaptersCount: 0,
    evidenceCount: 0,
    hasMasterSolution: false,
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.length >= 6);
});

test('validateCaseForPublish accepts complete validated case', () => {
  const res = validateCaseForPublish({
    case_code: 'AP-DHK-001',
    title: 'Midnight Signal at Sadarghat',
    short_description: 'A missing cargo manifest leads investigators along the Buriganga.',
    full_story:
      'At 02:14 AM, port security reported an irregular customs seal near Terminal 4.',
    institution_id: 1,
    region_id: 1,
    difficulty: 'STANDARD',
    estimated_duration: '60 mins',
    player_tasks: ['Identify the forged customs seal'],
    evaluation_criteria: ['Correctly link manifest discrepancies to dock logs'],
    chaptersCount: 1,
    evidenceCount: 2,
    hasMasterSolution: true,
    masterSolutionText: 'The night shift supervisor altered manifest #44B.',
  });
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);

  const numericDuration = validateCaseForPublish({
    case_code: 'AP-DHK-001',
    title: 'Midnight Signal at Sadarghat',
    short_description: 'A missing cargo manifest leads investigators along the Buriganga.',
    full_story:
      'At 02:14 AM, port security reported an irregular customs seal near Terminal 4.',
    institution_id: 1,
    region_id: 1,
    difficulty: 'STANDARD',
    estimated_duration: '5',
    player_tasks: ['Identify the forged customs seal'],
    evaluation_criteria: ['Correctly link manifest discrepancies to dock logs'],
    chaptersCount: 1,
    evidenceCount: 2,
    hasMasterSolution: true,
    masterSolutionText: 'The night shift supervisor altered manifest #44B.',
  });
  assert.equal(numericDuration.valid, true);
});

test('canTransitionCaseStatus restricts archived direct publish', () => {
  assert.equal(canTransitionCaseStatus('DRAFT', 'PUBLISHED'), true);
  assert.equal(canTransitionCaseStatus('ARCHIVED', 'PUBLISHED'), false);
  assert.equal(canTransitionCaseStatus('ARCHIVED', 'DRAFT'), true);
});

test('isPlayerEligibleForCase enforces institutional tier and rank', () => {
  assert.equal(isPlayerEligibleForCase('AURVAN_POLICE', 1, 'AURVAN_POLICE', 1).eligible, true);
  assert.equal(isPlayerEligibleForCase('AURVAN_POLICE', 4, 'SAB', 1).eligible, false);
  assert.equal(isPlayerEligibleForCase('SAB', 2, 'AURVAN_POLICE', 3).eligible, true);
  assert.equal(isPlayerEligibleForCase('SIA', 1, 'SIA', 2).eligible, false);
});

test('validateUploadFile validates mime, extension, and size limits', () => {
  assert.equal(validateUploadFile('image', 'image/png', 1024, 'logo.png').valid, true);
  assert.equal(validateUploadFile('image', 'application/x-msdownload', 1024, 'bad.exe').valid, false);
  assert.equal(validateUploadFile('document', 'application/pdf', 500000, 'brief.pdf').valid, true);
  assert.equal(validateUploadFile('audio', 'audio/mpeg', 2000000, 'wiretap.mp3').valid, true);
  assert.equal(validateUploadFile('image', 'image/jpeg', 25 * 1024 * 1024, 'huge.jpg').valid, false);
  assert.equal(validateUploadFile('model3d', 'model/gltf-binary', 1024 * 1024, 'evidence.glb').valid, true);
  assert.equal(validateUploadFile('model3d', 'application/octet-stream', 1024, 'fake.exe').valid, false);
});

test('validateModel3DPayload validates GLB binary headers and GLTF JSON schemas', () => {
  const validGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
  const invalidGlb = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(validateModel3DPayload(validGlb, 'GLB').valid, true);
  assert.equal(validateModel3DPayload(invalidGlb, 'GLB').valid, false);

  const validGltf = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' } }));
  const invalidGltf = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
  assert.equal(validateModel3DPayload(validGltf, 'GLTF').valid, true);
  assert.equal(validateModel3DPayload(invalidGltf, 'GLTF').valid, false);
});

test('validateEmailAndPassword and slugifyCaseTitle work properly', () => {
  assert.equal(validateEmailAndPassword('agent@aurvan.org', 'SecurePass1').valid, true);
  assert.equal(validateEmailAndPassword('invalid', '123').valid, false);
  assert.equal(slugifyCaseTitle('The Dhaka Cipher: Chapter 1!'), 'the-dhaka-cipher-chapter-1');
});
