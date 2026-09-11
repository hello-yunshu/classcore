import process from 'node:process';
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  console.error(`D7 release gate FAILED: Apple Silicon macOS host required, got ${process.platform}/${process.arch}`);
  process.exit(1);
}
console.log('D7 host gate PASSED: macOS Apple Silicon');
