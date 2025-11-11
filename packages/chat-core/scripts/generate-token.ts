async function getAdminToken() {
  const res = await fetch('http://localhost:10023/auth/get_admin_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      operationID: `${Date.now()}`
    },
    body: JSON.stringify({
      secret: 'openIM123', // your OpenIM server secret
      userID: 'imAdmin' // default admin user
    })
  });

  const data = await res.json();
  console.log('Admin token response:', data);

  // Extract token depending on response structure
  return data?.data?.token || data?.token;
}

(async () => {
  try {
    const adminToken = await getAdminToken();
    console.log('✅ Admin token:', adminToken);
  } catch (err) {
    console.error('❌ Error fetching token:', err);
  }
})();
