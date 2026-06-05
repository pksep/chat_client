const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const tagName = process.env.GITHUB_REF_NAME;
const version = tagName?.replace(/^v/, '');

if (!token || !repository || !tagName || !version) {
  throw new Error(
    'GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_REF_NAME are required'
  );
}

const apiBaseUrl = `https://api.github.com/repos/${repository}`;
const releaseAssetBaseUrl =
  `https://github.com/${repository}/releases/latest/download`;

const headers = {
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
  Accept: 'application/vnd.github+json'
};

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(
      `${options.method || 'GET'} ${url} failed: ` +
        `${response.status} ${await response.text()}`
    );
  }

  return response;
};

const getRelease = async () => {
  const response = await request(
    `${apiBaseUrl}/releases/tags/${encodeURIComponent(tagName)}`
  );

  return response.json();
};

const getAssets = async release => {
  const assets = [];
  let page = 1;

  while (true) {
    const response = await request(
      `${release.assets_url}?per_page=100&page=${page}`
    );
    const payload = await response.json();

    assets.push(...payload);

    if (payload.length < 100) {
      return assets;
    }

    page += 1;
  }
};

const getSignature = async asset => {
  const response = await request(asset.url, {
    headers: {
      Accept: 'application/octet-stream'
    }
  });

  return (await response.text()).trim();
};

const normalizeName = name => name.toLowerCase().replaceAll(' ', '-');

const getPlatformKey = name => {
  const normalized = normalizeName(name);

  if (normalized.endsWith('.exe') && normalized.includes('setup')) {
    return 'windows-x86_64';
  }

  if (normalized.endsWith('.appimage.tar.gz')) {
    return 'linux-x86_64';
  }

  if (normalized.endsWith('.app.tar.gz')) {
    if (normalized.includes('aarch64') || normalized.includes('arm64')) {
      return 'darwin-aarch64';
    }

    if (normalized.includes('x64') || normalized.includes('x86_64')) {
      return 'darwin-x86_64';
    }
  }

  return null;
};

const buildLatestJson = async assets => {
  const assetsByName = new Map(assets.map(asset => [asset.name, asset]));
  const platforms = {};

  for (const signatureAsset of assets.filter(asset =>
    asset.name.endsWith('.sig')
  )) {
    const bundleName = signatureAsset.name.slice(0, -4);
    const bundleAsset = assetsByName.get(bundleName);

    if (!bundleAsset) {
      continue;
    }

    const platformKey = getPlatformKey(bundleName);

    if (!platformKey || platforms[platformKey]) {
      continue;
    }

    platforms[platformKey] = {
      signature: await getSignature(signatureAsset),
      url: `${releaseAssetBaseUrl}/${encodeURIComponent(bundleName)}`
    };
  }

  if (!Object.keys(platforms).length) {
    throw new Error('No updater bundles with signatures were found');
  }

  return {
    version,
    notes: `SEP Chat ${tagName}`,
    pub_date: new Date().toISOString(),
    platforms
  };
};

const uploadLatestJson = async (release, latestJson, assets) => {
  const existingAsset = assets.find(asset => asset.name === 'latest.json');

  if (existingAsset) {
    await request(existingAsset.url, {
      method: 'DELETE'
    });
  }

  const uploadUrl = release.upload_url.replace('{?name,label}', '');
  const body = JSON.stringify(latestJson, null, 2);

  await request(`${uploadUrl}?name=latest.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body))
    },
    body
  });
};

const release = await getRelease();
const assets = await getAssets(release);
const latestJson = await buildLatestJson(assets);

await uploadLatestJson(release, latestJson, assets);

console.log(
  `Uploaded latest.json for ${Object.keys(latestJson.platforms).join(', ')}`
);
