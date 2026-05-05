const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://lhxgohcxcslbtnuubrsg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoeGdvaGN4Y3NsYnRudXVicnNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTMyMjgwOSwiZXhwIjoyMDkwODk4ODA5fQ.Iz07eHk5x5IostQk7aKd04y8azhVYoP8i4fH8n_Djx8";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const filename = "590ded22-9f0c-4a2d-a6cd-6fe88c998c41_1777910402325.jpeg";
  const { data, error } = await supabase.storage.from('avatars').list('', { search: filename });
  
  if (error) {
    console.error(error);
    return;
  }
  console.log('FILE EXISTS IN STORAGE:', data.some(f => f.name === filename));
  console.log('ALL FILES:', JSON.stringify(data, null, 2));
}

check();
