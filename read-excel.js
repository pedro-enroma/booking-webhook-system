const XLSX = require('xlsx');
const path = require('path');

// Simple script to just read and display Excel contents
const excelPath = path.join(__dirname, 'controll offers.xlsx');
console.log(`📂 Reading file: ${excelPath}\n`);

try {
  const workbook = XLSX.readFile(excelPath);
  console.log(`📄 Sheets found: ${workbook.SheetNames.join(', ')}\n`);

  workbook.SheetNames.forEach(sheetName => {
    console.log(`\n📋 Sheet: ${sheetName}`);
    console.log('─'.repeat(80));

    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Total rows: ${data.length}`);

    if (data.length > 0) {
      console.log('\nColumns:', Object.keys(data[0]).join(', '));

      console.log('\nFirst 10 rows:');
      data.slice(0, 10).forEach((row, idx) => {
        console.log(`\n${idx + 1}.`, JSON.stringify(row, null, 2));
      });
    }
  });

  console.log('\n✅ Done!');
  process.exit(0);
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
