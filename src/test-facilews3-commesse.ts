import axios from 'axios';

async function testCommesse() {
  const facileUrl = 'https://facilews3.partnersolution.it';
  const agencyCode = '7206';
  const token = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9.eyJpYXQiOjE3Njc5NzM2NjIsImp0aSI6Ik5qazJNVEl6TVdWalpURXpPUT09IiwiaXNzIjpudWxsLCJuYmYiOjE3Njc5NzM2NzIsImV4cCI6MTc2ODA2MDA3MiwiZGF0YSI6eyJ1c2VySWQiOiJENjlERTRCMS00MEM0LTREREMtQTQ4My01MjY2ODg0MkJEQjkiLCJhY2NvdW50SWQiOiIyRDQ1RkE4Ri1EQTgwLTQxMjItQkQ4Ny04Nzg1OThCNkUwNzkiLCJ1c2VyTmFtZSI6ImFsYmVydG9AZW5yb21hLmNvbSIsInJ1b2xvIjoiMTAwIn19.9s2PO1Ics5d7b0upqVqK07rA_HohcfGIseKNUAsF6bFVBGko7LU8j1F7xjvjPFALRE0nHGqBE6_Wh_w1XSEwLQ';

  try {
    console.log('=== Testing FacileWS3 Commesse API ===\n');

    // List existing Commesse
    console.log('Listing Commesse...');
    try {
      const listResponse = await axios.get(
        `${facileUrl}/Api/Rest/${agencyCode}/Commesse`,
        { params: { Token: token } }
      );
      console.log('✅ Commesse list:');
      console.log(JSON.stringify(listResponse.data, null, 2));
    } catch (e: any) {
      console.log('List error:', e.response?.status, e.response?.data?.message || e.message);
      if (e.response?.data) {
        console.log('Response:', JSON.stringify(e.response.data, null, 2).substring(0, 500));
      }
    }

    // Try to create a new Commessa for February
    console.log('\nCreating Commessa 2026-02...');
    try {
      const createResponse = await axios.post(
        `${facileUrl}/Api/Rest/${agencyCode}/Commesse`,
        {
          CodiceCommessa: '2026-02',
          TitoloCommessa: 'Febbraio 2026',
          DescrizioneCommessa: 'Tour UE ed Extra UE - Febbraio 2026',
          ReferenteCommerciale: '',
          NoteInterne: ''
        },
        { 
          params: { Token: token },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      console.log('✅ Commessa created:');
      console.log(JSON.stringify(createResponse.data, null, 2));
    } catch (e: any) {
      console.log('Create error:', e.response?.status, e.response?.data?.message || e.message);
      if (e.response?.data) {
        console.log('Response:', JSON.stringify(e.response.data, null, 2).substring(0, 500));
      }
    }

  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testCommesse();
