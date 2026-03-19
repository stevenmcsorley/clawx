console.log('process.argv:', process.argv);
console.log('argv[0]:', process.argv[0]);
console.log('argv[1]:', process.argv[1]);
console.log('__filename:', __filename);
console.log('__dirname:', __dirname);

// Try to get main module
if (require.main) {
  console.log('require.main.filename:', require.main.filename);
}