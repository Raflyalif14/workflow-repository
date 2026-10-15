'use strict';
// Local setup only. Does not capture faces, create credentials or contact auth.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), privateDir = path.join(root, '.private');
const required = [
  '.cache/face-pad-runtime-comparison/pyvenv.cfg',
  '.cache/face-pad-candidate/models/MiniFASNetV2.onnx',
  '.cache/face-pad-candidate/models/MiniFASNetV1SE.onnx',
  'services/face-experiment/models/face_recognition_sface_2021dec.onnx',
  'services/face-experiment/models/face_detection_yunet_2023mar.onnx',
];
if (required.some(file => !fs.existsSync(path.join(root,file)))) throw Error('Local face runtime/models must be prepared first. See docs/face-pad-candidate-2026-10-14.md.');
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
if (fs.lstatSync(privateDir).isSymbolicLink()) throw Error('Private directory must not be a symlink.');
if (process.platform === 'win32') {
  const principal = process.env.USERDOMAIN + '\\' + process.env.USERNAME;
  execFileSync('icacls.exe', [privateDir, '/inheritance:r', '/grant:r', principal + ':(OI)(CI)F', '*S-1-5-18:(OI)(CI)F'], { windowsHide: true, stdio: 'pipe' });
}
const keyPath = path.join(privateDir, 'face-login-key.bin');
if (!fs.existsSync(keyPath)) {
  const bytes = crypto.randomBytes(32);
  try { fs.writeFileSync(keyPath, bytes, { flag:'wx', mode:0o600 }); } finally { bytes.fill(0); }
}
if (fs.lstatSync(keyPath).isSymbolicLink() || fs.statSync(keyPath).size !== 32) throw Error('Invalid encryption key file; not replacing it.');
const envPath = path.join(root, 'backend/.env');
let envText = fs.readFileSync(envPath, 'utf8');
if (/^NODE_ENV=production\s*$/m.test(envText)) throw Error('Camera sign-in is limited to the local development installation.');
envText = /^FACE_LOGIN_ENABLED=/m.test(envText) ? envText.replace(/^FACE_LOGIN_ENABLED=.*$/m, 'FACE_LOGIN_ENABLED=true') : envText.trimEnd()+'\nFACE_LOGIN_ENABLED=true\n';
fs.writeFileSync(envPath, envText);
console.log('Local camera sign-in prepared. Encryption key preserved; private folder access restricted. Restart the backend to load the feature. No face was enrolled.');
