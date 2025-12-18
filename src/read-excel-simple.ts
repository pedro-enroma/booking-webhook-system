import * as XLSX from 'xlsx';
import * as path from 'path';

// Simple script to just read and display Excel contents
const excelPath = path.join(__dirname, '..', 'controll offers.xlsx');
console.log(`📂 Reading file: ${excelPath}\n`);

try {
  const workbook = XLSX.readFile(excelPath);
  console.log(`📄 Sheets found: ${workbook.SheetNames.join(', ')}\n`);

  workbook.SheetNames.forEach(sheetName => {
    console.log(`\n📋 Sheet: ${sheetName}`);
    console.log('─'.repeat(80));

    const worksheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(worksheet);

    console.log(`Total rows: ${data.length}`);

    if (data.length > 0) {
      console.log('\nColumns:', Object.keys(data[0]).join(', '));

      console.log('\nFirst 5 rows:');
      data.slice(0, 5).forEach((row, idx) => {
        console.log(`\n${idx + 1}.`, JSON.stringify(row, null, 2));
      });
    }
  });

  console.log('\n✅ Done!');
} catch (error) {
  console.error('❌ Error:', error);
}
