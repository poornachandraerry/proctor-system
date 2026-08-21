require('dotenv').config();

// Run this once locally (node src/config/setup_spacebyte_folder.js) to create
// a dedicated folder in your SpaceByte account for exam evidence. Copy the
// printed folder ID into the SPACEBYTE_FOLDER_ID environment variable on
// your Render backend (optional — uploads work without it too, just land
// in the account root instead of a named folder).

const SPACEBYTE_BASE = 'https://spacebyte.in/api/v1';
const TOKEN = process.env.SPACEBYTE_API_TOKEN;

async function run() {
  if (!TOKEN) {
    console.error('❌ Set SPACEBYTE_API_TOKEN in your local .env first, then re-run.');
    process.exit(1);
  }
  try {
    const res = await fetch(`${SPACEBYTE_BASE}/folders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ProctorAI Evidence', parentId: null }),
    });
    const data = await res.json();
    if (!res.ok || !data.folder) {
      console.error('❌ Failed to create folder:', data);
      process.exit(1);
    }
    console.log('✅ Folder created!');
    console.log(`   Name: ${data.folder.name}`);
    console.log(`   ID:   ${data.folder.id}`);
    console.log('');
    console.log(`Set this on your Render backend's Environment tab:`);
    console.log(`   SPACEBYTE_FOLDER_ID=${data.folder.id}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();
