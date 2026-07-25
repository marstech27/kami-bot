require('dotenv').config();
const { getDriveStructure, searchFiles } = require('./lib/googleDrive');

(async () => {
  try {
    console.log('Checking Drive connection with folder:', process.env.DRIVE_MAIN_FOLDER_ID);
    const files = await getDriveStructure(true);
    console.log('SUCCESS! Drive connected.');
    console.log('Total files found:', files.length);
    if (files.length > 0) {
      console.log('\nFirst 10 files:');
      files.slice(0,10).forEach(f => {
        const size = f.size ? (f.size/1024/1024).toFixed(1)+' MB' : 'N/A';
        console.log(' -', f.name, '|', size, '|', f.path || '(root)');
      });
      console.log('\nSearch test for "mid":');
      const test = await searchFiles('mid');
      console.log('   Results:', test.length);
      test.slice(0,5).forEach(f => console.log('   ->', f.name));
    } else {
      console.log('No files found. Check:');
      console.log('   1. Folder share kiya hai drive-bot@marsfile.iam.gserviceaccount.com ko?');
      console.log('   2. Folder ID correct hai?');
      console.log('   3. Folder mein files hain?');
    }
  } catch (e) {
    console.log('Drive ERROR:', e.message);
    console.log('\nCommon fixes:');
    console.log('   1. Google Drive mein uss folder ko SHARE karein is email ke saath (Viewer access):');
    console.log('      drive-bot@marsfile.iam.gserviceaccount.com');
    console.log('   2. Folder ID double-check karein');
    console.log('   3. Internet check karein');
  }
})();
