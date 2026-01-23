import axios from 'axios';

async function testFacileLogin() {
  const loginUrl = 'https://facilews.partnersolution.it/login.php';
  const username = 'alberto@enroma.com';
  const password = 'InSpe2026!';

  try {
    console.log('=== Testing FacileWS Login ===\n');
    console.log('Endpoint:', loginUrl);
    console.log('Username:', username);

    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);

    const response = await axios.post(loginUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('\n✅ Login successful!');
    console.log('JWT (first 100 chars):', response.data.jwt?.substring(0, 100) + '...');
    console.log('Full name:', response.data.fullname);
    console.log('Email:', response.data.email);
    console.log('ID:', response.data.id);

    // Now test the Commesse API with this token
    console.log('\n\n=== Testing Commesse API with new token ===');
    const facileUrl = 'https://facilews3.partnersolution.it';
    const agencyCode = '7206';
    const token = response.data.jwt;

    const listResponse = await axios.get(
      `${facileUrl}/Api/Rest/${agencyCode}/Commesse`,
      { params: { Token: token } }
    );
    console.log('✅ Commesse list:');
    console.log(JSON.stringify(listResponse.data, null, 2));

  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testFacileLogin();
